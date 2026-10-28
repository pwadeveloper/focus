import type { DocumentItem, DocumentUnit } from '../types';
import type { RoomWriter, SceneData, SceneRow, ScriptMeta, SyncChanges, SyncResponse } from '../../api/_lib/types';
import { RoomApiError, roomApi } from './api';
import { applyMeta, documentMeta, sameScene, sceneToUnit, unitToScene } from './convert';

const VISIBLE_INTERVAL_MS = 2000;
const HIDDEN_INTERVAL_MS = 10_000;
const EDIT_DEBOUNCE_MS = 600;
/** Holding a scene this long without typing frees it for the other writers. */
const IDLE_RELEASE_MS = 10 * 60 * 1000;

export interface RoomSyncState {
  /** signed-out: the session ended (passkey reissued, removed). gone: the script was deleted. */
  status: 'connecting' | 'live' | 'offline' | 'signed-out' | 'gone';
  /** The scene this writer holds and can type in */
  heldSceneId: string | null;
  /** Scene id to the writer holding it */
  locks: Record<string, string>;
  /** Other writers in this script, and the scene they're looking at */
  presence: { writerId: string; sceneId: string | null }[];
  writers: RoomWriter[];
  /** This writer stepped away long enough that their scene was freed */
  idle: boolean;
}

export type DocUpdate = (doc: DocumentItem) => DocumentItem;

const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
const metaKey = (title: string, meta: ScriptMeta) => JSON.stringify([title, meta]);
const docMetaKey = (doc: DocumentItem) => metaKey(doc.title, documentMeta(doc));
const sceneData = ({ version: _version, ...scene }: SceneRow): SceneData => scene;
const newUnitId = () => `unit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

interface MergeContext {
  rows: SceneRow[];
  removed: Set<string>;
  serverOrder: string[];
  /** Local scene order when the request went out */
  idsAtSend: string[];
  /** What the server had confirmed before this response */
  prevSynced: Map<string, SceneData>;
  prevSyncedMeta: string;
  heldSceneId: string | null;
  remoteMeta: { title: string; meta: ScriptMeta } | null;
  conflictCopies: DocumentUnit[];
}

/**
 * Pure merge of a sync response into the latest local document, so it is
 * safe inside a React state updater.
 */
function mergeRemote(doc: DocumentItem, ctx: MergeContext): DocumentItem {
  const units = doc.units ?? [];
  const byId = new Map(units.map((unit) => [unit.id, unit]));

  for (const row of ctx.rows) {
    const local = byId.get(row.id);
    const unsent = local ? !sameScene(unitToScene(local), ctx.prevSynced.get(row.id)) : false;
    // Typing not yet sent in the scene we hold wins; it goes out on the next sync
    if (unsent && row.id === ctx.heldSceneId) continue;
    byId.set(row.id, sceneToUnit(row, local));
  }
  for (const id of ctx.removed) byId.delete(id);

  const serverIds = new Set(ctx.serverOrder);
  const localIds = units.map((unit) => unit.id);
  let order: string[];
  if (sameOrder(localIds, ctx.idsAtSend)) {
    // Take the server's order, keeping scenes created here that haven't synced yet
    order = [
      ...ctx.serverOrder.filter((id) => byId.has(id)),
      ...localIds.filter((id) => byId.has(id) && !serverIds.has(id)),
    ];
  } else {
    // The writer reordered during the request; keep theirs and add new arrivals
    order = [
      ...localIds.filter((id) => byId.has(id)),
      ...ctx.serverOrder.filter((id) => byId.has(id) && !localIds.includes(id)),
    ];
  }
  const nextUnits = [...order.map((id) => byId.get(id)!), ...ctx.conflictCopies];

  let next: DocumentItem = { ...doc, units: nextUnits };
  if (!nextUnits.some((unit) => unit.id === next.activeUnitId)) {
    next.activeUnitId = nextUnits[0]?.id;
  }
  if (ctx.remoteMeta && docMetaKey(doc) === ctx.prevSyncedMeta) {
    next = applyMeta(next, ctx.remoteMeta.title, ctx.remoteMeta.meta);
  }
  return next;
}

/**
 * Keeps one writers room script in sync: pushes local edits, holds the lock
 * on the scene being written, and merges everyone else's changes.
 */
export class RoomSync {
  /** Scene versions the server has confirmed to us */
  private known = new Map<string, number>();
  /** Scene contents as of those versions; local scenes that differ are unsent edits */
  private synced = new Map<string, SceneData>();
  private syncedOrder: string[];
  private syncedMeta: string;
  private knownScriptVersion = 0;
  private doc: DocumentItem;
  private focus: { sceneId: string | null; wantLock: boolean } = { sceneId: null, wantLock: false };
  private timer: number | null = null;
  private timerAt = Infinity;
  private inFlight = false;
  private rerun = false;
  private stopped = false;
  private lastEditAt = Date.now();
  private state: RoomSyncState = {
    status: 'connecting',
    heldSceneId: null,
    locks: {},
    presence: [],
    writers: [],
    idle: false,
  };

  constructor(
    private scriptId: string,
    private me: RoomWriter,
    doc: DocumentItem,
    private onState: (state: RoomSyncState) => void,
    private onRemote: (update: DocUpdate) => void
  ) {
    // Treat what's on this device as the starting point but with unknown
    // versions: the first sync returns the server's copy of every scene,
    // so the room's latest work wins over an older local copy
    this.doc = doc;
    for (const unit of doc.units ?? []) this.synced.set(unit.id, unitToScene(unit));
    this.syncedOrder = (doc.units ?? []).map((unit) => unit.id);
    this.syncedMeta = docMetaKey(doc);
  }

  start() {
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('pagehide', this.handlePageHide);
    this.schedule(0);
  }

  stop() {
    this.stopped = true;
    this.clearTimer();
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('pagehide', this.handlePageHide);
    roomApi.leave(this.scriptId);
  }

  setDoc(doc: DocumentItem) {
    this.doc = doc;
    this.schedule(EDIT_DEBOUNCE_MS);
  }

  setFocus(sceneId: string | null, wantLock: boolean) {
    if (sceneId === this.focus.sceneId && wantLock === this.focus.wantLock) return;
    this.focus = { sceneId, wantLock };
    this.lastEditAt = Date.now();
    if (this.state.idle) this.setState({ idle: false });
    this.schedule(0);
  }

  /** After stepping away: take the scene back if it's still free. */
  keepWriting() {
    this.lastEditAt = Date.now();
    this.setState({ idle: false });
    this.schedule(0);
  }

  private handleVisibility = () => {
    if (!document.hidden) this.schedule(0);
  };

  private handlePageHide = () => roomApi.leave(this.scriptId);

  private setState(patch: Partial<RoomSyncState>) {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }

  private clearTimer() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.timerAt = Infinity;
  }

  /** Runs a sync after `delay`, unless one is already due sooner. */
  private schedule(delay?: number) {
    if (this.stopped) return;
    const wait = delay ?? (document.hidden ? HIDDEN_INTERVAL_MS : VISIBLE_INTERVAL_MS);
    if (Date.now() + wait >= this.timerAt) return;
    this.clearTimer();
    this.timerAt = Date.now() + wait;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.timerAt = Infinity;
      void this.tick();
    }, wait);
  }

  private async tick() {
    if (this.stopped) return;
    if (this.inFlight) {
      this.rerun = true;
      return;
    }
    this.inFlight = true;

    const doc = this.doc;
    const units = doc.units ?? [];
    const ids = units.map((unit) => unit.id);
    const sent = new Map<string, SceneData>();
    for (const unit of units) {
      const scene = unitToScene(unit);
      if (!sameScene(scene, this.synced.get(unit.id))) sent.set(unit.id, scene);
    }
    const deleted = [...this.synced.keys()].filter((id) => !ids.includes(id));
    const orderChanged = !sameOrder(ids, this.syncedOrder);
    const metaJson = docMetaKey(doc);
    const metaChanged = metaJson !== this.syncedMeta;

    const changes: SyncChanges = {};
    if (sent.size > 0) changes.scenes = [...sent.values()];
    if (deleted.length > 0) changes.deleted = deleted;
    if (orderChanged) changes.order = ids;
    if (metaChanged) {
      changes.title = doc.title;
      changes.meta = documentMeta(doc);
    }
    const hasChanges = Object.keys(changes).length > 0;
    if (hasChanges) this.lastEditAt = Date.now();

    if (this.state.heldSceneId && !this.state.idle && Date.now() - this.lastEditAt > IDLE_RELEASE_MS) {
      this.setState({ idle: true });
    }
    const sceneId = this.focus.sceneId;
    const heldBefore = this.state.heldSceneId;

    try {
      const res = await roomApi.sync({
        scriptId: this.scriptId,
        sceneId,
        wantLock: this.focus.wantLock && !this.state.idle,
        known: Object.fromEntries(this.known),
        knownScriptVersion: this.knownScriptVersion,
        changes: hasChanges ? changes : undefined,
      });
      if (this.stopped) return;
      this.absorb(res, { sent, deleted, ids, metaJson, metaChanged, heldBefore, sceneId });
    } catch (error) {
      if (this.stopped) return;
      const status = error instanceof RoomApiError ? error.status : 0;
      if (status === 401 || status === 404) {
        this.setState({ status: status === 401 ? 'signed-out' : 'gone', heldSceneId: null });
        this.stopped = true;
        return;
      }
      // Keep the scene editable while offline; the lock lasts 30s past the last
      // sync, and anything refused afterwards is kept as a copy (see absorb)
      this.setState({ status: 'offline' });
    } finally {
      this.inFlight = false;
    }
    if (this.rerun) {
      this.rerun = false;
      this.schedule(0);
    }
    this.schedule();
  }

  private absorb(
    res: SyncResponse,
    sent: {
      sent: Map<string, SceneData>;
      deleted: string[];
      ids: string[];
      metaJson: string;
      metaChanged: boolean;
      heldBefore: string | null;
      sceneId: string | null;
    }
  ) {
    const serverIds = new Set(res.order);

    // Accepted writes become the confirmed baseline
    for (const [id, scene] of sent.sent) {
      const version = res.saved[id];
      if (version !== undefined) {
        this.synced.set(id, scene);
        this.known.set(id, version);
      }
    }
    for (const id of sent.deleted) {
      if (!serverIds.has(id)) {
        this.synced.delete(id);
        this.known.delete(id);
      }
    }
    if (sent.metaChanged && res.savedScriptVersion !== null) {
      this.syncedMeta = sent.metaJson;
      this.knownScriptVersion = res.savedScriptVersion;
    }
    const prevSynced = new Map(this.synced);
    const prevSyncedMeta = this.syncedMeta;

    // A refused write to the scene we were holding means our hold lapsed
    // (e.g. a long disconnect) and someone else took it. Keep our text as a copy.
    const conflictCopies: DocumentUnit[] = [];
    for (const id of res.rejected) {
      const mine = sent.sent.get(id);
      const theirs = res.scenes.find((row) => row.id === id);
      if (mine && id === sent.heldBefore && !sameScene(mine, theirs && sceneData(theirs))) {
        conflictCopies.push({
          ...sceneToUnit(mine),
          id: newUnitId(),
          title: `${mine.title || 'Untitled scene'} (${this.me.name}’s version)`,
        });
      }
    }

    // Everyone else's changes
    for (const row of res.scenes) {
      this.synced.set(row.id, sceneData(row));
      this.known.set(row.id, row.version);
    }
    const removed = new Set(
      [...new Set([...prevSynced.keys(), ...this.known.keys()])].filter(
        (id) => !serverIds.has(id) && !(id in res.saved)
      )
    );
    for (const id of removed) {
      this.synced.delete(id);
      this.known.delete(id);
    }
    this.syncedOrder = res.order;

    let remoteMeta: MergeContext['remoteMeta'] = null;
    if (res.script) {
      remoteMeta = { title: res.script.title, meta: res.script.meta };
      this.syncedMeta = metaKey(res.script.title, res.script.meta);
      this.knownScriptVersion = res.script.version;
    }

    const heldSceneId = res.lockHeld ? sent.sceneId : null;
    if (
      res.scenes.length > 0 ||
      removed.size > 0 ||
      remoteMeta ||
      conflictCopies.length > 0 ||
      !sameOrder(sent.ids, res.order)
    ) {
      const ctx: MergeContext = {
        rows: res.scenes,
        removed,
        serverOrder: res.order,
        idsAtSend: sent.ids,
        prevSynced,
        prevSyncedMeta,
        heldSceneId,
        remoteMeta,
        conflictCopies,
      };
      this.onRemote((doc) => mergeRemote(doc, ctx));
    }

    this.setState({
      status: 'live',
      heldSceneId,
      locks: Object.fromEntries(res.locks.map((lock) => [lock.sceneId, lock.writerId])),
      presence: res.presence.filter((p) => p.writerId !== this.me.id),
      writers: res.writers,
    });
  }
}
