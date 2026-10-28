import type {
  RoomDetails,
  RoomScript,
  SceneData,
  ScriptMeta,
  SessionResponse,
  SyncRequest,
  SyncResponse,
} from '../../api/_lib/types';

/** A failed call, with a message written for the writer. */
export class RoomApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new RoomApiError(0, 'Can’t reach the writers room. Check your connection.');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new RoomApiError(res.status, data.error ?? 'Something went wrong. Try again.');
  }
  return data;
}

export const roomApi = {
  /** The signed-in writer, or null. */
  session: () => call<SessionResponse | null>('/api/auth'),
  createRoom: (roomName: string, name: string) =>
    call<SessionResponse>('/api/auth', { action: 'create-room', roomName, name }),
  join: (inviteCode: string, name: string) =>
    call<SessionResponse>('/api/auth', { action: 'join', inviteCode, name }),
  signIn: (name: string, passkey: string) =>
    call<SessionResponse>('/api/auth', { action: 'sign-in', name, passkey }),
  signOut: () => call<{ ok: true }>('/api/auth', { action: 'sign-out' }),

  details: () => call<RoomDetails>('/api/room'),
  renameRoom: (name: string) => call<{ ok: true }>('/api/room', { action: 'rename', name }),
  newInvite: () => call<{ inviteCode: string }>('/api/room', { action: 'new-invite' }),
  reissuePasskey: (writerId: string) =>
    call<{ passkey: string }>('/api/room', { action: 'reissue-passkey', writerId }),
  removeWriter: (writerId: string) =>
    call<{ ok: true }>('/api/room', { action: 'remove-writer', writerId }),

  getScript: (id: string) => call<RoomScript>(`/api/scripts?id=${encodeURIComponent(id)}`),
  createScript: (title: string, meta: ScriptMeta, scenes: SceneData[]) =>
    call<RoomScript>('/api/scripts', { action: 'create', title, meta, scenes }),
  deleteScript: (id: string) => call<{ ok: true }>('/api/scripts', { action: 'delete', id }),

  sync: (request: SyncRequest) => call<SyncResponse>('/api/sync', request),
  /** Fire-and-forget on tab close, so this writer's scene frees up right away. */
  leave: (scriptId: string) => {
    const body = JSON.stringify({ scriptId, leave: true });
    if (!navigator.sendBeacon?.('/api/sync', new Blob([body], { type: 'application/json' }))) {
      fetch('/api/sync', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
    }
  },
};
