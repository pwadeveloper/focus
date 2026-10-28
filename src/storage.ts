import { DocumentItem, WriterSettings } from './types';

const SETTINGS_KEY = 'focus:settings';
const DOCS_KEY = 'focus:documents';
const ACTIVE_DOC_KEY = 'focus:activeDocId';

const DB_NAME = 'FocusWriterDB';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

export const DEFAULT_SETTINGS: WriterSettings = {
  theme: 'paper',
  fontVoice: 'serif',
  fontSize: 'lg',
  measure: 'balanced',
  focusMode: 'off',
  typewriterMode: false,
  wordGoal: 1000,
  showStats: true,
};

export const STARTER_SCREENPLAY: DocumentItem = {
  id: 'doc-starter-screenplay',
  kind: 'screenplay',
  title: 'NIGHT FREQUENCY',
  subtitle: 'Written for the Screen',
  pinned: true,
  wordGoal: 1200,
  createdAt: Date.now() - 5400_000,
  updatedAt: Date.now() - 300_000,
  contentHtml: '',
  activeUnitId: 'scene-1',
  units: [
    {
      id: 'scene-1',
      unitKind: 'scene',
      slugline: 'INT. MAGNETIC TAPE ARCHIVE - NIGHT',
      title: 'The Unlabeled Reel',
      synopsis: 'Elena discovers a 1974 broadcast reel spinning on an unplugged console.',
      updatedAt: Date.now() - 1800_000,
      contentHtml: `<p data-sp-type="slugline">INT. MAGNETIC TAPE ARCHIVE - NIGHT</p>
<p data-sp-type="action">Rows of galvanized steel shelves stretch into amber darkness. Fluorescent tubes hum overhead. ELENA VANCE (34), sleeves rolled, fingers stained with splicing chalk, threads a quarter-inch reel onto a Studer deck.</p>
<p data-sp-type="character">ELENA</p>
<p data-sp-type="parenthetical">(into voice recorder)</p>
<p data-sp-type="dialogue">Reel forty-seven, Sub-basement C. No catalog card. Oxide layer intact.</p>
<p data-sp-type="action">She presses PLAY. Static fills the small monitor speaker—then a clear, rhythmic three-note chime repeats every four seconds.</p>
<p data-sp-type="character">MARCUS (O.S.)</p>
<p data-sp-type="dialogue">You’re supposed to log the municipal hearings before midnight, Elena.</p>
<p data-sp-type="action">Elena doesn’t flinch. MARCUS (50s), night supervisor, stands in the doorway holding a keyring and a paper cup of coffee.</p>
<p data-sp-type="character">ELENA</p>
<p data-sp-type="dialogue">Listen to the carrier wave underneath the chime. That’s not a city council microphone.</p>
<p data-sp-type="character">MARCUS</p>
<p data-sp-type="parenthetical">(stepping closer)</p>
<p data-sp-type="dialogue">Where did you pull that box?</p>
<p data-sp-type="transition">CUT TO:</p>`,
    },
    {
      id: 'scene-2',
      unitKind: 'scene',
      slugline: 'EXT. ROOFTOP RELAY TOWER - CONTINUOUS',
      title: 'Signal in the Rain',
      synopsis: 'Elena traces the coaxial line up to the decommissioned microwave horn.',
      updatedAt: Date.now() - 1200_000,
      contentHtml: `<p data-sp-type="slugline">EXT. ROOFTOP RELAY TOWER - CONTINUOUS</p>
<p data-sp-type="action">Fine mist blows across the gravel roof. Beyond the parapet, the harbor bridge glows through fog. Elena follows a thick black coaxial cable from the stairwell bulkhead to the base of a rusted microwave horn.</p>
<p data-sp-type="character">ELENA</p>
<p data-sp-type="dialogue">The junction box is warm. Someone replaced the copper fuse this week.</p>
<p data-sp-type="character">MARCUS</p>
<p data-sp-type="dialogue">That dish hasn’t been wired to the grid since the port authority moved out in ’98.</p>
<p data-sp-type="action">A red indicator neon inside the weatherproof glass flickers—once, twice—in exact time with the three-note chime.</p>
<p data-sp-type="transition">DISSOLVE TO:</p>`,
    },
    {
      id: 'scene-3',
      unitKind: 'scene',
      slugline: 'INT. HARBOR DINER - DAWN',
      title: 'The Engineer’s Notebook',
      synopsis: 'Over black coffee, retired broadcast engineer Arthur decodes the station ID.',
      updatedAt: Date.now() - 600_000,
      contentHtml: `<p data-sp-type="slugline">INT. HARBOR DINER - DAWN</p>
<p data-sp-type="action">Rain streaks the fogged plate glass. ARTHUR COLE (70s), wool cardigan, hearing aid whistling faintly, adjusts his spectacles over a laminated frequency chart spread between two coffee mugs.</p>
<p data-sp-type="character">ARTHUR</p>
<p data-sp-type="dialogue">We called it the Lighthouse Loop. Every coastal station kept an automated tape running so ships could calibrate their direction finders in zero visibility.</p>
<p data-sp-type="character">ELENA</p>
<p data-sp-type="dialogue">Except the voice at the end of the reel uses my father’s call sign.</p>
<p data-sp-type="character">ARTHUR</p>
<p data-sp-type="parenthetical">(quietly)</p>
<p data-sp-type="dialogue">Your father built the transmitter on Gull Island, Elena. He never dismantled it.</p>
<p data-sp-type="transition">CUT TO:</p>`,
    },
  ],
};

export interface NewWorkOptions {
  includeOpeningSlugline?: boolean;
  openInTimeline?: boolean;
  pinToLibrary?: boolean;
  wordGoal?: number;
}

export function createNewWorkItem(
  title: string,
  options?: NewWorkOptions
): DocumentItem {
  const now = Date.now();
  const id = `doc-${now}-${Math.random().toString(36).slice(2, 7)}`;
  const pinned = Boolean(options?.pinToLibrary);

  const sc1Id = `scene-${now}-1`;
  const useSlug = options?.includeOpeningSlugline !== false;
  return {
    id,
    kind: 'screenplay',
    title: (title.trim() || 'UNTITLED SCREENPLAY').toUpperCase(),
    pinned,
    wordGoal: options?.wordGoal ?? 1000,
    contentHtml: '',
    activeUnitId: sc1Id,
    units: [
      {
        id: sc1Id,
        unitKind: 'scene',
        slugline: useSlug ? 'INT. LOCATION - DAY' : '',
        title: 'Opening Scene',
        synopsis: '',
        contentHtml: useSlug
          ? '<p data-sp-type="slugline">INT. LOCATION - DAY</p><p data-sp-type="action"><br></p>'
          : '<p data-sp-type="slugline"><br></p>',
        updatedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

/** Focus only opens screenplays; fall back to the starter if none remain. */
function normalizeLegacyDocuments(docs: DocumentItem[]): DocumentItem[] {
  const screenplays = docs.filter((d) => d.kind === 'screenplay');
  return screenplays.length > 0 ? screenplays : [STARTER_SCREENPLAY];
}

export function loadSettings(): WriterSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: WriterSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

export function loadDocumentsSync(): DocumentItem[] {
  try {
    const raw = localStorage.getItem(DOCS_KEY);
    if (!raw) {
      const defaults = [STARTER_SCREENPLAY];
      localStorage.setItem(DOCS_KEY, JSON.stringify(defaults));
      return defaults;
    }
    const parsed = JSON.parse(raw) as DocumentItem[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      const upgraded = normalizeLegacyDocuments(parsed);
      localStorage.setItem(DOCS_KEY, JSON.stringify(upgraded));
      return upgraded;
    }
    return [STARTER_SCREENPLAY];
  } catch {
    return [STARTER_SCREENPLAY];
  }
}

export function loadActiveDocIdSync(docs: DocumentItem[]): string {
  try {
    const saved = localStorage.getItem(ACTIVE_DOC_KEY);
    if (saved && docs.some((d) => d.id === saved)) {
      return saved;
    }
  } catch {
    // Ignore
  }
  return docs[0]?.id ?? STARTER_SCREENPLAY.id;
}

export function saveActiveDocIdSync(id: string): void {
  try {
    localStorage.setItem(ACTIVE_DOC_KEY, id);
  } catch {
    // Ignore
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveDocuments(docs: DocumentItem[]): Promise<void> {
  try {
    localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
  } catch {
    // Fallback to IndexedDB if localStorage quota exceeded
  }

  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      for (const doc of docs) {
        store.put(doc);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function hydrateDocumentsFromIndexedDB(): Promise<DocumentItem[] | null> {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const res = req.result as DocumentItem[] | undefined;
        if (res && res.length > 0) {
          const normalized = normalizeLegacyDocuments(res);
          resolve(normalized);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
