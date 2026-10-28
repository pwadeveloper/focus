import type {
  DevicePasskey,
  LibraryResponse,
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
    message: string,
    /** 'device-check': confirm with Face ID / Touch ID, then retry */
    public code?: string
  ) {
    super(message);
  }
}

export const needsDeviceCheck = (error: unknown) =>
  error instanceof RoomApiError && error.code === 'device-check';

/** Identifies this tab across reloads, so a writer's devices hold scenes separately. */
export const CLIENT_ID = (() => {
  try {
    const saved = sessionStorage.getItem('focus:client-id');
    if (saved) return saved;
    const id = crypto.randomUUID();
    sessionStorage.setItem('focus:client-id', id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
})();

const ACCOUNT_KEY = 'focus:account';

/** The last known session, so synced scripts stay usable offline. */
export function loadCachedSession(): SessionResponse | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as SessionResponse) : null;
  } catch {
    return null;
  }
}

export function saveCachedSession(session: SessionResponse | null): void {
  try {
    if (session) {
      // Never keep the codes themselves
      const { passkey: _passkey, recoveryCode: _recoveryCode, ...rest } = session;
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(rest));
    } else {
      localStorage.removeItem(ACCOUNT_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

async function call<T>(path: string, body?: unknown, keepalive = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive,
    });
  } catch {
    throw new RoomApiError(0, 'Can’t reach Focus. Check your connection.');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) {
    throw new RoomApiError(res.status, data?.error ?? 'Something went wrong. Try again.', data?.code);
  }
  return data;
}

export const roomApi = {
  /** The signed-in writer, or null. */
  session: () => call<SessionResponse | null>('/api/auth'),
  createAccount: (name: string) => call<SessionResponse>('/api/auth', { action: 'create-account', name }),
  signIn: (name: string, passkey: string) =>
    call<SessionResponse>('/api/auth', { action: 'sign-in', name, passkey }),
  /** Lost passkey: replaces both codes and signs out every other device. */
  recover: (name: string, recoveryCode: string) =>
    call<SessionResponse>('/api/auth', { action: 'recover', name, recoveryCode }),
  /** Signed out, this also creates the writer's account. */
  join: (inviteCode: string, name?: string) =>
    call<SessionResponse>('/api/auth', { action: 'join', inviteCode, name }),
  createRoom: (roomName: string) => call<SessionResponse>('/api/auth', { action: 'create-room', roomName }),
  newPasskey: () => call<SessionResponse>('/api/auth', { action: 'new-passkey' }),
  signOut: () => call<{ ok: true }>('/api/auth', { action: 'sign-out' }),

  details: (roomId: string) => call<RoomDetails>(`/api/room?id=${encodeURIComponent(roomId)}`),
  newInvite: (roomId: string) => call<{ inviteCode: string }>('/api/room', { roomId, action: 'new-invite' }),
  removeWriter: (roomId: string, writerId: string) =>
    call<{ ok: true }>('/api/room', { roomId, action: 'remove-writer', writerId }),
  leaveRoom: (roomId: string) => call<{ ok: true }>('/api/room', { roomId, action: 'leave' }),

  devicePasskeys: () => call<{ devices: DevicePasskey[] }>('/api/passkeys'),
  devicePasskeyAction: <T,>(action: string, extra: Record<string, unknown> = {}) =>
    call<T>('/api/passkeys', { action, ...extra }),

  library: () => call<LibraryResponse>('/api/scripts'),
  getScript: (id: string) => call<RoomScript>(`/api/scripts?id=${encodeURIComponent(id)}`),
  createScript: (roomId: string, title: string, meta: ScriptMeta, scenes: SceneData[]) =>
    call<RoomScript>('/api/scripts', { action: 'create', roomId, title, meta, scenes }),
  deleteScript: (id: string) => call<{ ok: true }>('/api/scripts', { action: 'delete', id }),

  sync: (request: Omit<SyncRequest, 'clientId'>, keepalive = false) =>
    call<SyncResponse>('/api/sync', { ...request, clientId: CLIENT_ID }, keepalive),
  /** Frees this tab's scene and presence, and waits for it (e.g. before signing out). */
  leaveNow: (scriptId: string) =>
    call<{ ok: true }>('/api/sync', { scriptId, clientId: CLIENT_ID, leave: true }),
  /** Fire-and-forget: frees this tab's scene and presence right away. */
  leave: (scriptId: string) => {
    const body = JSON.stringify({ scriptId, clientId: CLIENT_ID, leave: true });
    if (!navigator.sendBeacon?.('/api/sync', new Blob([body], { type: 'application/json' }))) {
      fetch('/api/sync', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
    }
  },
};
