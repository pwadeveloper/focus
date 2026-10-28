import { randomUUID } from 'node:crypto';
import { db } from './_lib/db.js';
import {
  WRITER_COLORS,
  clearSessionCookie,
  createSession,
  findWriter,
  generateInviteCode,
  generatePasskey,
  hashPasskey,
  isUniqueViolation,
  normalizeCode,
  sessionPayload,
  toRoomWriter,
  type Writer,
} from './_lib/auth.js';
import { HttpError, assertSameOrigin, cleanText, handle, json, readJson } from './_lib/http.js';
import { MAX_WRITERS_PER_ROOM } from './_lib/types.js';

interface AuthBody {
  action: 'create-room' | 'join' | 'sign-in' | 'sign-out';
  roomName: string;
  name: string;
  inviteCode: string;
  passkey: string;
}

const requireName = (value: unknown) => {
  const name = cleanText(value, 40);
  if (!name) throw new HttpError(400, 'Enter your name.');
  return name;
};

/** The signed-in writer, or null (a normal state, so not an error status). */
export function GET(request: Request) {
  return handle(async () => {
    const writer = await findWriter(request);
    return json(writer ? sessionPayload(writer) : null);
  });
}

export function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readJson<AuthBody>(request);
    const sql = db();

    switch (body.action) {
      case 'create-room': {
        const name = requireName(body.name);
        const roomName = cleanText(body.roomName, 60) || `${name}’s room`;
        const passkey = generatePasskey();
        const roomId = randomUUID();
        const writerId = randomUUID();
        await sql.transaction([
          sql`insert into rooms (id, name, invite_code) values (${roomId}, ${roomName}, ${generateInviteCode()})`,
          sql`
            insert into writers (id, room_id, name, passkey_hash, role, color)
            values (${writerId}, ${roomId}, ${name}, ${hashPasskey(passkey)}, 'owner', ${WRITER_COLORS[0]})
          `,
        ]);
        const writer: Writer = {
          id: writerId, name, role: 'owner', color: WRITER_COLORS[0],
          roomId, roomName, sessionHash: '',
        };
        const cookie = await createSession(request, writerId);
        return json(sessionPayload(writer, passkey), { status: 201, cookies: [cookie] });
      }

      case 'join': {
        const name = requireName(body.name);
        const invite = normalizeCode(String(body.inviteCode ?? ''));
        if (!invite) throw new HttpError(400, 'Enter the invite code from your room.');
        const [room] = await sql`
          select r.id, r.name, (select count(*) from writers w where w.room_id = r.id)::int as writer_count,
            array(select color from writers w where w.room_id = r.id) as colors
          from rooms r
          where replace(r.invite_code, '-', '') = ${invite}
        `;
        if (!room) throw new HttpError(404, 'That invite code doesn’t match a room. Check it with the person who invited you.');
        if (room.writer_count >= MAX_WRITERS_PER_ROOM) {
          throw new HttpError(409, `This room is full. A room holds ${MAX_WRITERS_PER_ROOM} writers.`);
        }
        const taken = new Set(room.colors as string[]);
        const color = WRITER_COLORS.find((c) => !taken.has(c)) ?? WRITER_COLORS[room.writer_count % WRITER_COLORS.length];
        const passkey = generatePasskey();
        const writerId = randomUUID();
        try {
          await sql`
            insert into writers (id, room_id, name, passkey_hash, role, color)
            values (${writerId}, ${room.id}, ${name}, ${hashPasskey(passkey)}, 'writer', ${color})
          `;
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new HttpError(409, `Someone in this room is already called ${name}. Add an initial or use another name.`);
          }
          throw error;
        }
        const writer: Writer = {
          id: writerId, name, role: 'writer', color,
          roomId: String(room.id), roomName: String(room.name), sessionHash: '',
        };
        const cookie = await createSession(request, writerId);
        return json(sessionPayload(writer, passkey), { status: 201, cookies: [cookie] });
      }

      case 'sign-in': {
        const name = requireName(body.name);
        const passkey = String(body.passkey ?? '');
        if (!normalizeCode(passkey)) throw new HttpError(400, 'Enter your passkey.');
        const [row] = await sql`
          select w.id, w.room_id, w.name, w.role, w.color, r.name as room_name
          from writers w join rooms r on r.id = w.room_id
          where w.passkey_hash = ${hashPasskey(passkey)}
        `;
        // Same message for a wrong name or a wrong passkey
        if (!row || String(row.name).toLowerCase() !== name.toLowerCase()) {
          throw new HttpError(401, 'That name and passkey don’t match. Check both and try again.');
        }
        const writer: Writer = {
          ...toRoomWriter(row),
          roomId: String(row.room_id),
          roomName: String(row.room_name),
          sessionHash: '',
        };
        const cookie = await createSession(request, writer.id);
        return json(sessionPayload(writer), { cookies: [cookie] });
      }

      case 'sign-out': {
        const writer = await findWriter(request);
        if (writer) await sql`delete from sessions where token_hash = ${writer.sessionHash}`;
        return json({ ok: true }, { cookies: [clearSessionCookie(request)] });
      }

      default:
        throw new HttpError(400, 'Unknown action.');
    }
  });
}
