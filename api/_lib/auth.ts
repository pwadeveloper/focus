import { createHash, randomBytes, randomInt } from 'node:crypto';
import { db } from './db.js';
import { HttpError } from './http.js';
import type { Membership, RoomWriter, SessionResponse, WriterColor, WriterRole } from './types.js';

const SESSION_COOKIE = 'focus_session';
const SESSION_DAYS = 60;

// No 0/O, 1/I/L or U, so codes read back unambiguously
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const PASSKEY_WORDS = [
  'ACT', 'ARC', 'BEAT', 'BOOM', 'CAMEO', 'CAST', 'CRANE', 'CUE',
  'DOLLY', 'DRAFT', 'FADE', 'FOLEY', 'FRAME', 'GAFFER', 'GRIP', 'IRIS',
  'LENS', 'MONTAGE', 'PAN', 'PLOT', 'REEL', 'SCENE', 'SCORE', 'SET',
  'SHOT', 'SLATE', 'SPLICE', 'TAKE', 'TILT', 'WIPE', 'ZOOM', 'GENRE',
];

export const WRITER_COLORS: WriterColor[] = ['butter', 'sage', 'blush', 'lavender', 'sky'];

const codeGroup = (length: number) =>
  Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

/** e.g. DOLLY-7K2M-9QXA: about 44 bits, checked server side with the writer's name. */
export const generatePasskey = () =>
  `${PASSKEY_WORDS[randomInt(PASSKEY_WORDS.length)]}-${codeGroup(4)}-${codeGroup(4)}`;

/** e.g. 7K2M-9QXA-P4TD */
export const generateInviteCode = () => `${codeGroup(4)}-${codeGroup(4)}-${codeGroup(4)}`;

/** Case, spaces and dashes don't matter when a code is typed back in. */
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Passkeys are long random codes, so a fast hash is enough (no user-chosen secrets). */
export const hashPasskey = (passkey: string) => sha256(normalizeCode(passkey));

/** The signed-in writer (a person, across all their rooms). */
export interface Writer {
  id: string;
  name: string;
  /** Empty when the session was only just created */
  sessionHash: string;
}

export const toRoomWriter = (row: Record<string, unknown>): RoomWriter => ({
  id: String(row.id),
  name: String(row.name),
  role: row.role as WriterRole,
  color: row.color as WriterColor,
});

/** The writer and every room they belong to, personal room first. */
export async function sessionPayload(writer: Writer, passkey?: string): Promise<SessionResponse> {
  const rows = await db()`
    select r.id, r.name, r.personal, m.role, m.color
    from room_members m join rooms r on r.id = m.room_id
    where m.writer_id = ${writer.id}
    order by r.personal desc, m.joined_at
  `;
  const rooms: Membership[] = rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    personal: Boolean(row.personal),
    role: row.role as WriterRole,
    color: row.color as WriterColor,
  }));
  return { me: { id: writer.id, name: writer.name }, rooms, ...(passkey ? { passkey } : {}) };
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function cookieAttributes(request: Request): string {
  // Secure everywhere except plain-http local development
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax${secure}`;
}

/** Starts a session for a writer and returns its Set-Cookie header. */
export async function createSession(request: Request, writerId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db()`
    insert into sessions (token_hash, writer_id, expires_at)
    values (${sha256(token)}, ${writerId}, now() + make_interval(days => ${SESSION_DAYS}::int))
  `;
  return `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_DAYS * 86400}; ${cookieAttributes(request)}`;
}

export const clearSessionCookie = (request: Request) =>
  `${SESSION_COOKIE}=; Max-Age=0; ${cookieAttributes(request)}`;

export async function findWriter(request: Request): Promise<Writer | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const sessionHash = sha256(token);
  const [row] = await db()`
    select w.id, w.name
    from sessions s join writers w on w.id = s.writer_id
    where s.token_hash = ${sessionHash} and s.expires_at > now()
  `;
  if (!row) return null;
  return { id: String(row.id), name: String(row.name), sessionHash };
}

export async function requireWriter(request: Request): Promise<Writer> {
  const writer = await findWriter(request);
  if (!writer) throw new HttpError(401, 'Sign in to the writers room with your name and passkey.');
  return writer;
}

export interface MemberOf {
  roomId: string;
  roomName: string;
  personal: boolean;
  inviteCode: string | null;
  role: WriterRole;
  color: WriterColor;
}

/** The writer's membership in a room, or 404 when they aren't in it. */
export async function requireMember(writer: Writer, roomId: string): Promise<MemberOf> {
  const [row] = await db()`
    select r.id, r.name, r.personal, r.invite_code, m.role, m.color
    from room_members m join rooms r on r.id = m.room_id
    where m.room_id = ${roomId} and m.writer_id = ${writer.id}
  `;
  if (!row) throw new HttpError(404, 'You’re not in that writers room.');
  return {
    roomId: String(row.id),
    roomName: String(row.name),
    personal: Boolean(row.personal),
    inviteCode: (row.invite_code as string | null) ?? null,
    role: row.role as WriterRole,
    color: row.color as WriterColor,
  };
}

export function requireOwner(member: MemberOf): void {
  if (member.role !== 'owner') {
    throw new HttpError(403, 'Only the person who started this room can do that.');
  }
}

/** Postgres unique-violation, e.g. two writers with the same name in a room. */
export const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
