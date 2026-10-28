import { toNumber } from './db.js';
import { HttpError } from './http.js';
import type { SceneData, SceneRow, ScriptMeta } from './types.js';

const MAX_SCENES = 1000;
const MAX_SCENE_HTML = 1_000_000;

/** Validates scenes from the client into rows for jsonb_to_recordset. */
export function sceneRecords(scenes: unknown): Array<Record<string, string | null>> {
  if (!Array.isArray(scenes)) return [];
  if (scenes.length > MAX_SCENES) throw new HttpError(413, 'That script has too many scenes to sync.');
  const seen = new Set<string>();
  return scenes.map((raw) => {
    const scene = (raw ?? {}) as Partial<SceneData>;
    const id = typeof scene.id === 'string' ? scene.id.slice(0, 100) : '';
    if (!id || seen.has(id)) throw new HttpError(400, 'Every scene needs its own id.');
    seen.add(id);
    const html = typeof scene.contentHtml === 'string' ? scene.contentHtml : '';
    if (html.length > MAX_SCENE_HTML) throw new HttpError(413, 'One scene is too long to sync.');
    return {
      id,
      title: typeof scene.title === 'string' ? scene.title.slice(0, 300) : '',
      slugline: typeof scene.slugline === 'string' ? scene.slugline.slice(0, 300) : null,
      synopsis: typeof scene.synopsis === 'string' ? scene.synopsis.slice(0, 5000) : null,
      content_html: html,
    };
  });
}

export const toSceneRow = (row: Record<string, unknown>): SceneRow => ({
  id: String(row.id),
  title: String(row.title ?? ''),
  slugline: (row.slugline as string | null) ?? null,
  synopsis: (row.synopsis as string | null) ?? null,
  contentHtml: String(row.content_html ?? ''),
  version: toNumber(row.version),
});

export const cleanMeta = (meta: unknown): ScriptMeta => {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  if (JSON.stringify(meta).length > 2_000_000) throw new HttpError(413, 'The script settings are too large to sync.');
  return meta as ScriptMeta;
};
