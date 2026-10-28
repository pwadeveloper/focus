import type { DocumentItem, DocumentUnit } from '../types';
import type { RoomScript, SceneData, SceneRow, ScriptMeta } from '../../api/_lib/types';

/** Script fields shared with the room. Pins and the active scene stay per writer. */
const META_KEYS = ['subtitle', 'wordGoal', 'titlePage', 'screenplayExport', 'revisionBaseline'] as const;

export const roomDocId = (scriptId: string) => `room-${scriptId}`;

export function documentMeta(doc: DocumentItem): ScriptMeta {
  const meta: ScriptMeta = {};
  for (const key of META_KEYS) {
    if (doc[key] !== undefined) meta[key] = doc[key];
  }
  return meta;
}

export function applyMeta(doc: DocumentItem, title: string, meta: ScriptMeta): DocumentItem {
  const next: DocumentItem = { ...doc, title };
  for (const key of META_KEYS) {
    (next as unknown as Record<string, unknown>)[key] = meta[key];
  }
  return next;
}

export const unitToScene = (unit: DocumentUnit): SceneData => ({
  id: unit.id,
  title: unit.title,
  slugline: unit.slugline ?? null,
  synopsis: unit.synopsis ?? null,
  contentHtml: unit.contentHtml,
});

export const sceneToUnit = (scene: SceneData, base?: DocumentUnit): DocumentUnit => ({
  ...base,
  id: scene.id,
  unitKind: 'scene',
  title: scene.title,
  slugline: scene.slugline ?? undefined,
  synopsis: scene.synopsis ?? undefined,
  contentHtml: scene.contentHtml,
  updatedAt: Date.now(),
});

export const sameScene = (a: SceneData, b: SceneData | undefined) =>
  !!b &&
  a.title === b.title &&
  a.slugline === b.slugline &&
  a.synopsis === b.synopsis &&
  a.contentHtml === b.contentHtml;

/** A room script as a Focus document, keeping this writer's place if they had it open. */
export function roomScriptToDocument(
  script: RoomScript,
  roomId: string,
  existing?: DocumentItem
): DocumentItem {
  const units = script.scenes.map((scene: SceneRow) => sceneToUnit(scene));
  const activeUnitId = units.some((u) => u.id === existing?.activeUnitId)
    ? existing?.activeUnitId
    : units[0]?.id;
  const base: DocumentItem = {
    id: roomDocId(script.id),
    kind: 'screenplay',
    title: script.title,
    contentHtml: '',
    units,
    activeUnitId,
    pinned: existing?.pinned,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    room: { roomId, scriptId: script.id },
  };
  return applyMeta(base, script.title, script.meta);
}
