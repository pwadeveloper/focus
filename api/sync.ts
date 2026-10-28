import { db, toNumber } from './_lib/db.js';
import { requireMember, requireRoomAccess, requireWriter, toRoomWriter } from './_lib/auth.js';
import { HttpError, assertSameOrigin, cleanText, handle, json, readJson, requireUuid } from './_lib/http.js';
import { cleanMeta, sceneRecords, toSceneRow } from './_lib/scenes.js';
import type { SyncRequest, SyncResponse } from './_lib/types.js';

/** A lock outlives its last heartbeat by this long (clients sync every 2–10s). */
const LOCK_SECONDS = 30;

const idList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string').map((id) => id.slice(0, 100)).slice(0, 1000)
    : [];

/**
 * One round trip per poll: hold or release the writer's scene lock, apply
 * their changes, record where they are, and return everything that changed
 * since the versions they already have.
 */
export function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const me = await requireWriter(request);
    const body = await readJson<SyncRequest>(request);
    const scriptId = requireUuid(body.scriptId, 'script');
    // A random id per tab; holds and presence belong to a tab, not just a writer
    const clientId = cleanText(body.clientId, 64);
    if (!clientId) throw new HttpError(400, 'Missing client id.');
    const sql = db();

    const [script] = await sql`
      select s.room_id from scripts s
      join room_members m on m.room_id = s.room_id and m.writer_id = ${me.id}
      where s.id = ${scriptId}
    `;
    if (!script) throw new HttpError(404, 'This script is no longer in any of your rooms.');
    const roomId = String(script.room_id);
    requireRoomAccess(me, await requireMember(me, roomId));

    if (body.leave) {
      await sql.transaction([
        sql`delete from scene_locks where writer_id = ${me.id} and client_id = ${clientId} and script_id = ${scriptId}`,
        sql`delete from presence where writer_id = ${me.id} and client_id = ${clientId}`,
      ]);
      return json({ ok: true });
    }

    const sceneId = typeof body.sceneId === 'string' ? body.sceneId.slice(0, 100) : null;
    const wantLock = Boolean(body.wantLock && sceneId);
    const changes = body.changes ?? {};
    const scenes = sceneRecords(changes.scenes);
    const deleted = idList(changes.deleted);
    const order = idList(changes.order);
    const hasMeta = typeof changes.title === 'string' || changes.meta !== undefined;

    // Writes run in order inside one transaction; remember where each result lands
    const writes = [];
    let lockIndex = -1;
    let upsertIndex = -1;
    let deleteIndex = -1;
    let metaIndex = -1;

    if (wantLock) {
      // Take the scene if it's free, already ours, or its holder went quiet
      lockIndex = writes.push(sql`
        insert into scene_locks (script_id, scene_id, writer_id, client_id, expires_at)
        values (${scriptId}, ${sceneId}, ${me.id}, ${clientId}, now() + make_interval(secs => ${LOCK_SECONDS}::int))
        on conflict (script_id, scene_id) do update
          set writer_id = excluded.writer_id, client_id = excluded.client_id, expires_at = excluded.expires_at
          where (scene_locks.writer_id = excluded.writer_id and scene_locks.client_id = excluded.client_id)
            or scene_locks.expires_at < now()
        returning writer_id
      `) - 1;
      writes.push(sql`
        delete from scene_locks
        where writer_id = ${me.id} and client_id = ${clientId}
          and not (script_id = ${scriptId} and scene_id = ${sceneId})
      `);
    } else {
      writes.push(sql`delete from scene_locks where writer_id = ${me.id} and client_id = ${clientId}`);
    }

    if (scenes.length > 0) {
      // Writes to a scene someone else holds are refused (they come back as `rejected`)
      upsertIndex = writes.push(sql`
        insert into scenes (script_id, id, position, title, slugline, synopsis, content_html, updated_by, version)
        select ${scriptId}, s.id,
          (select coalesce(max(position), -1) + 1 from scenes where script_id = ${scriptId}),
          s.title, s.slugline, s.synopsis, s.content_html, ${me.id}, nextval('change_seq')
        from jsonb_to_recordset(${JSON.stringify(scenes)}::jsonb)
          as s(id text, title text, slugline text, synopsis text, content_html text)
        where not exists (
          select 1 from scene_locks l
          where l.script_id = ${scriptId} and l.scene_id = s.id and l.expires_at > now()
            and (l.writer_id <> ${me.id} or l.client_id <> ${clientId})
        )
        on conflict (script_id, id) do update set
          title = excluded.title,
          slugline = excluded.slugline,
          synopsis = excluded.synopsis,
          content_html = excluded.content_html,
          deleted = false,
          updated_by = excluded.updated_by,
          updated_at = now(),
          version = excluded.version
        returning id, version
      `) - 1;
    }

    if (deleted.length > 0) {
      deleteIndex = writes.push(sql`
        update scenes set deleted = true, version = nextval('change_seq'), updated_by = ${me.id}, updated_at = now()
        where script_id = ${scriptId} and id = any(${deleted}::text[]) and not deleted
          and not exists (
            select 1 from scene_locks l
            where l.script_id = scenes.script_id and l.scene_id = scenes.id and l.expires_at > now()
              and (l.writer_id <> ${me.id} or l.client_id <> ${clientId})
          )
        returning id
      `) - 1;
    }

    if (order.length > 0) {
      writes.push(sql`
        update scenes s set position = (o.ord - 1)::int
        from unnest(${order}::text[]) with ordinality as o(id, ord)
        where s.script_id = ${scriptId} and s.id = o.id and s.position <> (o.ord - 1)::int
      `);
    }

    if (hasMeta) {
      const title = typeof changes.title === 'string' ? cleanText(changes.title, 300) : null;
      const meta = changes.meta === undefined ? null : JSON.stringify(cleanMeta(changes.meta));
      metaIndex = writes.push(sql`
        update scripts
        set title = coalesce(${title}, title),
          meta = coalesce(${meta}::jsonb, meta),
          version = nextval('change_seq'),
          updated_at = now()
        where id = ${scriptId}
        returning version
      `) - 1;
    } else if (scenes.length > 0 || deleted.length > 0 || order.length > 0) {
      writes.push(sql`update scripts set updated_at = now() where id = ${scriptId}`);
    }

    writes.push(sql`
      insert into presence (writer_id, client_id, script_id, scene_id, seen_at)
      values (${me.id}, ${clientId}, ${scriptId}, ${sceneId}, now())
      on conflict (writer_id, client_id) do update
        set script_id = excluded.script_id, scene_id = excluded.scene_id, seen_at = now()
    `);

    const results = await sql.transaction(writes);

    const lockHeld = lockIndex >= 0 && results[lockIndex].length > 0;
    const saved: Record<string, number> = {};
    if (upsertIndex >= 0) {
      for (const row of results[upsertIndex]) saved[String(row.id)] = toNumber(row.version);
    }
    const deletedNow = new Set(deleteIndex >= 0 ? results[deleteIndex].map((row) => String(row.id)) : []);
    const rejected = [
      ...scenes.map((scene) => String(scene.id)).filter((id) => !(id in saved)),
      ...deleted.filter((id) => !deletedNow.has(id)),
    ];
    const savedScriptVersion = metaIndex >= 0 ? toNumber(results[metaIndex][0]?.version) : null;

    // The writer already has what they just saved; refused writes come back so they can revert
    const known = { ...(body.known ?? {}), ...saved };
    const knownScriptVersion = savedScriptVersion ?? toNumber(body.knownScriptVersion);

    const [orderRows, changedRows, scriptRows, locks, presence, writers] = await sql.transaction(
      [
        sql`
          select id from scenes
          where script_id = ${scriptId} and not deleted
          order by position, updated_at, id
        `,
        sql`
          select id, title, slugline, synopsis, content_html, version from scenes
          where script_id = ${scriptId} and not deleted
            and (coalesce((${JSON.stringify(known)}::jsonb ->> id)::bigint, -1) <> version
              or id = any(${rejected}::text[]))
        `,
        sql`select title, meta, version from scripts where id = ${scriptId} and version <> ${knownScriptVersion}::bigint`,
        sql`select scene_id, writer_id, client_id from scene_locks where script_id = ${scriptId} and expires_at > now()`,
        sql`
          select writer_id, client_id, scene_id from presence
          where script_id = ${scriptId} and seen_at > now() - make_interval(secs => ${LOCK_SECONDS}::int)
        `,
        sql`
          select w.id, w.name, m.role, m.color
          from room_members m join writers w on w.id = m.writer_id
          where m.room_id = ${roomId}
          order by m.joined_at
        `,
      ],
      { readOnly: true }
    );

    const response: SyncResponse = {
      order: orderRows.map((row) => String(row.id)),
      scenes: changedRows.map(toSceneRow),
      saved,
      rejected,
      script: scriptRows[0]
        ? {
            title: String(scriptRows[0].title),
            meta: (scriptRows[0].meta ?? {}) as Record<string, unknown>,
            version: toNumber(scriptRows[0].version),
          }
        : null,
      savedScriptVersion,
      locks: locks.map((row) => ({
        sceneId: String(row.scene_id),
        writerId: String(row.writer_id),
        clientId: String(row.client_id),
      })),
      presence: presence.map((row) => ({
        writerId: String(row.writer_id),
        clientId: String(row.client_id),
        sceneId: (row.scene_id as string | null) ?? null,
      })),
      writers: writers.map(toRoomWriter),
      lockHeld,
    };
    return json(response);
  });
}
