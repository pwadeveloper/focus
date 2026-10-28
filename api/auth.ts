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
  normalizeCode,
  requireWriter,
  sessionPayload,
  type Writer,
} from './_lib/auth.js';
import { HttpError, assertSameOrigin, cleanText, handle, json, readJson } from './_lib/http.js';
import { MAX_WRITERS_PER_ROOM } from './_lib/types.js';

interface AuthBody {
  action: 'create-account' | 'create-room' | 'join' | 'sign-in' | 'sign-out' | 'new-passkey';
  name: string;
  roomName: string;
  inviteCode: string;
  passkey: string;
}

const requireName = (value: unknown) => {
  const name = cleanText(value, 40);
  if (!name) throw new HttpError(400, 'Enter your name.');
  return name;
};

/** Statements creating a writer and their personal room, for one transaction. */
function accountStatements(name: string, passkey: string) {
  const sql = db();
  const writerId = randomUUID();
  const roomId = randomUUID();
  return {
    writerId,
    statements: [
      sql`insert into writers (id, name, passkey_hash) values (${writerId}, ${name}, ${hashPasskey(passkey)})`,
      sql`insert into rooms (id, name, personal) values (${roomId}, ${`${name}’s scripts`}, true)`,
      sql`
        insert into room_members (room_id, writer_id, role, color)
        values (${roomId}, ${writerId}, 'owner', ${WRITER_COLORS[0]})
      `,
    ],
  };
}

/** The signed-in writer and their rooms, or null (a normal state, so not an error status). */
export function GET(request: Request) {
  return handle(async () => {
    const writer = await findWriter(request);
    return json(writer ? await sessionPayload(writer) : null);
  });
}

export function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readJson<AuthBody>(request);
    const sql = db();

    switch (body.action) {
      case 'create-account': {
        const name = requireName(body.name);
        const passkey = generatePasskey();
        const { writerId, statements } = accountStatements(name, passkey);
        await sql.transaction(statements);
        const cookie = await createSession(request, writerId);
        return json(await sessionPayload({ id: writerId, name, sessionHash: '' }, passkey), {
          status: 201,
          cookies: [cookie],
        });
      }

      case 'create-room': {
        const me = await requireWriter(request);
        const roomName = cleanText(body.roomName, 60) || `${me.name}’s writers room`;
        const roomId = randomUUID();
        await sql.transaction([
          sql`insert into rooms (id, name, invite_code) values (${roomId}, ${roomName}, ${generateInviteCode()})`,
          sql`
            insert into room_members (room_id, writer_id, role, color)
            values (${roomId}, ${me.id}, 'owner', ${WRITER_COLORS[0]})
          `,
        ]);
        return json(await sessionPayload(me), { status: 201 });
      }

      case 'join': {
        const invite = normalizeCode(String(body.inviteCode ?? ''));
        if (!invite) throw new HttpError(400, 'Enter the invite code from your room.');
        const signedIn = await findWriter(request);
        const name = signedIn?.name ?? requireName(body.name);
        const [room] = await sql`
          select r.id,
            (select count(*) from room_members m where m.room_id = r.id)::int as member_count,
            array(select m.color from room_members m where m.room_id = r.id) as colors,
            exists(
              select 1 from room_members m join writers w on w.id = m.writer_id
              where m.room_id = r.id and lower(w.name) = lower(${name})
                and w.id is distinct from ${signedIn?.id ?? null}::uuid
            ) as name_taken,
            exists(
              select 1 from room_members m
              where m.room_id = r.id and m.writer_id = ${signedIn?.id ?? null}::uuid
            ) as already_member
          from rooms r
          where not r.personal and replace(r.invite_code, '-', '') = ${invite}
        `;
        if (!room) throw new HttpError(404, 'That invite code doesn’t match a room. Check it with the person who invited you.');
        if (room.already_member && signedIn) return json(await sessionPayload(signedIn));
        if (room.member_count >= MAX_WRITERS_PER_ROOM) {
          throw new HttpError(409, `This room is full. A room holds ${MAX_WRITERS_PER_ROOM} writers.`);
        }
        if (room.name_taken) {
          throw new HttpError(409, `Someone in this room is already called ${name}. ${
            signedIn ? 'Ask them to tell you apart some other way, or start your own room.' : 'Add an initial or use another name.'
          }`);
        }
        const taken = new Set(room.colors as string[]);
        const color = WRITER_COLORS.find((c) => !taken.has(c)) ?? WRITER_COLORS[room.member_count % WRITER_COLORS.length];
        const joinStatement = (writerId: string) => sql`
          insert into room_members (room_id, writer_id, role, color)
          values (${room.id}, ${writerId}, 'writer', ${color})
        `;

        if (signedIn) {
          await joinStatement(signedIn.id);
          return json(await sessionPayload(signedIn), { status: 201 });
        }
        // New to Focus: create their account (with its personal room) and join
        const passkey = generatePasskey();
        const { writerId, statements } = accountStatements(name, passkey);
        await sql.transaction([...statements, joinStatement(writerId)]);
        const cookie = await createSession(request, writerId);
        return json(await sessionPayload({ id: writerId, name, sessionHash: '' }, passkey), {
          status: 201,
          cookies: [cookie],
        });
      }

      case 'sign-in': {
        const name = requireName(body.name);
        const passkey = String(body.passkey ?? '');
        if (!normalizeCode(passkey)) throw new HttpError(400, 'Enter your passkey.');
        const [row] = await sql`select id, name from writers where passkey_hash = ${hashPasskey(passkey)}`;
        // Same message for a wrong name or a wrong passkey
        if (!row || String(row.name).toLowerCase() !== name.toLowerCase()) {
          throw new HttpError(401, 'That name and passkey don’t match. Check both and try again.');
        }
        const writer: Writer = { id: String(row.id), name: String(row.name), sessionHash: '' };
        const cookie = await createSession(request, writer.id);
        return json(await sessionPayload(writer), { cookies: [cookie] });
      }

      case 'new-passkey': {
        // For a lost or shared passkey: replaces it and signs out every other device
        const me = await requireWriter(request);
        const passkey = generatePasskey();
        await sql.transaction([
          sql`update writers set passkey_hash = ${hashPasskey(passkey)} where id = ${me.id}`,
          sql`delete from sessions where writer_id = ${me.id} and token_hash <> ${me.sessionHash}`,
        ]);
        return json(await sessionPayload(me, passkey));
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
