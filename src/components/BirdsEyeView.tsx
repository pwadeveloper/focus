import React, { useState, useEffect, useRef, useMemo } from 'react';
import gsap from 'gsap';
import {
  Plus,
  Film,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Trash2,
  ArrowUpRight,
  GitCommitHorizontal,
  LayoutGrid,
  Archive,
  Clock,
  MessageSquare,
  Sun,
  Moon,
  Sunrise,
  FileText,
  Check,
} from 'lucide-react';
import { BirdsEyeLayoutMode, DocumentItem, DocumentUnit } from '../types';
import {
  computeDocumentTotalMetrics,
  computeMetrics,
  extractPlainTextSnippet,
  getUnitBadgeLabel,
} from '../editorUtils';
import { canHover, gsapButtonHover, prefersReducedMotion } from '../motion';
import { INSPECTOR, SegmentedTickMeter } from './ProjectCabinetView';
import { NarrativeTimeline } from './NarrativeTimeline';
import {
  STATUS_STYLE,
  WORK_KIND_TONE,
  timeOfDayTone,
  toneChip,
  toneVar,
  toneWash,
} from '../palette';

interface BirdsEyeViewProps {
  doc: DocumentItem;
  activeUnitId: string;
  onSelectUnitAndWrite: (unitId: string) => void;
  onUpdateDocTitle: (title: string) => void;
  onUpdateDocSubtitle: (subtitle: string) => void;
  /** Open the title page editor. */
  onOpenTitlePage?: () => void;
  onAddUnit: () => void;
  onUpdateUnitMeta: (
    unitId: string,
    patch: Partial<Pick<DocumentUnit, 'title' | 'synopsis' | 'slugline'>>
  ) => void;
  onMoveUnit: (unitId: string, direction: -1 | 1) => void;
  onDeleteUnit: (unitId: string) => void;
  onOpenProjectCabinet?: () => void;
}

interface ParsedSlugline {
  env: 'INT' | 'EXT' | 'INT/EXT' | 'SCENE';
  location: string;
  timeOfDay: 'DAY' | 'NIGHT' | 'DAWN' | 'DUSK' | 'LATER' | 'CONTINUOUS' | string;
}

function parseSlugline(raw?: string): ParsedSlugline {
  const clean = (raw || 'INT. LOCATION - DAY').trim().toUpperCase();
  let env: ParsedSlugline['env'] = 'SCENE';
  let rest = clean;

  if (clean.startsWith('INT./EXT.') || clean.startsWith('I/E.')) {
    env = 'INT/EXT';
    rest = clean.replace(/^(INT\.\/EXT\.|I\/E\.)\s*/, '');
  } else if (clean.startsWith('INT.')) {
    env = 'INT';
    rest = clean.replace(/^INT\.\s*/, '');
  } else if (clean.startsWith('EXT.')) {
    env = 'EXT';
    rest = clean.replace(/^EXT\.\s*/, '');
  }

  const dashParts = rest.split(/\s+-\s+/);
  const location = dashParts[0] || 'UNSPECIFIED LOCATION';
  const timeOfDay = dashParts[1] || 'DAY';

  return { env, location, timeOfDay };
}

function extractSceneDialogueMeta(html: string): {
  characters: string[];
  dialogueCount: number;
} {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const set = new Set<string>();
  let dialogueCount = 0;

  temp.querySelectorAll('p[data-sp-type="character"]').forEach((node) => {
    const name = (node.textContent || '')
      .replace(/\(.*?\)/g, '')
      .trim()
      .toUpperCase();
    if (name) set.add(name);
  });

  temp.querySelectorAll('p[data-sp-type="dialogue"]').forEach(() => {
    dialogueCount += 1;
  });

  return {
    characters: Array.from(set).slice(0, 5),
    dialogueCount,
  };
}

const toTitleCase = (name: string) =>
  name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export const BirdsEyeView: React.FC<BirdsEyeViewProps> = ({
  doc,
  activeUnitId,
  onSelectUnitAndWrite,
  onUpdateDocTitle,
  onUpdateDocSubtitle,
  onOpenTitlePage,
  onAddUnit,
  onUpdateUnitMeta,
  onMoveUnit,
  onDeleteUnit,
  onOpenProjectCabinet,
}) => {
  const [layoutMode, setLayoutMode] = useState<BirdsEyeLayoutMode>('timeline');
  const [confirmDeleteUnitId, setConfirmDeleteUnitId] = useState<string | null>(
    null
  );
  const [inspectedCabinetUnitId, setInspectedCabinetUnitId] =
    useState<string>(activeUnitId);

  const containerRef = useRef<HTMLDivElement>(null);
  const cabinetInspectorRef = useRef<HTMLDivElement>(null);

  const units = doc.units || [];
  const totalMetrics = computeDocumentTotalMetrics(doc);

  const targetWordsPerUnit = 280;

  // Keep cabinet inspector id valid
  useEffect(() => {
    if (!units.some((u) => u.id === inspectedCabinetUnitId) && units[0]) {
      setInspectedCabinetUnitId(activeUnitId || units[0].id);
    }
  }, [units, inspectedCabinetUnitId, activeUnitId]);

  const btnHover = gsapButtonHover({
    hoverScale: 1.03,
    hoverY: -0.5,
    pressScale: 0.96,
  });

  // Precompute unit metrics and cumulative timeline offsets
  const enrichedUnits = useMemo(() => {
    let runningWords = 0;
    let runningMinutes = 0;

    return units.map((unit, index) => {
      const m = computeMetrics(unit.contentHtml);
      const startMinute = runningMinutes;
      const startWord = runningWords;
      const durationMinutes = Math.max(1, Math.round(m.words / 160) || 1);
      runningWords += m.words;
      runningMinutes += durationMinutes;

      const badge = getUnitBadgeLabel(unit, units);
      const snippet = extractPlainTextSnippet(unit.contentHtml, 170);
      const parsedSlug = parseSlugline(unit.slugline);
      const dialogueMeta = extractSceneDialogueMeta(unit.contentHtml);

      const statusLabel =
        m.words >= targetWordsPerUnit * 0.85
          ? 'Polished'
          : m.words >= 80
          ? 'In Progress'
          : 'Outline';

      const statusStyle = STATUS_STYLE[statusLabel];
      const statusColor = statusStyle.dot;
      const statusFill = statusStyle.tone
        ? toneVar(statusStyle.tone)
        : 'var(--bg-surface)';
      const sectionTone = timeOfDayTone(parsedSlug.timeOfDay);

      const beats = dialogueMeta.characters.map(toTitleCase);
      if (beats.length === 0 && unit.synopsis?.trim()) {
        beats.push(unit.synopsis.trim());
      }

      return {
        unit,
        index,
        metrics: m,
        beats,
        startMinute,
        startWord,
        durationMinutes,
        badge,
        snippet,
        parsedSlug,
        dialogueMeta,
        statusLabel,
        statusColor,
        statusFill,
        sectionTone,
      };
    });
  }, [units, targetWordsPerUnit]);

  // Staggered GSAP entrance when Bird's-Eye View mounts or switches layout
  useEffect(() => {
    const el = containerRef.current;
    if (!el || prefersReducedMotion()) return;

    const nodes = el.querySelectorAll('[data-birdseye-tile="true"]');
    if (nodes.length > 0) {
      gsap.fromTo(
        nodes,
        { opacity: 0, y: 12, scale: 0.985 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.25,
          stagger: 0.025,
          ease: 'power3.out',
          overwrite: 'auto',
        }
      );
    }
  }, [doc.id, layoutMode]);

  // Animate only inner text of cabinet inspector card so card frame and folders never shift
  useEffect(() => {
    if (layoutMode !== 'cabinet') return;
    const el = cabinetInspectorRef.current;
    if (!el || prefersReducedMotion()) return;
    gsap.fromTo(
      el,
      { y: 3, opacity: 0.55 },
      { y: 0, opacity: 1, duration: 0.16, ease: 'power2.out', overwrite: true }
    );
  }, [inspectedCabinetUnitId, layoutMode]);

  const handleTileHoverEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReducedMotion() || !canHover()) return;
    gsap.to(e.currentTarget, {
      y: -2.5,
      scale: 1.005,
      duration: 0.18,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  };

  const handleTileHoverLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReducedMotion()) return;
    gsap.to(e.currentTarget, {
      y: 0,
      scale: 1,
      duration: 0.2,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  };

  // ============================================================================
  // CARD TILE RENDERER (Cards layout)
  // ============================================================================
  const renderCardTile = (unit: DocumentUnit) => {
    const item = enrichedUnits.find((e) => e.unit.id === unit.id);
    if (!item) return null;

    const {
      index: globalIdx,
      metrics: unitMetrics,
      durationMinutes,
      badge,
      snippet,
      parsedSlug,
      dialogueMeta,
      statusLabel,
      statusColor,
      statusFill,
      sectionTone,
    } = item;
    const isActive = unit.id === activeUnitId;
    const isConfirmingDelete = confirmDeleteUnitId === unit.id;

    return (
      <div
        key={unit.id}
        data-birdseye-tile="true"
        onMouseEnter={handleTileHoverEnter}
        onMouseLeave={handleTileHoverLeave}
        style={{
          backgroundColor: 'var(--bg-elevated)',
          boxShadow: isActive
            ? '0 0 0 2px var(--accent), var(--elevation-raised)'
            : 'var(--elevation-raised)',
        }}
        className="group relative flex flex-col justify-between rounded-2xl p-4 transition-shadow duration-150"
      >
        <div>
          {/* Status + section pills: fixed height, never wrap mid-label */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span
              style={{ backgroundColor: statusFill, color: 'var(--on-pastel)' }}
              className="inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full pl-2 pr-2.5 text-[10px] font-medium leading-none"
            >
              <span
                aria-hidden="true"
                style={{ backgroundColor: statusColor }}
                className="size-1.5 shrink-0 rounded-full"
              />
              {statusLabel}
            </span>
            <span
              style={toneChip(sectionTone)}
              className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full px-2 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.05em]"
            >
              {badge}
            </span>
          </div>

          {/* Card actions: floating toolbar on hover devices, inline row on touch */}
          <div
            style={{ backgroundColor: 'var(--bg-elevated)' }}
            className="mb-3 flex items-center justify-end gap-1.5 [@media(hover:hover)_and_(pointer:fine)]:pointer-events-none [@media(hover:hover)_and_(pointer:fine)]:absolute [@media(hover:hover)_and_(pointer:fine)]:right-3 [@media(hover:hover)_and_(pointer:fine)]:top-0 [@media(hover:hover)_and_(pointer:fine)]:-translate-y-1/2 [@media(hover:hover)_and_(pointer:fine)]:z-10 [@media(hover:hover)_and_(pointer:fine)]:mb-0 [@media(hover:hover)_and_(pointer:fine)]:rounded-full [@media(hover:hover)_and_(pointer:fine)]:p-0.5 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:shadow-[var(--elevation-floating)] [@media(hover:hover)_and_(pointer:fine)]:transition-opacity [@media(hover:hover)_and_(pointer:fine)]:duration-150 [@media(hover:hover)_and_(pointer:fine)]:focus-within:pointer-events-auto [@media(hover:hover)_and_(pointer:fine)]:focus-within:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover:pointer-events-auto [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100"
          >
              <button
                type="button"
                disabled={globalIdx === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveUnit(unit.id, -1);
                }}
                aria-label="Move earlier"
                title="Move earlier"
                className="relative flex size-8 items-center justify-center rounded-full text-[var(--ink-3)] transition-[color,background-color,transform] duration-150 ease-out before:absolute before:-inset-[3px] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-30"
              >
                <ArrowLeft className="size-3.5" />
              </button>
              <button
                type="button"
                disabled={globalIdx === units.length - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveUnit(unit.id, 1);
                }}
                aria-label="Move later"
                title="Move later"
                className="relative flex size-8 items-center justify-center rounded-full text-[var(--ink-3)] transition-[color,background-color,transform] duration-150 ease-out before:absolute before:-inset-[3px] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-30"
              >
                <ArrowRight className="size-3.5" />
              </button>
              {units.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteUnitId(unit.id);
                  }}
                  aria-label="Delete scene"
                  title="Delete scene"
                  className="relative flex size-8 items-center justify-center rounded-full text-[var(--ink-3)] transition-[color,background-color,transform] duration-150 ease-out before:absolute before:-inset-[3px] hover:bg-[var(--bg-subtle-hover)] hover:text-red-600 active:scale-[0.96]"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
          </div>

          <div className="mb-1.5 font-mono text-xs font-semibold uppercase tracking-[0.04em] text-[var(--accent)]">
            {unit.slugline || 'INT. LOCATION - DAY'}
          </div>

          <button
            type="button"
            onClick={() => onSelectUnitAndWrite(unit.id)}
            className="-mx-1.5 block w-[calc(100%+0.75rem)] rounded-xl px-1.5 py-1 text-start focus-visible:outline-offset-0"
          >
            <h3 className="font-serif text-lg font-semibold leading-snug text-[var(--ink-1)] transition-colors duration-150 [text-wrap:balance] group-hover:text-[var(--accent)]">
              {unit.title.trim() || parsedSlug.location || 'Untitled Scene'}
            </h3>

            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--ink-2)]">
              {snippet}
            </p>
          </button>

          {/* Image 2 style ↳ metadata line */}
          <div className="mt-2.5 flex items-center gap-2 font-mono text-[11px] text-[var(--ink-3)] [font-variant-numeric:tabular-nums]">
            <span className="text-[var(--ink-4)]">↳</span>
            <span>{dialogueMeta.dialogueCount} cues</span>
            <span>·</span>
            <span>{durationMinutes}m</span>
          </div>

          {dialogueMeta.characters.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {dialogueMeta.characters.map((ch) => (
                <span
                  key={ch}
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                  className="rounded px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--ink-2)]"
                >
                  {ch}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3">
            <textarea
              rows={2}
              aria-label="Scene note"
              value={unit.synopsis || ''}
              onChange={(e) =>
                onUpdateUnitMeta(unit.id, { synopsis: e.target.value })
              }
              onClick={(e) => e.stopPropagation()}
              placeholder="Scene beat / note…"
              style={{
                backgroundColor: 'var(--bg-surface)',
              }}
              className="block w-full resize-none rounded-xl px-3 py-2 text-base leading-snug text-[var(--ink-2)] transition-[background-color,box-shadow] duration-150 ease-out placeholder:text-[var(--ink-4)] focus:bg-[var(--bg-elevated)] focus:shadow-[inset_0_0_0_1px_var(--border-strong)] focus:outline-none sm:text-xs"
            />
          </div>
        </div>

        {/* Tile Footer with SegmentedTickMeter (Image 2) */}
        {!isConfirmingDelete ? (
          <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2.5">
            <SegmentedTickMeter
              current={unitMetrics.words}
              target={targetWordsPerUnit}
              segments={10}
            />
            <button
              type="button"
              onClick={() => onSelectUnitAndWrite(unit.id)}
              className="-mr-2 flex h-8 items-center gap-1 rounded-full pl-3 pr-2.5 text-xs font-medium text-[var(--ink-2)] transition-[color,background-color,transform] duration-150 ease-out hover:bg-[var(--bg-subtle-hover)] active:scale-[0.96] group-hover:text-[var(--accent)]"
            >
              <span>Write</span>
              <ArrowUpRight className="size-3.5" />
            </button>
          </div>
        ) : (
          <div className="mt-3.5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2.5 text-xs">
            <button
              type="button"
              onClick={() => setConfirmDeleteUnitId(null)}
              className="rounded-md px-2 py-1 text-[var(--ink-2)] hover:bg-[var(--bg-subtle-hover)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onDeleteUnit(unit.id);
                setConfirmDeleteUnitId(null);
              }}
              className="rounded-md bg-red-600/15 px-2.5 py-1 font-medium text-red-600 hover:bg-red-600/25"
            >
              Delete {badge}
            </button>
          </div>
        )}
      </div>
    );
  };

  // ============================================================================
  // 3. CABINET STACK RENDERER FOR SCENES (Image 3 inside Bird's-Eye)
  // ============================================================================
  const renderUnitCabinet = () => {
    const inspectedItem =
      enrichedUnits.find((e) => e.unit.id === inspectedCabinetUnitId) ||
      enrichedUnits[0];
    const tabOffsets = ['7%', '36%', '61%', '18%', '46%'];

    if (!inspectedItem) return null;

    return (
      <div className="mx-auto max-w-2xl pt-2">
        {/* Dark Monospace Inspector Card Rising from Top of Cabinet (Fixed Height so zero layout shift) */}
        <div className="relative mx-auto w-[88%] sm:w-[80%]">
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
            }}
            className="pointer-events-none absolute -inset-x-5 -bottom-6 top-6 rounded-t-xl"
          />

          <div
            style={{
              backgroundColor: INSPECTOR.bg,
              color: INSPECTOR.fg,
              boxShadow: '0 16px 34px -8px rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255,255,255,0.1)',
              ['--inspector-fg' as string]: INSPECTOR.fg,
              ['--inspector-muted' as string]: INSPECTOR.muted,
              ['--inspector-signal' as string]: INSPECTOR.signal,
            }}
            className="relative z-10 flex h-[228px] flex-col justify-between rounded-xl p-5 sm:h-[224px] sm:p-6"
          >
            <div
              ref={cabinetInspectorRef}
              className="flex h-full flex-col justify-between"
            >
              <div>
                <div className="mb-2.5 flex items-center justify-between font-mono text-[11px] tracking-[0.06em] text-[var(--inspector-muted)] [font-variant-numeric:tabular-nums]">
                  <span>
                    SCENE{' '}
                    {String(inspectedItem.index + 1).padStart(3, '0')} /{' '}
                    {String(enrichedUnits.length).padStart(3, '0')}
                  </span>
                  <span className="uppercase text-[var(--inspector-signal)]">
                    {inspectedItem.badge}
                  </span>
                </div>

                <div className="mb-1.5 truncate font-mono text-xs font-bold uppercase tracking-[0.05em] text-white">
                  {inspectedItem.unit.slugline || 'INT. LOCATION - DAY'}
                </div>

                <div className="h-[68px] overflow-hidden">
                  <p className="line-clamp-3 font-mono text-xs leading-relaxed text-[var(--inspector-fg)]/90 sm:text-[13px]">
                    &ldquo;{inspectedItem.snippet}&rdquo;
                  </p>
                </div>
              </div>

              <div className="flex items-end justify-between gap-3 border-t border-white/10 pt-3.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs font-semibold uppercase tracking-[0.05em] text-white">
                    {inspectedItem.unit.title || inspectedItem.badge}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--inspector-muted)] [font-variant-numeric:tabular-nums]">
                    {inspectedItem.metrics.words.toLocaleString()} WORDS · EST.{' '}
                    {inspectedItem.durationMinutes} MIN
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectUnitAndWrite(inspectedItem.unit.id)}
                  style={{ backgroundColor: INSPECTOR.butter, color: '#111111' }}
                  className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-3.5 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] transition-transform active:scale-95"
                >
                  <span>OPEN {inspectedItem.badge.toUpperCase()}</span>
                  <ArrowUpRight className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Stepped Manila Folder Tabs for every Scene */}
        <div className="relative mt-4 flex flex-col items-center">
          {enrichedUnits.map((item, idx) => {
            const isInspected = item.unit.id === inspectedItem.unit.id;
            const widthPercent = Math.min(98, 90 + idx * 1.2);
            const tabLeft = tabOffsets[idx % tabOffsets.length];
            const tone = toneVar(item.sectionTone);
            const folderBg = isInspected
              ? tone
              : `color-mix(in srgb, ${tone} 42%, var(--bg-surface))`;
            const borderColor = isInspected
              ? 'var(--ink-1)'
              : 'var(--border-strong)';

            return (
              <div
                key={item.unit.id}
                style={{
                  width: `${widthPercent}%`,
                  zIndex: 10 + idx,
                }}
                className="pointer-events-none relative -mt-1.5 select-none"
              >
                {/* 1. STATIONARY HIT-TEST LAYER: Never moves or resizes, preventing hover oscillation */}
                <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
                  <div className="pointer-events-none flex">
                    <button
                      type="button"
                      aria-label={`Inspect ${item.unit.title || item.badge}`}
                      onMouseEnter={() => setInspectedCabinetUnitId(item.unit.id)}
                      onFocus={() => setInspectedCabinetUnitId(item.unit.id)}
                      onClick={() => setInspectedCabinetUnitId(item.unit.id)}
                      onDoubleClick={() => onSelectUnitAndWrite(item.unit.id)}
                      style={{ marginLeft: tabLeft }}
                      className="pointer-events-auto h-6 w-48 max-w-[230px] cursor-pointer rounded-t-lg bg-transparent focus:outline-none"
                    />
                  </div>
                  <div
                    onMouseEnter={() => setInspectedCabinetUnitId(item.unit.id)}
                    onClick={() => setInspectedCabinetUnitId(item.unit.id)}
                    onDoubleClick={() => onSelectUnitAndWrite(item.unit.id)}
                    className="pointer-events-auto flex h-9 w-full cursor-pointer items-center justify-end px-4"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectUnitAndWrite(item.unit.id);
                      }}
                      style={{
                        opacity: isInspected ? 1 : 0,
                        pointerEvents: isInspected ? 'auto' : 'none',
                      }}
                      className="rounded-full bg-[var(--ink-1)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--bg-canvas)] transition-opacity duration-150 hover:underline"
                    >
                      WRITE →
                    </button>
                  </div>
                </div>

                {/* 2. PURE VISUAL LAYER (pointer-events-none): Lifts smoothly without shifting hitboxes */}
                <div
                  style={{
                    transform: isInspected
                      ? 'translateY(-4px)'
                      : 'translateY(0px)',
                  }}
                  className="pointer-events-none relative z-10 transition-transform duration-150 ease-out"
                >
                  <div className="flex">
                    <div
                      style={{
                        marginLeft: tabLeft,
                        marginBottom: '-1px',
                        backgroundColor: folderBg,
                        borderTop: `1px solid ${borderColor}`,
                        borderLeft: `1px solid ${borderColor}`,
                        borderRight: `1px solid ${borderColor}`,
                        borderBottom: `1px solid ${folderBg}`,
                      }}
                      className="relative z-10 inline-flex h-6 w-48 max-w-[230px] items-center gap-1.5 rounded-t-lg px-3.5"
                    >
                      <span className="font-mono text-[10px] font-bold text-[var(--on-pastel)] opacity-60">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span
                        style={{ color: 'var(--on-pastel)' }}
                        className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.05em]"
                      >
                        {item.unit.title.trim() || item.parsedSlug.location}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: folderBg,
                      borderTop: `1px solid ${borderColor}`,
                      borderLeft: `1px solid ${borderColor}`,
                      borderRight: `1px solid ${borderColor}`,
                    }}
                    className="flex h-9 w-full items-center justify-between rounded-t-[4px] px-4"
                  >
                    <span
                      style={{ opacity: isInspected ? 1 : 0.7 }}
                      className="font-mono text-[10px] text-[var(--on-pastel)]"
                    >
                      {item.badge.toUpperCase()} · {item.metrics.words}W
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Cabinet Drawer Front Plate */}
          <div
            style={{
              zIndex: 30 + enrichedUnits.length,
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              boxShadow: 'var(--elevation-raised)',
            }}
            className="relative -mt-1 flex h-20 w-full flex-col items-center justify-center rounded-b-xl rounded-t-[3px]"
          >
            <div className="mb-1.5 h-1.5 w-12 rounded-full bg-[var(--border-strong)]" />
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-2)] [font-variant-numeric:tabular-nums]">
              {doc.title.trim() || 'SCREENPLAY'} /{' '}
              {String(enrichedUnits.length).padStart(2, '0')} SCENES
            </div>
          </div>
        </div>
      </div>
    );
  };

  const totalDurationMinutes = enrichedUnits.reduce(
    (acc, item) => acc + item.durationMinutes,
    0
  );

  return (
    <>
    {/* Pastel hero wash (sits behind the translucent top bar) */}
    <div
      aria-hidden="true"
      style={{ background: toneWash(WORK_KIND_TONE[doc.kind]) }}
      className="no-print pointer-events-none absolute inset-x-0 top-0 h-[440px]"
    />
    <div
      ref={containerRef}
      className="relative mx-auto max-w-5xl px-4 pb-28 pt-20 sm:px-10 sm:pt-24"
    >
      {/* Top Overview Header */}
      <div className="mb-6 flex flex-col justify-between gap-6 border-b border-[var(--border-strong)] pb-6 md:flex-row md:items-end">
        <div className="flex-1">
          <div
            style={toneChip(WORK_KIND_TONE[doc.kind])}
            className="mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.07em]"
          >
            <Film className="size-3.5" />
            <span>Screenplay Scene Stripboard &amp; Timeline</span>
          </div>

          <input
            type="text"
            value={doc.title}
            onChange={(e) => onUpdateDocTitle(e.target.value)}
            placeholder="UNTITLED SCREENPLAY"
            className="w-full bg-transparent font-serif text-3xl font-semibold tracking-tight text-[var(--ink-1)] placeholder:text-[var(--ink-4)] focus:outline-none sm:text-4xl"
          />

          <input
            type="text"
            value={doc.subtitle || ''}
            onChange={(e) => onUpdateDocSubtitle(e.target.value)}
            placeholder="Written by…"
            className="mt-1 w-full bg-transparent text-base text-[var(--ink-3)] placeholder:text-[var(--ink-4)] focus:outline-none sm:text-sm"
          />
        </div>

        {/* Summary Metrics & Primary Add Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            style={{
              backgroundColor:
                'color-mix(in srgb, var(--bg-elevated) 70%, transparent)',
            }}
            className="mr-1 flex items-center gap-3 rounded-full px-3.5 py-2 text-xs text-[var(--ink-2)] [font-variant-numeric:tabular-nums]"
          >
            <span>
              <strong className="font-semibold text-[var(--ink-1)]">
                {units.length}
              </strong>{' '}
              {units.length === 1 ? 'scene' : 'scenes'}
            </span>
            <span className="text-[var(--ink-4)]">·</span>
            <span>
              <strong className="font-semibold text-[var(--ink-1)]">
                {totalMetrics.words.toLocaleString()}
              </strong>{' '}
              words
            </span>
          </div>

          {onOpenTitlePage && (
            <button
              type="button"
              onClick={onOpenTitlePage}
              {...btnHover}
              style={{
                backgroundColor: 'var(--bg-elevated)',
                boxShadow: 'var(--elevation-raised)',
              }}
              title="Edit the title page: title, credit, author, contact"
              className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-[var(--ink-1)]"
            >
              <FileText className="size-3.5 text-[var(--ink-2)]" />
              <span>Title page</span>
              {doc.titlePage?.author?.trim() && (
                <Check
                  aria-label="filled in"
                  className="size-3 text-[var(--good)]"
                  strokeWidth={2.5}
                />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onAddUnit}
            {...btnHover}
            style={{
              backgroundColor: 'var(--ink-1)',
              color: 'var(--bg-canvas)',
            }}
            className="flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-medium"
          >
            <Plus className="size-3.5" strokeWidth={2} />
            New Scene
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* IMAGE 2-INSPIRED VIEW SWITCHER BAR + PACING STRIP                    */}
      {/* ==================================================================== */}
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        {/* Segmented View Switcher: Timeline | Cards | Cabinet */}
        <div
          style={{ backgroundColor: 'var(--bg-surface)' }}
          className="inline-flex items-center gap-1 self-start rounded-xl p-1"
        >
          {(
            [
              {
                id: 'timeline',
                label: 'Timeline',
                icon: GitCommitHorizontal,
              },
              {
                id: 'cards',
                label: 'Cards',
                icon: LayoutGrid,
              },
              {
                id: 'cabinet',
                label: 'Cabinet',
                icon: Archive,
              },
            ] as {
              id: BirdsEyeLayoutMode;
              label: string;
              icon: React.FC<{ className?: string }>;
            }[]
          ).map((tab) => {
            const active = layoutMode === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLayoutMode(tab.id)}
                style={{
                  backgroundColor: active
                    ? 'var(--bg-elevated)'
                    : 'transparent',
                  boxShadow: active ? 'var(--elevation-raised)' : 'none',
                  color: active ? 'var(--ink-1)' : 'var(--ink-3)',
                }}
                className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all duration-150"
              >
                <Icon
                  className={`size-3.5 ${
                    active ? 'text-[var(--accent)]' : ''
                  }`}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* All-Projects Cabinet Link */}
        {onOpenProjectCabinet && (
          <button
            type="button"
            onClick={onOpenProjectCabinet}
            className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--accent)] sm:self-auto"
          >
            <Archive className="size-3.5" />
            <span>Browse All Scripts in Project Filing Cabinet →</span>
          </button>
        )}
      </div>

      {/* ==================================================================== */}
      {/* BODY: TIMELINE vs CARDS vs CABINET                                   */}
      {/* ==================================================================== */}
      {layoutMode === 'timeline' ? (
        <NarrativeTimeline
          items={enrichedUnits.map((item) => ({
            id: item.unit.id,
            title: item.unit.title.trim() || item.unit.slugline || 'Untitled scene',
            badge: item.badge,
            words: item.metrics.words,
            durationMinutes: item.durationMinutes,
            beats: item.beats,
          }))}
          activeId={activeUnitId}
          totalMinutes={totalDurationMinutes}
          onOpen={onSelectUnitAndWrite}
          onAppend={onAddUnit}
        />
      ) : layoutMode === 'cabinet' ? (
        renderUnitCabinet()
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {units.map(renderCardTile)}
        </div>
      )}
    </div>
    </>
  );
};
