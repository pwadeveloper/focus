/** Shapes shared by the API (api/) and the client (src/room/). */

export type WriterRole = 'owner' | 'writer';
export type WriterColor = 'butter' | 'sage' | 'blush' | 'lavender' | 'sky';

/** A writer as seen inside one room (role and color are per room). */
export interface RoomWriter {
  id: string;
  name: string;
  role: WriterRole;
  color: WriterColor;
}

/** A room the signed-in writer belongs to. */
export interface Membership {
  id: string;
  name: string;
  /** The writer's own scripts, synced across their devices */
  personal: boolean;
  role: WriterRole;
  color: WriterColor;
}

export interface SessionResponse {
  me: { id: string; name: string };
  rooms: Membership[];
  security: {
    /** Face ID / Touch ID / security keys the writer has added */
    devicePasskeys: number;
    /** This device confirmed with one recently, so shared rooms are open */
    roomVerified: boolean;
  };
  /** Only present right after they are created; never shown again. */
  passkey?: string;
  recoveryCode?: string;
}

export interface DevicePasskey {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface RoomScriptSummary {
  id: string;
  title: string;
  sceneCount: number;
  updatedAt: string;
}

export interface RoomDetails {
  me: RoomWriter;
  room: {
    id: string;
    name: string;
    personal: boolean;
    /** Shared rooms only */
    inviteCode: string | null;
    maxWriters: number;
  };
  writers: RoomWriter[];
  scripts: RoomScriptSummary[];
}

/** The fields of a scene that sync. */
export interface SceneData {
  id: string;
  title: string;
  slugline: string | null;
  synopsis: string | null;
  contentHtml: string;
}

export interface SceneRow extends SceneData {
  version: number;
}

/**
 * Script-level fields that sync (subtitle, word goal, title page, export
 * settings, revision baseline). The server stores them without inspecting them.
 */
export type ScriptMeta = Record<string, unknown>;

export interface RoomScript {
  id: string;
  roomId: string;
  title: string;
  meta: ScriptMeta;
  version: number;
  /** In script order */
  scenes: SceneRow[];
}

/** Every script the writer can open on this device. */
export interface LibraryResponse {
  scripts: RoomScript[];
  /** Shared rooms whose scripts need a device passkey confirmation first */
  lockedRoomIds: string[];
}

export interface SyncChanges {
  /** New or edited scenes */
  scenes?: SceneData[];
  /** Every scene id in order, sent when scenes were added, moved or deleted */
  order?: string[];
  deleted?: string[];
  /** Sent together whenever either changes */
  title?: string;
  meta?: ScriptMeta;
}

export interface SyncRequest {
  scriptId: string;
  /** Identifies this tab, so one writer's devices hold scenes separately */
  clientId: string;
  /** The scene this tab is showing, or null outside the editor */
  sceneId: string | null;
  /** Take (or keep) the hold on sceneId so only this tab can change it */
  wantLock: boolean;
  /** Scene id to version for every scene the client has */
  known: Record<string, number>;
  knownScriptVersion: number;
  changes?: SyncChanges;
  /** Leaving the script: drop this tab's hold and presence */
  leave?: boolean;
}

export interface SyncResponse {
  /** Every live scene id in script order */
  order: string[];
  /** Scenes whose version differs from `known`, plus any refused writes */
  scenes: SceneRow[];
  /** Accepted scene writes, with their new versions */
  saved: Record<string, number>;
  /** Writes refused because another tab holds the scene */
  rejected: string[];
  /** Present when the script's title or meta changed */
  script: { title: string; meta: ScriptMeta; version: number } | null;
  savedScriptVersion: number | null;
  locks: { sceneId: string; writerId: string; clientId: string }[];
  presence: { writerId: string; clientId: string; sceneId: string | null }[];
  writers: RoomWriter[];
  /** Whether this tab holds the lock on `sceneId` */
  lockHeld: boolean;
}

/** Writers in a shared room, including the one who started it. */
export const MAX_WRITERS_PER_ROOM = 3;
