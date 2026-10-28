import { db } from './_lib/db.js';
import {
  generateInviteCode,
  requireMember,
  requireOwner,
  requireRoomAccess,
  requireWriter,
  toRoomWriter,
} from './_lib/auth.js';
import { HttpError, assertSameOrigin, cleanText, handle, json, readJson, requireUuid } from './_lib/http.js';
import { MAX_WRITERS_PER_ROOM, type RoomDetails } from './_lib/types.js';

interface RoomBody {
  roomId: string;
  action: 'rename' | 'new-invite' | 'remove-writer' | 'leave';
  name: string;
  writerId: string;
}

/** GET /api/room?id=… : a room's writers and scripts. */
export function GET(request: Request) {
  return handle(async () => {
    const me = await requireWriter(request);
    const roomId = requireUuid(new URL(request.url).searchParams.get('id'), 'room');
    const member = await requireMember(me, roomId);
    requireRoomAccess(me, member);
    const sql = db();
    const [writers, scripts] = await sql.transaction(
      [
        sql`
          select w.id, w.name, m.role, m.color
          from room_members m join writers w on w.id = m.writer_id
          where m.room_id = ${roomId}
          order by m.joined_at
        `,
        sql`
          select s.id, s.title, s.updated_at,
            (select count(*) from scenes c where c.script_id = s.id and not c.deleted)::int as scene_count
          from scripts s
          where s.room_id = ${roomId}
          order by s.updated_at desc
        `,
      ],
      { readOnly: true }
    );
    const details: RoomDetails = {
      me: { id: me.id, name: me.name, role: member.role, color: member.color },
      room: {
        id: member.roomId,
        name: member.roomName,
        personal: member.personal,
        inviteCode: member.personal ? null : member.inviteCode,
        maxWriters: member.personal ? 1 : MAX_WRITERS_PER_ROOM,
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
    const body = await readJson<RoomBody>(request);
    const member = await requireMember(me, requireUuid(body.roomId, 'room'));
    // Leaving needs no confirmation; changing the room does
    if (body.action !== 'leave') requireRoomAccess(me, member);
    const sql = db();

    switch (body.action) {
      case 'rename': {
        requireOwner(member);
        const name = cleanText(body.name, 60);
        if (!name) throw new HttpError(400, 'Enter a room name.');
        await sql`update rooms set name = ${name} where id = ${member.roomId}`;
        return json({ ok: true });
      }

      case 'new-invite': {
        requireOwner(member);
        if (member.personal) throw new HttpError(400, 'Your own scripts can’t be shared with an invite code.');
        // The old code stops working immediately
        const inviteCode = generateInviteCode();
        await sql`update rooms set invite_code = ${inviteCode} where id = ${member.roomId}`;
        return json({ inviteCode });
      }

      case 'remove-writer': {
        requireOwner(member);
        const writerId = requireUuid(body.writerId, 'writer');
        if (writerId === me.id) throw new HttpError(400, 'You can’t remove yourself from your own room.');
        // Their holds and presence in this room's scripts go with them
        await sql.transaction([
          sql`
            delete from scene_locks
            where writer_id = ${writerId} and script_id in (select id from scripts where room_id = ${member.roomId})
          `,
          sql`
            delete from presence
            where writer_id = ${writerId} and script_id in (select id from scripts where room_id = ${member.roomId})
          `,
          sql`delete from room_members where room_id = ${member.roomId} and writer_id = ${writerId}`,
        ]);
        return json({ ok: true });
      }

      case 'leave': {
        if (member.role === 'owner') {
          throw new HttpError(400, 'You started this room, so you can’t leave it. Remove the other writers instead.');
        }
        await sql`delete from room_members where room_id = ${member.roomId} and writer_id = ${me.id}`;
        return json({ ok: true });
      }

      default:
        throw new HttpError(400, 'Unknown action.');
    }
  });
}
