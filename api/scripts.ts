import { randomUUID } from 'node:crypto';
import { db, toNumber } from './_lib/db.js';
import { requireMember, requireOwner, requireRoomAccess, requireWriter, type Writer } from './_lib/auth.js';
import { HttpError, assertSameOrigin, cleanText, handle, json, readJson, requireUuid } from './_lib/http.js';
import { cleanMeta, sceneRecords, toSceneRow } from './_lib/scenes.js';
import type { LibraryResponse, RoomScript, SceneData, ScriptMeta } from './_lib/types.js';

interface ScriptsBody {
  action: 'create' | 'delete';
  id: string;
  roomId: string;
  title: string;
  meta: ScriptMeta;
  scenes: SceneData[];
}

/**
 * Scripts (with their scenes, in order) the writer can open on this device,
 * optionally just one. Shared rooms' scripts need a device confirmation.
 */
async function loadScripts(me: Writer, scriptId?: string): Promise<RoomScript[]> {
  const sql = db();
  const onlyOne = scriptId ?? null;
  const [scripts, scenes] = await sql.transaction(
    [
      sql`
        select s.id, s.room_id, s.title, s.meta, s.version
        from scripts s
        join room_members m on m.room_id = s.room_id and m.writer_id = ${me.id}
        join rooms r on r.id = s.room_id
        where (${onlyOne}::uuid is null or s.id = ${onlyOne}::uuid)
          and (r.personal or ${me.roomVerified}::boolean)
        order by s.updated_at desc
      `,
      sql`
        select c.script_id, c.id, c.title, c.slugline, c.synopsis, c.content_html, c.version
        from scenes c
        join scripts s on s.id = c.script_id
        join room_members m on m.room_id = s.room_id and m.writer_id = ${me.id}
        join rooms r on r.id = s.room_id
        where not c.deleted and (${onlyOne}::uuid is null or c.script_id = ${onlyOne}::uuid)
          and (r.personal or ${me.roomVerified}::boolean)
        order by c.script_id, c.position, c.updated_at, c.id
      `,
    ],
    { readOnly: true }
  );
  return scripts.map((script) => ({
    id: String(script.id),
    roomId: String(script.room_id),
    title: String(script.title),
    meta: (script.meta ?? {}) as ScriptMeta,
    version: toNumber(script.version),
    scenes: scenes.filter((scene) => scene.script_id === script.id).map(toSceneRow),
  }));
}

/**
 * GET /api/scripts?id=… : one script, for opening it.
 * GET /api/scripts : every script in the writer's rooms, for a new device.
 */
export function GET(request: Request) {
  return handle(async () => {
    const me = await requireWriter(request);
    const id = new URL(request.url).searchParams.get('id');
    if (id === null) {
      const locked = me.roomVerified
        ? []
        : await db()`
            select r.id from room_members m join rooms r on r.id = m.room_id
            where m.writer_id = ${me.id} and not r.personal
          `;
      const library: LibraryResponse = {
        scripts: await loadScripts(me),
        lockedRoomIds: locked.map((row) => String(row.id)),
      };
      return json(library);
    }
    const scriptId = requireUuid(id, 'script');
    const [script] = await loadScripts(me, scriptId);
    if (!script) {
      // Say why when it's a shared room waiting for a device confirmation
      const [row] = await db()`
        select s.room_id from scripts s
        join room_members m on m.room_id = s.room_id and m.writer_id = ${me.id}
        where s.id = ${scriptId}
      `;
      if (row) requireRoomAccess(me, await requireMember(me, String(row.room_id)));
      throw new HttpError(404, 'This script is no longer in any of your rooms.');
    }
    return json(script);
  });
}

export function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const me = await requireWriter(request);
    const body = await readJson<ScriptsBody>(request);
    const sql = db();

    switch (body.action) {
      case 'create': {
        const member = await requireMember(me, requireUuid(body.roomId, 'room'));
        requireRoomAccess(me, member);
        const id = randomUUID();
        const title = cleanText(body.title, 300);
        const scenes = sceneRecords(body.scenes).map((scene, position) => ({ ...scene, position }));
        await sql.transaction([
          sql`
            insert into scripts (id, room_id, title, meta)
            values (${id}, ${member.roomId}, ${title}, ${JSON.stringify(cleanMeta(body.meta))}::jsonb)
          `,
          sql`
            insert into scenes (script_id, id, position, title, slugline, synopsis, content_html, updated_by)
            select ${id}, s.id, s.position, s.title, s.slugline, s.synopsis, s.content_html, ${me.id}
            from jsonb_to_recordset(${JSON.stringify(scenes)}::jsonb)
              as s(id text, position int, title text, slugline text, synopsis text, content_html text)
          `,
        ]);
        const [script] = await loadScripts(me, id);
        return json(script, { status: 201 });
      }

      case 'delete': {
        const id = requireUuid(body.id, 'script');
        const [script] = await sql`select room_id from scripts where id = ${id}`;
        if (!script) return json({ ok: true });
        const member = await requireMember(me, String(script.room_id));
        requireRoomAccess(me, member);
        requireOwner(member);
        await sql`delete from scripts where id = ${id}`;
        return json({ ok: true });
      }

      default:
        throw new HttpError(400, 'Unknown action.');
    }
  });
}
