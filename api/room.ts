import { db } from './_lib/db.js';
import {
  generateInviteCode,
  generatePasskey,
  hashPasskey,
  requireOwner,
  requireWriter,
  toRoomWriter,
} from './_lib/auth.js';
import { HttpError, assertSameOrigin, cleanText, handle, json, readJson, requireUuid } from './_lib/http.js';
import { MAX_WRITERS_PER_ROOM, type RoomDetails } from './_lib/types.js';

interface RoomBody {
  action: 'rename' | 'new-invite' | 'reissue-passkey' | 'remove-writer';
  name: string;
  writerId: string;
}

/** The room, its writers and its scripts. */
export function GET(request: Request) {
  return handle(async () => {
    const me = await requireWriter(request);
    const sql = db();
    const [[room], writers, scripts] = await sql.transaction(
      [
        sql`select id, name, invite_code from rooms where id = ${me.roomId}`,
        sql`select id, name, role, color from writers where room_id = ${me.roomId} order by created_at`,
        sql`
          select s.id, s.title, s.updated_at,
            (select count(*) from scenes c where c.script_id = s.id and not c.deleted)::int as scene_count
          from scripts s
          where s.room_id = ${me.roomId}
          order by s.updated_at desc
        `,
      ],
      { readOnly: true }
    );
    const details: RoomDetails = {
      me: { id: me.id, name: me.name, role: me.role, color: me.color },
      room: {
        id: String(room.id),
        name: String(room.name),
        inviteCode: String(room.invite_code),
        maxWriters: MAX_WRITERS_PER_ROOM,
      },
      writers: writers.map(toRoomWriter),
      scripts: scripts.map((s) => ({
        id: String(s.id),
        title: String(s.title),
        sceneCount: Number(s.scene_count),
        updatedAt: new Date(s.updated_at as string).toISOString(),
      })),
    };
    return json(details);
  });
}

export function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const me = await requireWriter(request);
    requireOwner(me);
    const body = await readJson<RoomBody>(request);
    const sql = db();

    switch (body.action) {
      case 'rename': {
        const name = cleanText(body.name, 60);
        if (!name) throw new HttpError(400, 'Enter a room name.');
        await sql`update rooms set name = ${name} where id = ${me.roomId}`;
        return json({ ok: true });
      }

      case 'new-invite': {
        // The old code stops working immediately
        const inviteCode = generateInviteCode();
        await sql`update rooms set invite_code = ${inviteCode} where id = ${me.roomId}`;
        return json({ inviteCode });
      }

      case 'reissue-passkey': {
        const writerId = requireUuid(body.writerId, 'writer');
        const passkey = generatePasskey();
        const [writer] = await sql`
          update writers set passkey_hash = ${hashPasskey(passkey)}
          where id = ${writerId} and room_id = ${me.roomId}
          returning id
        `;
        if (!writer) throw new HttpError(404, 'That writer is no longer in this room.');
        // Signs them out everywhere, except this device when it's your own passkey
        await sql`
          delete from sessions where writer_id = ${writerId} and token_hash <> ${me.sessionHash}
        `;
        return json({ passkey });
      }

      case 'remove-writer': {
        const writerId = requireUuid(body.writerId, 'writer');
        if (writerId === me.id) throw new HttpError(400, 'You can’t remove yourself from your own room.');
        // Their sessions, locks and presence go with them
        await sql`delete from writers where id = ${writerId} and room_id = ${me.roomId}`;
        return json({ ok: true });
      }

      default:
        throw new HttpError(400, 'Unknown action.');
    }
  });
}
