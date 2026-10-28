import { randomUUID } from 'node:crypto';
import { db, toNumber } from './_lib/db.js';
import { requireOwner, requireWriter } from './_lib/auth.js';
import { HttpError, assertSameOrigin, cleanText, handle, json, readJson, requireUuid } from './_lib/http.js';
import { cleanMeta, sceneRecords, toSceneRow } from './_lib/scenes.js';
import type { RoomScript, SceneData, ScriptMeta } from './_lib/types.js';

interface ScriptsBody {
  action: 'create' | 'delete';
  id: string;
  title: string;
  meta: ScriptMeta;
  scenes: SceneData[];
}

async function loadScript(scriptId: string, roomId: string): Promise<RoomScript> {
  const sql = db();
  const [[script], scenes] = await sql.transaction(
    [
      sql`select id, title, meta, version from scripts where id = ${scriptId} and room_id = ${roomId}`,
      sql`
        select id, title, slugline, synopsis, content_html, version from scenes
        where script_id = ${scriptId} and not deleted
        order by position, updated_at, id
      `,
    ],
    { readOnly: true }
  );
  if (!script) throw new HttpError(404, 'This script is no longer in your writers room.');
  return {
    id: String(script.id),
    title: String(script.title),
    meta: (script.meta ?? {}) as ScriptMeta,
    version: toNumber(script.version),
    scenes: scenes.map(toSceneRow),
  };
}

/** GET /api/scripts?id=… : the whole script, for opening it. */
export function GET(request: Request) {
  return handle(async () => {
    const me = await requireWriter(request);
    const id = requireUuid(new URL(request.url).searchParams.get('id'), 'script');
    return json(await loadScript(id, me.roomId));
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
        const id = randomUUID();
        const title = cleanText(body.title, 300);
        const scenes = sceneRecords(body.scenes).map((scene, position) => ({ ...scene, position }));
        await sql.transaction([
          sql`
            insert into scripts (id, room_id, title, meta)
            values (${id}, ${me.roomId}, ${title}, ${JSON.stringify(cleanMeta(body.meta))}::jsonb)
          `,
          sql`
            insert into scenes (script_id, id, position, title, slugline, synopsis, content_html, updated_by)
            select ${id}, s.id, s.position, s.title, s.slugline, s.synopsis, s.content_html, ${me.id}
            from jsonb_to_recordset(${JSON.stringify(scenes)}::jsonb)
              as s(id text, position int, title text, slugline text, synopsis text, content_html text)
          `,
        ]);
        return json(await loadScript(id, me.roomId), { status: 201 });
      }

      case 'delete': {
        requireOwner(me);
        const id = requireUuid(body.id, 'script');
        await sql`delete from scripts where id = ${id} and room_id = ${me.roomId}`;
        return json({ ok: true });
      }

      default:
        throw new HttpError(400, 'Unknown action.');
    }
  });
}
