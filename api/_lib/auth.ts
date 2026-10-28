import { createHash, randomBytes, randomInt } from 'node:crypto';
import { db } from './db.js';
import { HttpError } from './http.js';
import type { RoomWriter, SessionResponse, WriterColor, WriterRole } from './types.js';

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

export interface Writer extends RoomWriter {
  roomId: string;
  roomName: string;
  sessionHash: string;
}

export const toRoomWriter = (row: Record<string, unknown>): RoomWriter => ({
  id: String(row.id),
  name: String(row.name),
  role: row.role as WriterRole,
  color: row.color as WriterColor,
});

export const sessionPayload = (writer: Writer, passkey?: string): SessionResponse => ({
  me: { id: writer.id, name: writer.name, role: writer.role, color: writer.color },
  room: { id: writer.roomId, name: writer.roomName },
  ...(passkey ? { passkey } : {}),
});

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
    select w.id, w.room_id, w.name, w.role, w.color, r.name as room_name
    from sessions s
    join writers w on w.id = s.writer_id
    join rooms r on r.id = w.room_id
    where s.token_hash = ${sessionHash} and s.expires_at > now()
  `;
  if (!row) return null;
  return {
    ...toRoomWriter(row),
    roomId: String(row.room_id),
    roomName: String(row.room_name),
    sessionHash,
  };
}

export async function requireWriter(request: Request): Promise<Writer> {
  const writer = await findWriter(request);
  if (!writer) throw new HttpError(401, 'Sign in to the writers room with your name and passkey.');
  return writer;
}

export function requireOwner(writer: Writer): void {
  if (writer.role !== 'owner') {
    throw new HttpError(403, 'Only the person who started this room can do that.');
  }
}

/** Postgres unique-violation, e.g. two writers with the same name in a room. */
export const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
