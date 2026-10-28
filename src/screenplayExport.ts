/**
 * Paginated screenplay export.
 *
 * Lays the script out the way screenwriting software does: US Letter,
 * Courier 12 (10 characters per inch, 6 lines per inch), 54 lines per page,
 * Final Draft's column widths. Text is wrapped here, in character columns, so
 * the page breaks computed below are exactly the ones that print.
 *
 * Page rules: scene headings never sit alone at the bottom of a page; speeches
 * split only at a sentence end, with (MORE) / NAME (CONT'D); action splits at
 * a sentence end with at least two lines on each side; dual dialogue never
 * splits; a new act starts a new page.
 */
import {
  DocumentItem,
  RevisionBaseline,
  RevisionColor,
  ScreenplayExportSettings,
} from './types';
import { DEFAULT_TITLE_PAGE_CREDIT, escapeHtml } from './editorUtils';
import type { ScreenplayBlockType } from './screenplay';

export const LINES_PER_PAGE = 54;
const TEXT_WIDTH = 60; // 1.5in → 7.5in at 10 chars per inch

export const REVISION_COLORS: RevisionColor[] = [
  'White',
  'Blue',
  'Pink',
  'Yellow',
  'Green',
  'Goldenrod',
  'Buff',
  'Salmon',
  'Cherry',
  'Tan',
];

export const DEFAULT_EXPORT_SETTINGS: Required<ScreenplayExportSettings> = {
  header: '',
  footer: '',
  pageNumbers: true,
  sceneNumbers: false,
  moreContd: true,
  autoContd: false,
  revisionMarks: true,
  titlePage: true,
};

export const resolveExportSettings = (
  doc: DocumentItem
): Required<ScreenplayExportSettings> => ({
  ...DEFAULT_EXPORT_SETTINGS,
  ...doc.screenplayExport,
});

// ---------------------------------------------------------------------------
// Element geometry (columns are characters from the 1.5in left margin)
// ---------------------------------------------------------------------------

interface Geometry {
  col: number;
  width: number;
  align: 'left' | 'right' | 'center';
  spaceBefore: number;
  caps?: boolean;
  bold?: boolean;
  underline?: boolean;
  italic?: boolean;
}

const GEOMETRY: Partial<Record<ScreenplayBlockType, Geometry>> = {
  slugline: { col: 0, width: TEXT_WIDTH, align: 'left', spaceBefore: 2, caps: true },
  action: { col: 0, width: TEXT_WIDTH, align: 'left', spaceBefore: 1 },
  general: { col: 0, width: TEXT_WIDTH, align: 'left', spaceBefore: 1 },
  character: { col: 22, width: 38, align: 'left', spaceBefore: 1, caps: true },
  parenthetical: { col: 16, width: 25, align: 'left', spaceBefore: 0 },
  dialogue: { col: 10, width: 35, align: 'left', spaceBefore: 0 },
  lyrics: { col: 10, width: 35, align: 'left', spaceBefore: 0, italic: true },
  transition: { col: 0, width: TEXT_WIDTH, align: 'right', spaceBefore: 1, caps: true },
  shot: { col: 0, width: TEXT_WIDTH, align: 'left', spaceBefore: 1, caps: true },
  centered: { col: 0, width: TEXT_WIDTH, align: 'center', spaceBefore: 1 },
  'cast-list': { col: 0, width: TEXT_WIDTH, align: 'left', spaceBefore: 0, caps: true },
  'act-break': {
    col: 0,
    width: TEXT_WIDTH,
    align: 'center',
    spaceBefore: 2,
    caps: true,
    bold: true,
    underline: true,
  },
  sequence: {
    col: 0,
    width: TEXT_WIDTH,
    align: 'left',
    spaceBefore: 2,
    caps: true,
    bold: true,
    underline: true,
  },
};

// Dual dialogue: two narrower columns (afterwriting/Beat proportions)
const DUAL_GEOMETRY: Record<'1' | '2', Partial<Record<ScreenplayBlockType, Geometry>>> = {
  '1': {
    character: { col: 10, width: 18, align: 'left', spaceBefore: 0, caps: true },
    parenthetical: { col: 7, width: 20, align: 'left', spaceBefore: 0 },
    dialogue: { col: 5, width: 26, align: 'left', spaceBefore: 0 },
    lyrics: { col: 5, width: 26, align: 'left', spaceBefore: 0, italic: true },
  },
  '2': {
    character: { col: 40, width: 18, align: 'left', spaceBefore: 0, caps: true },
    parenthetical: { col: 37, width: 20, align: 'left', spaceBefore: 0 },
    dialogue: { col: 35, width: 25, align: 'left', spaceBefore: 0 },
    lyrics: { col: 35, width: 25, align: 'left', spaceBefore: 0, italic: true },
  },
};

const WRITER_ONLY = new Set(['section', 'synopsis', 'note']);
const SPEECH_PARTS = new Set(['parenthetical', 'dialogue', 'lyrics']);

// ---------------------------------------------------------------------------
// Source parsing: blocks with styled text runs
// ---------------------------------------------------------------------------

export interface Run {
  text: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  s?: boolean;
}

interface SourceBlock {
  type: ScreenplayBlockType;
  /** Paragraph runs; '\n' marks a hard line break (Shift+Enter). */
  runs: Run[];
  plain: string;
  dual?: '1' | '2';
  revised: boolean;
  sceneNumber?: number;
}

const readRuns = (root: Node): Run[] => {
  const runs: Run[] = [];
  const walk = (node: Node, style: Omit<Run, 'text'>) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').replace(/ /g, ' ');
      if (text) runs.push({ text, ...style });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') {
      runs.push({ text: '\n', ...style });
      return;
    }
    const next = { ...style };
    if (tag === 'b' || tag === 'strong') next.b = true;
    if (tag === 'i' || tag === 'em') next.i = true;
    if (tag === 'u') next.u = true;
    if (tag === 's' || tag === 'strike' || tag === 'del') next.s = true;
    el.childNodes.forEach((child) => walk(child, next));
  };
  walk(root, {});
  // A trailing <br> is the browser's empty-line placeholder, not a break
  while (runs.length && runs[runs.length - 1].text === '\n') runs.pop();
  return runs;
};

/** "type|text" signature used to compare against a locked draft. */
export const blockSignature = (type: string, text: string) =>
  `${type}|${text.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()}`;

/** Signatures of every printed block in each unit (for locking a draft). */
export const snapshotSignatures = (doc: DocumentItem): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  (doc.units ?? []).forEach((unit) => {
    const temp = document.createElement('div');
    temp.innerHTML = unit.contentHtml;
    out[unit.id] = Array.from(temp.children)
      .map((el) => {
        const type = el.getAttribute('data-sp-type') || 'action';
        return WRITER_ONLY.has(type) ? null : blockSignature(type, el.textContent || '');
      })
      .filter((sig): sig is string => sig !== null);
  });
  return out;
};

const parseDocument = (
  doc: DocumentItem,
  baseline: RevisionBaseline | undefined,
  markRevisions: boolean
): SourceBlock[] => {
  const blocks: SourceBlock[] = [];
  let sceneNumber = 0;
  (doc.units ?? []).forEach((unit) => {
    const temp = document.createElement('div');
    temp.innerHTML = unit.contentHtml;
    // Multiset of the locked draft's lines for this unit
    const remaining = new Map<string, number>();
    baseline?.units[unit.id]?.forEach((sig) =>
      remaining.set(sig, (remaining.get(sig) ?? 0) + 1)
    );
    Array.from(temp.children).forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('data-sp-type') || 'action') as ScreenplayBlockType;
      if (WRITER_ONLY.has(type)) return;
      if (tag === 'hr' || type === 'page-break') {
        blocks.push({ type: 'page-break', runs: [], plain: '', revised: false });
        return;
      }
      const plain = (el.textContent || '').replace(/ /g, ' ').trim();
      if (!plain) return;
      const sig = blockSignature(type, plain);
      let revised = false;
      if (markRevisions && baseline) {
        const left = remaining.get(sig) ?? 0;
        if (left > 0) remaining.set(sig, left - 1);
        else revised = true;
      }
      const dual = el.getAttribute('data-dual');
      blocks.push({
        type,
        runs: readRuns(el),
        plain,
        dual: dual === '1' || dual === '2' ? dual : undefined,
        revised,
        sceneNumber: type === 'slugline' ? ++sceneNumber : undefined,
      });
    });
  });
  return blocks;
};

// ---------------------------------------------------------------------------
// Wrapping: styled runs → lines of at most `width` characters
// ---------------------------------------------------------------------------

type Line = Run[];

const transformRuns = (runs: Run[], geo: Geometry): Run[] =>
  runs.map((r) => ({
    ...r,
    text: geo.caps ? r.text.toUpperCase() : r.text,
    b: r.b || geo.bold,
    i: r.i || geo.italic,
    u: r.u || geo.underline,
  }));

const wrapRuns = (runs: Run[], width: number): Line[] => {
  // Tokens: words and single spaces keep their style; '\n' forces a break
  const tokens: Run[] = [];
  runs.forEach((run) => {
    run.text.split(/(\n| )/).forEach((piece) => {
      if (piece) tokens.push({ ...run, text: piece });
    });
  });

  const lines: Line[] = [];
  let line: Line = [];
  let length = 0;
  const pushLine = () => {
    // Trailing spaces do not count toward the printed line
    while (line.length && line[line.length - 1].text === ' ') line.pop();
    lines.push(line);
    line = [];
    length = 0;
  };

  tokens.forEach((token) => {
    if (token.text === '\n') {
      pushLine();
      return;
    }
    if (token.text === ' ') {
      if (length > 0 && length < width) {
        line.push(token);
        length += 1;
      }
      return;
    }
    let word = token.text;
    // A word longer than the column is broken hard
    while (word.length > width) {
      if (length > 0) pushLine();
      line.push({ ...token, text: word.slice(0, width) });
      length = width;
      pushLine();
      word = word.slice(width);
    }
    if (length + word.length > width) pushLine();
    line.push({ ...token, text: word });
    length += word.length;
  });
  if (line.length || lines.length === 0) pushLine();
  return lines;
};

// ---------------------------------------------------------------------------
// Layout items
// ---------------------------------------------------------------------------

export interface Segment {
  col: number;
  width: number;
  align: 'left' | 'right' | 'center';
  runs: Run[];
}

export interface Row {
  segments: Segment[];
  revised?: boolean;
  sceneNumber?: number;
}

interface LaidLine {
  segment: Segment;
  revised: boolean;
  sceneNumber?: number;
  /** Line belongs to a parenthetical (never end a page on one). */
  paren?: boolean;
}

/** A block still holding its text, so it can be split at a sentence end. */
interface Part {
  block: SourceBlock;
  geo: Geometry;
}

type Item =
  | { kind: 'page-break' }
  | {
      kind: 'element';
      type: ScreenplayBlockType;
      spaceBefore: number;
      part: Part;
      keepWithNext: boolean;
      /** End-of-act lines stay on the page of what precedes them. */
      keepWithPrevious: boolean;
      splittable: boolean;
      newPage: boolean;
    }
  | {
      kind: 'speech';
      spaceBefore: number;
      cue: LaidLine[];
      cueText: string;
      cueGeo: Geometry;
      cueRevised: boolean;
      parts: Part[];
    }
  | { kind: 'dual'; spaceBefore: number; rows: Row[] };

const layoutBlock = (block: SourceBlock, geo: Geometry): LaidLine[] => {
  const lines = wrapRuns(transformRuns(block.runs, geo), geo.width);
  return lines.map((runs, idx) => ({
    segment: { col: geo.col, width: geo.width, align: geo.align, runs },
    revised: block.revised,
    sceneNumber: idx === 0 ? block.sceneNumber : undefined,
    paren: block.type === 'parenthetical',
  }));
};

const layoutPart = (part: Part) => layoutBlock(part.block, part.geo);

/** Character offsets right after each sentence end (". ", "? ", "-- "…). */
const sentenceEnds = (runs: Run[]) => {
  const text = runs.map((r) => r.text).join('');
  const ends: number[] = [];
  const re = /([.!?…]["'’”)\]]*|--)(?=\s+\S)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) ends.push(m.index + m[0].length);
  return ends;
};

/** Runs between two character offsets. */
const sliceRuns = (runs: Run[], start: number, end = Infinity): Run[] => {
  const out: Run[] = [];
  let pos = 0;
  runs.forEach((run) => {
    const from = Math.max(start, pos);
    const to = Math.min(end, pos + run.text.length);
    if (to > from) out.push({ ...run, text: run.text.slice(from - pos, to - pos) });
    pos += run.text.length;
  });
  return out;
};

const trimRunsStart = (runs: Run[]): Run[] => {
  const out = runs.map((r) => ({ ...r }));
  while (out.length && /^\s/.test(out[0].text)) {
    out[0].text = out[0].text.replace(/^\s+/, '');
    if (!out[0].text) out.shift();
  }
  return out;
};

/**
 * Fit the start of `parts` into `budget` lines, breaking only at a sentence
 * end (inside a block) or between blocks, never right after a parenthetical.
 * Returns the lines for this page and the parts left for the next one.
 */
const splitParts = (
  parts: Part[],
  budget: number,
  minFirst: number,
  minRest: number
): { first: LaidLine[]; rest: Part[] } | null => {
  const first: LaidLine[] = [];
  let best: { first: LaidLine[]; rest: Part[] } | null = null;
  const restLines = (rest: Part[]) => rest.reduce((n, p) => n + layoutPart(p).length, 0);

  for (let idx = 0; idx < parts.length; idx += 1) {
    const part = parts[idx];
    const lines = layoutPart(part);
    if (first.length + lines.length <= budget) {
      first.push(...lines);
      const rest = parts.slice(idx + 1);
      if (
        rest.length &&
        part.block.type !== 'parenthetical' &&
        first.length >= minFirst &&
        restLines(rest) >= minRest
      ) {
        best = { first: [...first], rest };
      }
      continue;
    }
    // This block does not fit whole: break it at the latest sentence end that does
    if (part.block.type !== 'parenthetical') {
      const ends = sentenceEnds(part.block.runs).reverse();
      for (const end of ends) {
        const head: Part = { ...part, block: { ...part.block, runs: sliceRuns(part.block.runs, 0, end) } };
        const headLines = layoutPart(head);
        if (first.length + headLines.length > budget) continue;
        const tail: Part = {
          ...part,
          block: {
            ...part.block,
            runs: trimRunsStart(sliceRuns(part.block.runs, end)),
            sceneNumber: undefined,
          },
        };
        const rest = [tail, ...parts.slice(idx + 1)];
        if (first.length + headLines.length >= minFirst && restLines(rest) >= minRest) {
          return { first: [...first, ...headLines], rest };
        }
      }
    }
    break;
  }
  return best;
};

const cueName = (text: string) =>
  text
    .replace(/\(.*?\)/g, '')
    .replace(/\^$/, '')
    .trim()
    .toUpperCase();

const buildItems = (
  blocks: SourceBlock[],
  settings: Required<ScreenplayExportSettings>
): Item[] => {
  const items: Item[] = [];
  let lastSpeaker: string | null = null;
  let i = 0;

  const speechFrom = (start: number, dualSide?: '1' | '2') => {
    const cueBlock = blocks[start];
    const geos = dualSide ? DUAL_GEOMETRY[dualSide] : GEOMETRY;
    let cueText = cueBlock.plain;
    // Automatic continueds: the same character speaks again after action
    const name = cueName(cueText);
    if (settings.autoContd && !dualSide && lastSpeaker === name && !/\(CONT['’]D\)/i.test(cueText)) {
      cueText = `${cueText} (CONT'D)`;
    }
    const cueGeo = geos.character!;
    const cue = layoutBlock({ ...cueBlock, runs: [{ text: cueText }] }, cueGeo);
    const parts: Part[] = [];
    let j = start + 1;
    while (j < blocks.length && SPEECH_PARTS.has(blocks[j].type) && blocks[j].dual === dualSide) {
      parts.push({ block: blocks[j], geo: geos[blocks[j].type]! });
      j += 1;
    }
    return { cue, cueText, cueGeo, cueRevised: cueBlock.revised, parts, next: j, name };
  };

  while (i < blocks.length) {
    const block = blocks[i];

    if (block.type === 'page-break') {
      items.push({ kind: 'page-break' });
      i += 1;
      continue;
    }

    if (block.type === 'slugline') lastSpeaker = null;

    // Dual dialogue: a '1' speech followed directly by a '2' speech
    if (block.type === 'character' && block.dual === '1') {
      const left = speechFrom(i, '1');
      if (blocks[left.next]?.type === 'character' && blocks[left.next]?.dual === '2') {
        const right = speechFrom(left.next, '2');
        const leftLines = [...left.cue, ...left.parts.flatMap(layoutPart)];
        const rightLines = [...right.cue, ...right.parts.flatMap(layoutPart)];
        const rows: Row[] = [];
        for (let r = 0; r < Math.max(leftLines.length, rightLines.length); r += 1) {
          const segments = [leftLines[r]?.segment, rightLines[r]?.segment].filter(
            (seg): seg is Segment => Boolean(seg)
          );
          rows.push({ segments, revised: Boolean(leftLines[r]?.revised || rightLines[r]?.revised) });
        }
        items.push({ kind: 'dual', spaceBefore: 1, rows });
        lastSpeaker = null;
        i = right.next;
        continue;
      }
    }

    if (block.type === 'character') {
      const speech = speechFrom(i);
      items.push({
        kind: 'speech',
        spaceBefore: GEOMETRY.character!.spaceBefore,
        cue: speech.cue,
        cueText: speech.cueText,
        cueGeo: speech.cueGeo,
        cueRevised: speech.cueRevised,
        parts: speech.parts,
      });
      lastSpeaker = speech.name;
      i = speech.next;
      continue;
    }

    const geo = GEOMETRY[block.type] ?? GEOMETRY.action!;
    const isAct = block.type === 'act-break';
    const endsAct = isAct && /^END\b/i.test(block.plain);
    items.push({
      kind: 'element',
      type: block.type,
      spaceBefore: geo.spaceBefore,
      part: { block, geo },
      keepWithNext:
        ['slugline', 'shot', 'sequence', 'cast-list'].includes(block.type) || (isAct && !endsAct),
      keepWithPrevious: endsAct || block.type === 'transition',
      splittable: block.type === 'action' || block.type === 'general',
      newPage: isAct && !endsAct,
    });
    i += 1;
  }
  return items;
};

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface Page {
  /** Script page number (the title page is not counted). */
  number: number;
  rows: Row[];
}

const toRow = (line: LaidLine): Row => ({
  segments: [line.segment],
  revised: line.revised,
  sceneNumber: line.sceneNumber,
});

const itemHeight = (item: Item): number =>
  item.kind === 'page-break'
    ? 0
    : item.kind === 'element'
    ? layoutPart(item.part).length
    : item.kind === 'speech'
    ? item.cue.length + item.parts.reduce((n, p) => n + layoutPart(p).length, 0)
    : item.rows.length;

const paginate = (items: Item[], settings: Required<ScreenplayExportSettings>): Page[] => {
  const pages: Page[] = [{ number: 1, rows: [] }];
  const page = () => pages[pages.length - 1];
  const used = () => page().rows.length;
  const newPage = () => {
    if (used() > 0) pages.push({ number: pages.length + 1, rows: [] });
  };
  const room = () => LINES_PER_PAGE - used();
  const gapOf = (item: Item) => (used() === 0 || item.kind === 'page-break' ? 0 : item.spaceBefore);
  const space = (n: number) => {
    if (used() === 0) return; // blank lines never open a page
    for (let k = 0; k < n && used() < LINES_PER_PAGE; k += 1) page().rows.push({ segments: [] });
  };
  const placeLines = (lines: LaidLine[]) =>
    lines.forEach((line) => {
      if (room() <= 0) newPage();
      page().rows.push(toRow(line));
    });
  const moreRow = (geo: Geometry): Row => ({
    segments: [{ col: geo.col, width: geo.width, align: 'left', runs: [{ text: '(MORE)' }] }],
  });

  items.forEach((item, idx) => {
    if (item.kind === 'page-break') {
      newPage();
      return;
    }
    if (item.kind === 'element' && item.newPage) newPage();

    // Lines that must share this item's page: a following transition or
    // end-of-act line, or the first lines after a heading
    const next = items[idx + 1];
    const tail =
      next && next.kind === 'element' && next.keepWithPrevious
        ? next.spaceBefore + itemHeight(next)
        : 0;
    const follow =
      item.kind === 'element' && item.keepWithNext && next && next.kind !== 'page-break'
        ? next.spaceBefore + Math.min(2, itemHeight(next))
        : 0;
    const height = itemHeight(item);

    if (gapOf(item) + height + tail + follow <= room()) {
      space(gapOf(item));
      if (item.kind === 'element') placeLines(layoutPart(item.part));
      else if (item.kind === 'speech')
        placeLines([...item.cue, ...item.parts.flatMap(layoutPart)]);
      else item.rows.forEach((row) => page().rows.push(row));
      return;
    }

    if (item.kind === 'dual' || (item.kind === 'element' && !item.splittable)) {
      newPage();
      if (item.kind === 'dual') item.rows.forEach((row) => {
        if (room() <= 0) newPage();
        page().rows.push(row);
      });
      else placeLines(layoutPart(item.part));
      return;
    }

    if (item.kind === 'element') {
      // Action: split at a sentence end, two lines minimum on each side
      if (used() > 0) {
        const split = splitParts([item.part], room() - gapOf(item), 2, 2);
        if (split) {
          space(gapOf(item));
          placeLines(split.first);
          newPage();
          placeLines(split.rest.flatMap(layoutPart));
          return;
        }
      }
      newPage();
      placeLines(layoutPart(item.part));
      return;
    }

    // Speech: split at a sentence end with (MORE) / NAME (CONT'D)
    const reserveMore = settings.moreContd ? 1 : 0;
    const contdCue: LaidLine[] = settings.moreContd
      ? [
          {
            segment: {
              col: item.cueGeo.col,
              width: item.cueGeo.width,
              align: 'left',
              runs: [
                {
                  text: /\(CONT['’]D\)/i.test(item.cueText)
                    ? item.cueText.toUpperCase()
                    : `${item.cueText.toUpperCase()} (CONT'D)`,
                },
              ],
            },
            revised: item.cueRevised,
          },
        ]
      : [];

    let cue = item.cue;
    let parts = item.parts;
    let guard = 0;
    while (guard++ < 200) {
      const bodyLines = parts.reduce((n, p) => n + layoutPart(p).length, 0);
      const gap = gapOf(item);
      if (gap + cue.length + bodyLines + tail <= room()) {
        space(gap);
        placeLines([...cue, ...parts.flatMap(layoutPart)]);
        return;
      }
      const budget = room() - gap - cue.length - reserveMore;
      const tooTall = cue.length + bodyLines + tail > LINES_PER_PAGE;
      const split =
        budget >= 2 && (used() > 0 || tooTall) ? splitParts(parts, budget, 2, 1) : null;
      if (split) {
        space(gap);
        placeLines([...cue, ...split.first]);
        if (settings.moreContd) page().rows.push(moreRow(item.cueGeo));
        newPage();
        cue = contdCue.length ? contdCue : [];
        parts = split.rest;
        continue;
      }
      if (used() === 0) {
        // Longer than a page with no sentence end to break at: break by line
        const lines = parts.flatMap(layoutPart);
        const take = Math.max(1, LINES_PER_PAGE - cue.length - reserveMore);
        placeLines([...cue, ...lines.slice(0, take)]);
        if (lines.length > take) {
          if (settings.moreContd) page().rows.push(moreRow(item.cueGeo));
          newPage();
          placeLines([...(contdCue.length ? contdCue : []), ...lines.slice(take)]);
        }
        return;
      }
      newPage();
    }
  });

  // Drop a trailing empty page
  if (pages.length > 1 && pages[pages.length - 1].rows.length === 0) pages.pop();
  return pages;
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
  });

export const fillTokens = (
  template: string,
  doc: DocumentItem,
  pageNumber: number
) =>
  template
    .replace(/\{title\}/gi, doc.title.trim() || 'Untitled')
    .replace(/\{page\}/gi, String(pageNumber))
    .replace(/\{date\}/gi, formatDate(Date.now()))
    .replace(
      /\{revision\}/gi,
      doc.revisionBaseline
        ? `${doc.revisionBaseline.color} Rev. ${formatDate(Date.now())}`
        : ''
    )
    .trim();

const renderRuns = (runs: Run[]) =>
  runs
    .map((r) => {
      let html = escapeHtml(r.text);
      if (r.b) html = `<b>${html}</b>`;
      if (r.i) html = `<i>${html}</i>`;
      if (r.u) html = `<u>${html}</u>`;
      if (r.s) html = `<s>${html}</s>`;
      return html;
    })
    .join('');

const renderTitlePage = (doc: DocumentItem) => {
  const tp = doc.titlePage ?? {};
  const lines = (text?: string) =>
    (text ?? '')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => `<div>${escapeHtml(line)}</div>`)
      .join('');
  const credit = tp.credit ?? DEFAULT_TITLE_PAGE_CREDIT;
  return `<section class="sp-page sp-title-page">
  <div class="sp-title-center">
    <div class="sp-title"><b><u>${escapeHtml((doc.title.trim() || 'Untitled').toUpperCase())}</u></b></div>
    ${tp.episode?.trim() ? `<div class="sp-gap1">&ldquo;${escapeHtml(tp.episode.trim())}&rdquo;</div>` : ''}
    ${credit.trim() ? `<div class="sp-gap2">${lines(credit)}</div>` : ''}
    ${tp.author?.trim() ? `<div class="sp-gap1">${lines(tp.author)}</div>` : ''}
    ${tp.source?.trim() ? `<div class="sp-gap2">${lines(tp.source)}</div>` : ''}
  </div>
  <div class="sp-title-foot">
    <div>${lines(tp.contact)}${tp.contact?.trim() && tp.draftDate?.trim() ? '<div>&nbsp;</div>' : ''}${lines(tp.draftDate)}</div>
    <div class="sp-right">${lines(tp.notes)}${tp.notes?.trim() && tp.copyright?.trim() ? '<div>&nbsp;</div>' : ''}${lines(tp.copyright)}</div>
  </div>
</section>`;
};

const renderPage = (
  page: Page,
  doc: DocumentItem,
  settings: Required<ScreenplayExportSettings>
) => {
  const header = settings.header ? fillTokens(settings.header, doc, page.number) : '';
  const footer = settings.footer ? fillTokens(settings.footer, doc, page.number) : '';
  const showNumber = settings.pageNumbers && page.number > 1;
  const rows = page.rows
    .map((row, idx) => {
      const top = idx; // in lines
      const segs = row.segments
        .map(
          (seg) =>
            `<div class="sp-seg sp-${seg.align}" style="left:${seg.col}ch;width:${seg.width}ch">${renderRuns(seg.runs)}</div>`
        )
        .join('');
      const scene =
        settings.sceneNumbers && row.sceneNumber
          ? `<div class="sp-scene-l">${row.sceneNumber}</div><div class="sp-scene-r">${row.sceneNumber}</div>`
          : '';
      const mark = settings.revisionMarks && row.revised && row.segments.length ? '<div class="sp-rev">*</div>' : '';
      return segs || scene || mark
        ? `<div class="sp-row" style="top:calc(${top} * var(--sp-line))">${segs}${scene}${mark}</div>`
        : '';
    })
    .join('');
  return `<section class="sp-page">
  ${header || showNumber ? `<div class="sp-header">${header ? `<div class="sp-header-text">${escapeHtml(header)}</div>` : ''}${showNumber ? `<div class="sp-page-number">${page.number}.</div>` : ''}</div>` : ''}
  <div class="sp-body">${rows}</div>
  ${footer ? `<div class="sp-footer">${escapeHtml(footer)}</div>` : ''}
</section>`;
};

const STYLES = `
  :root { --sp-line: 12pt; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { background: #e9e5dd; font-family: 'Courier Prime', 'Courier New', Courier, monospace; font-size: 12pt; color: #111; -webkit-font-smoothing: antialiased; }
  .sp-pages { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 32px 16px; }
  .sp-page { position: relative; width: 8.5in; height: 11in; background: #fff; box-shadow: 0 1px 2px rgb(0 0 0 / 0.08), 0 12px 32px -12px rgb(0 0 0 / 0.25); overflow: hidden; flex: none; }
  .sp-body { position: absolute; top: 1in; left: 1.5in; width: 6in; height: calc(${LINES_PER_PAGE} * var(--sp-line)); }
  .sp-row { position: absolute; left: 0; right: 0; height: var(--sp-line); line-height: var(--sp-line); }
  .sp-seg { position: absolute; top: 0; white-space: pre; overflow: visible; }
  .sp-left { text-align: left; } .sp-right { text-align: right; } .sp-center { text-align: center; }
  .sp-scene-l { position: absolute; right: calc(100% + 0.5in); top: 0; }
  .sp-scene-r { position: absolute; left: calc(100% + 0.1in); top: 0; }
  .sp-rev { position: absolute; left: calc(100% + 0.6in); top: 0; font-weight: bold; }
  .sp-header { position: absolute; top: 0.5in; left: 1.5in; width: 6in; height: var(--sp-line); line-height: var(--sp-line); display: flex; justify-content: space-between; gap: 2ch; }
  .sp-header-text { white-space: pre; overflow: hidden; text-overflow: ellipsis; }
  .sp-page-number { margin-left: auto; }
  .sp-footer { position: absolute; bottom: 0.5in; left: 1.5in; width: 6in; text-align: center; white-space: pre; }
  .sp-title-page { display: flex; flex-direction: column; padding: 3.5in 1in 1in 1.5in; }
  .sp-title-center { text-align: center; line-height: var(--sp-line); }
  .sp-gap1 { margin-top: var(--sp-line); } .sp-gap2 { margin-top: calc(2 * var(--sp-line)); }
  .sp-title-foot { margin-top: auto; display: flex; justify-content: space-between; gap: 4ch; line-height: var(--sp-line); }
  @page { size: letter; margin: 0; }
  @media print {
    body { background: #fff; }
    .sp-pages { display: block; padding: 0; }
    .sp-page { box-shadow: none; break-after: page; page-break-after: always; }
    .sp-page:last-child { break-after: auto; page-break-after: auto; }
  }
`;

export interface ScreenplayRender {
  html: string;
  pageCount: number;
}

/** Full paginated HTML document for download, print, or preview. */
export const renderScreenplayHtml = (
  doc: DocumentItem,
  overrides?: ScreenplayExportSettings,
  options: { preview?: boolean } = {}
): ScreenplayRender => {
  const settings = { ...resolveExportSettings(doc), ...overrides };
  const blocks = parseDocument(doc, doc.revisionBaseline, settings.revisionMarks);
  const pages = paginate(buildItems(blocks, settings), settings);
  const title = escapeHtml(doc.title.trim() || 'Untitled');
  const body = [
    settings.titlePage ? renderTitlePage(doc) : '',
    ...pages.map((page) => renderPage(page, doc, settings)),
  ].join('\n');
  const previewCss = options.preview
    ? 'body{zoom:0.5;background:transparent}.sp-pages{padding:16px 8px}'
    : '';
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet" />
<style>${STYLES}${previewCss}</style>
</head>
<body>
<main class="sp-pages">
${body}
</main>
</body>
</html>`;
  return { html, pageCount: pages.length };
};
