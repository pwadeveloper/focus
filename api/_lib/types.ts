/** Shapes shared by the writers room API (api/) and the client (src/room/). */

export type WriterRole = 'owner' | 'writer';
export type WriterColor = 'butter' | 'sage' | 'blush' | 'lavender' | 'sky';

export interface RoomWriter {
  id: string;
  name: string;
  role: WriterRole;
  color: WriterColor;
}

export interface RoomInfo {
  id: string;
  name: string;
}

export interface SessionResponse {
  me: RoomWriter;
  room: RoomInfo;
  /** Only present right after a passkey is created; it is never shown again. */
  passkey?: string;
}

export interface RoomScriptSummary {
  id: string;
  title: string;
  sceneCount: number;
  updatedAt: string;
}

export interface RoomDetails {
  me: RoomWriter;
  room: RoomInfo & { inviteCode: string; maxWriters: number };
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
  title: string;
  meta: ScriptMeta;
  version: number;
  /** In script order */
  scenes: SceneRow[];
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
  /** The scene this writer is looking at, or null outside the editor */
  sceneId: string | null;
  /** Take (or keep) the lock on sceneId so only this writer can change it */
  wantLock: boolean;
  /** Scene id to version for every scene the client has */
  known: Record<string, number>;
  knownScriptVersion: number;
  changes?: SyncChanges;
  /** Leaving the script: drop this writer's lock and presence */
  leave?: boolean;
}

export interface SyncResponse {
  /** Every live scene id in script order */
  order: string[];
  /** Scenes whose version differs from `known`, plus any refused writes */
  scenes: SceneRow[];
  /** Accepted scene writes, with their new versions */
  saved: Record<string, number>;
  /** Writes refused because another writer holds the scene */
  rejected: string[];
  /** Present when the script's title or meta changed */
  script: { title: string; meta: ScriptMeta; version: number } | null;
  savedScriptVersion: number | null;
  locks: { sceneId: string; writerId: string }[];
  presence: { writerId: string; sceneId: string | null }[];
  writers: RoomWriter[];
  /** Whether this writer holds the lock on `sceneId` */
  lockHeld: boolean;
}

export const MAX_WRITERS_PER_ROOM = 3;
