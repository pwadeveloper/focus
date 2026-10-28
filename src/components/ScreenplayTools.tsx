import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import {
  Clapperboard,
  AlignLeft,
  User,
  MessageSquare,
  CornerDownRight,
  ArrowRightLeft,
  MoreHorizontal,
} from 'lucide-react';
import { gsapButtonHover, prefersReducedMotion } from '../motion';
import {
  ScreenplayBlockType,
  SCREENPLAY_BLOCKS,
  blockSpec,
  guideShortcut,
  modKeys,
  vocabValues,
} from '../screenplay';

export type { ScreenplayBlockType };

export interface AutocompleteSuggestion {
  id: string;
  label: string;
  insertText: string;
  category: string;
  targetBlockType?: ScreenplayBlockType;
}

const SLUGLINE_PREFIXES = vocabValues('headings', 'heading-prefix').map((v) => ({
  label: `${v.value} `,
  desc: v.meaning,
}));
const TIMES_OF_DAY = vocabValues('headings', 'heading-time').map((v) => ({
  label: v.value,
  desc: v.meaning,
}));
const CHARACTER_EXTENSIONS = vocabValues('characters').map((v) => ({
  label: v.value,
  desc: v.meaning,
}));
const TRANSITIONS = [
  ...vocabValues('transitions').map((v) => ({ label: v.value, desc: v.meaning })),
];
const SHOTS = vocabValues('camera').map((v) => ({ label: v.value, desc: v.meaning }));
const PARENTHETICALS = vocabValues('parentheticals').map((v) => ({
  label: v.value,
  desc: v.meaning,
}));

export function computeScreenplaySuggestions(params: {
  blockType: ScreenplayBlockType;
  lineText: string;
  knownCharacters: string[];
  knownLocations: string[];
}): AutocompleteSuggestion[] {
  const { blockType, lineText, knownCharacters, knownLocations } = params;
  const trimmed = lineText.trimStart();
  const upper = trimmed.toUpperCase();

  // 1. If in a slugline OR typing INT / EXT at the start of any line
  if (
    blockType === 'slugline' ||
    /^(I|IN|INT|E|EX|EXT|ES|EST|I\/E)\b/i.test(trimmed)
  ) {
    // Check if user already has INT. / EXT. and is typing time of day after " - "
    const dashIndex = upper.lastIndexOf(' -');
    if (dashIndex !== -1 && /^(INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.|I\/E\.|EST\.)/.test(upper)) {
      const beforeDash = upper.slice(0, dashIndex).trim();
      const afterDash = upper.slice(dashIndex + 2).trim();
      return TIMES_OF_DAY.filter(
        (t) => !afterDash || t.label.startsWith(afterDash) && t.label !== afterDash
      ).map((t) => ({
        id: `tod-${t.label}`,
        label: `${beforeDash} - ${t.label}`,
        insertText: `${beforeDash} - ${t.label}`,
        category: t.desc,
        targetBlockType: 'slugline',
      }));
    }

    // Check if user has typed "INT. " or "EXT. " and is typing a location
    const prefixMatch = upper.match(/^(INT\.\/EXT\.|EXT\.\/INT\.|INT\.|EXT\.|I\/E\.|EST\.)\s*(.*)$/);
    if (prefixMatch) {
      const prefix = prefixMatch[1];
      const locQuery = prefixMatch[2].trim();

      // Extract bare locations from known full sluglines
      const bareLocations = Array.from(
        new Set(
          knownLocations
            .map((s) =>
              s
                .replace(/^(INT\.\/EXT\.|EXT\.\/INT\.|INT\.|EXT\.|I\/E\.|EST\.)\s*/i, '')
                .replace(
                  new RegExp(`\\s*-\\s*(${TIMES_OF_DAY.map((t) => t.label).join('|')})$`, 'i'),
                  ''
                )
                .trim()
            )
            .filter(Boolean)
        )
      );

      const locSuggestions: AutocompleteSuggestion[] = [];

      bareLocations
        .filter((loc) => !locQuery || loc.includes(locQuery))
        .slice(0, 4)
        .forEach((loc) => {
          locSuggestions.push({
            id: `loc-${loc}-day`,
            label: `${prefix} ${loc} - DAY`,
            insertText: `${prefix} ${loc} - DAY`,
            category: 'Scene Heading',
            targetBlockType: 'slugline',
          });
          locSuggestions.push({
            id: `loc-${loc}-night`,
            label: `${prefix} ${loc} - NIGHT`,
            insertText: `${prefix} ${loc} - NIGHT`,
            category: 'Scene Heading',
            targetBlockType: 'slugline',
          });
        });

      // If user typed a new location name, offer quick " - DAY" and " - NIGHT" completions
      if (locQuery.length >= 2 && !locQuery.includes('-')) {
        locSuggestions.unshift(
          {
            id: `custom-tod-day`,
            label: `${prefix} ${locQuery} - DAY`,
            insertText: `${prefix} ${locQuery} - DAY`,
            category: 'Complete with DAY',
            targetBlockType: 'slugline',
          },
          {
            id: `custom-tod-night`,
            label: `${prefix} ${locQuery} - NIGHT`,
            insertText: `${prefix} ${locQuery} - NIGHT`,
            category: 'Complete with NIGHT',
            targetBlockType: 'slugline',
          },
          {
            id: `custom-tod-cont`,
            label: `${prefix} ${locQuery} - CONTINUOUS`,
            insertText: `${prefix} ${locQuery} - CONTINUOUS`,
            category: 'Complete with CONTINUOUS',
            targetBlockType: 'slugline',
          }
        );
      }

      return locSuggestions.slice(0, 6);
    }

    // Suggest INT. / EXT. prefixes
    if (upper.length > 0 && upper.length <= 9) {
      const matches = SLUGLINE_PREFIXES.filter((p) =>
        p.label.startsWith(upper)
      );
      if (matches.length > 0) {
        return matches.map((m) => ({
          id: `prefix-${m.label}`,
          label: m.label,
          insertText: m.label,
          category: m.desc,
          targetBlockType: 'slugline',
        }));
      }
    }
  }

  // 2. Character cue autocomplete (or @mention in action)
  if (blockType === 'character' || trimmed.startsWith('@')) {
    const cleanQuery = (trimmed.startsWith('@') ? trimmed.slice(1) : trimmed).toUpperCase();

    // Check if user is typing an extension like "ELENA ("
    const parenIdx = cleanQuery.indexOf('(');
    if (parenIdx !== -1) {
      const charName = cleanQuery.slice(0, parenIdx).trim();
      const extQuery = cleanQuery.slice(parenIdx);
      return CHARACTER_EXTENSIONS.filter((ext) =>
        ext.label.startsWith(extQuery)
      )
        .slice(0, 6)
        .map((ext) => ({
        id: `ext-${ext.label}`,
        label: `${charName} ${ext.label}`,
        insertText: `${charName} ${ext.label}`,
        category: ext.desc,
        targetBlockType: 'character',
      }));
    }

    // Suggest only once the writer starts typing, so Tab/Enter on an empty
    // cue keep their element-flow meaning
    if (!cleanQuery) return [];
    const matchingChars = knownCharacters
      .filter((c) => c.startsWith(cleanQuery) && c !== cleanQuery)
      .slice(0, 5);

    const results: AutocompleteSuggestion[] = matchingChars.map((c) => ({
      id: `char-${c}`,
      label: c,
      insertText: c,
      category: 'Character',
      targetBlockType: 'character',
    }));

    // Extensions are offered once the writer types "(" after the name
    return results.slice(0, 6);
  }

  // 3. Parenthetical delivery notes
  if (blockType === 'parenthetical') {
    const q = trimmed.replace(/^\(/, '').replace(/\)$/, '').toLowerCase();
    if (!q) return [];
    return PARENTHETICALS.filter(
      (p) => p.label.slice(1).startsWith(q) && p.label.toLowerCase() !== trimmed.toLowerCase()
    )
      .slice(0, 6)
      .map((p) => ({
        id: `paren-${p.label}`,
        label: p.label,
        insertText: p.label,
        category: p.desc,
        targetBlockType: 'parenthetical',
      }));
  }

  // 4. Shot headings
  if (blockType === 'shot') {
    if (!upper) return [];
    return SHOTS.filter((t) => t.label.startsWith(upper) && t.label !== upper)
      .slice(0, 6)
      .map((t) => ({
        id: `shot-${t.label}`,
        label: t.label,
        insertText: t.label,
        category: t.desc,
        targetBlockType: 'shot',
      }));
  }

  // 5. Transition autocomplete (in a transition, or typing CUT / DISSOLVE / FADE / SMASH …)
  if (
    blockType === 'transition' ||
    /^(CUT|DISS|FADE|SMASH|MATCH|JUMP|FLASH|WIPE|IRIS|TIME CUT|INTERCUT)\b/i.test(trimmed)
  ) {
    if (!upper) return [];
    return TRANSITIONS.filter((t) => t.label.startsWith(upper) && t.label !== upper)
      .slice(0, 6)
      .map((t) => ({
        id: `trans-${t.label}`,
        label: t.label,
        insertText: t.label,
        category: t.desc,
        // FADE IN: opens the script as an action line, not a transition
        targetBlockType: t.label === 'FADE IN:' ? 'action' : 'transition',
      }));
  }

  return [];
}

interface ScreenplayAutocompletePopoverProps {
  suggestions: AutocompleteSuggestion[];
  selectedIndex: number;
  position: { top: number; left: number } | null;
  onSelect: (suggestion: AutocompleteSuggestion) => void;
}

export const ScreenplayAutocompletePopover: React.FC<
  ScreenplayAutocompletePopoverProps
> = ({ suggestions, selectedIndex, position, onSelect }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = menuRef.current;
    if (!el || suggestions.length === 0 || !position || prefersReducedMotion()) return;
    gsap.fromTo(
      el,
      { opacity: 0, y: -4, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.15, ease: 'power3.out', overwrite: 'auto' }
    );
  }, [suggestions.length, Boolean(position)]);

  if (!position || suggestions.length === 0) return null;

  return (
    <div
      ref={menuRef}
      role="listbox"
      aria-label="Screenplay autocomplete suggestions"
      style={{
        top: `${position.top + 26}px`,
        left: `${Math.min(window.innerWidth - 268, Math.max(12, position.left))}px`,
        backgroundColor: 'var(--bg-elevated)',
        boxShadow: 'var(--elevation-floating)',
        // Above the guide panel, which shares the toolbar layer
        zIndex: 'calc(var(--z-toolbar) + 10)',
      }}
      onMouseDown={(e) => e.preventDefault()}
      className="no-print fixed w-[min(16rem,calc(100vw-24px))] overflow-hidden rounded-xl p-1 text-xs"
    >
      <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
        <span>Suggestions</span>
        <span>Tab to accept · ↑↓</span>
      </div>
      {suggestions.map((s, idx) => {
        const active = idx === selectedIndex;
        return (
          <button
            key={s.id}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => onSelect(s)}
            style={{
              backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--ink-1)',
            }}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-start font-mono text-xs transition-colors hover:bg-[var(--bg-subtle-hover)]"
          >
            <span className="truncate font-semibold">{s.label}</span>
            <span className="shrink-0 font-sans text-[10px] text-[var(--ink-3)]">
              {s.category}
            </span>
          </button>
        );
      })}
    </div>
  );
};

interface ScreenplayElementBarProps {
  activeBlockType: ScreenplayBlockType;
  onSelectBlockType: (type: ScreenplayBlockType) => void;
  onOpenGuide?: () => void;
  guideOpen?: boolean;
}

const CORE_ELEMENTS: {
  id: ScreenplayBlockType;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
}[] = [
  { id: 'slugline', icon: Clapperboard },
  { id: 'action', icon: AlignLeft },
  { id: 'character', icon: User },
  { id: 'dialogue', icon: MessageSquare },
  { id: 'parenthetical', icon: CornerDownRight },
  { id: 'transition', icon: ArrowRightLeft },
];

export const ScreenplayElementBar: React.FC<ScreenplayElementBarProps> = ({
  activeBlockType,
  onSelectBlockType,
  onOpenGuide,
  guideOpen = false,
}) => {
  const btnHover = gsapButtonHover({ hoverScale: 1.04, hoverY: -0.5, pressScale: 0.96 });
  const { mod, alt } = modKeys();
  const isCore = CORE_ELEMENTS.some((c) => c.id === activeBlockType);
  const activeSpec = blockSpec(activeBlockType);

  return (
    <div
      style={{
        zIndex: 'var(--z-header)',
        backgroundColor: 'var(--bg-elevated)',
        boxShadow: 'var(--elevation-floating)',
        marginBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      onMouseDown={(e) => {
        // Keep focus inside editor when switching screenplay block format
        e.preventDefault();
      }}
      className="focus-scroller no-print fixed bottom-14 left-1/2 flex max-w-[calc(100vw-20px)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-full p-1 text-xs sm:bottom-5"
    >
      {CORE_ELEMENTS.map((item) => {
        const spec = SCREENPLAY_BLOCKS.find((b) => b.id === item.id)!;
        const Icon = item.icon;
        const active = activeBlockType === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectBlockType(item.id)}
            {...btnHover}
            aria-pressed={active}
            title={`${spec.label} (${mod}${alt}${spec.digit})`}
            style={{
              backgroundColor: active ? 'var(--ink-1)' : 'transparent',
              color: active ? 'var(--bg-canvas)' : 'var(--ink-2)',
            }}
            className="flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-[color,background-color] duration-150 hover:bg-[var(--bg-subtle-hover)] sm:h-7 sm:gap-1.5"
          >
            <Icon className="size-3" strokeWidth={1.9} />
            <span>{spec.short}</span>
          </button>
        );
      })}

      {!isCore && (
        <span
          aria-live="polite"
          style={{ backgroundColor: 'var(--ink-1)', color: 'var(--bg-canvas)' }}
          className="flex h-8 shrink-0 items-center rounded-full px-2.5 text-[11px] font-medium sm:h-7"
        >
          {activeSpec.label}
        </span>
      )}

      {/* What Enter and Tab will start next (Final Draft's status-bar hint) */}
      <span
        aria-hidden="true"
        className="hidden shrink-0 items-center gap-2 whitespace-nowrap px-2 text-[11px] text-[var(--ink-3)] lg:flex"
      >
        <span>
          ↵ <span className="text-[var(--ink-2)]">{blockSpec(activeSpec.enter).short}</span>
        </span>
        {activeSpec.tab && (
          <span>
            Tab <span className="text-[var(--ink-2)]">{blockSpec(activeSpec.tab).short}</span>
          </span>
        )}
      </span>

      {onOpenGuide && (
        <>
          <span
            aria-hidden="true"
            className="mx-0.5 h-4 w-px shrink-0 bg-[var(--border-strong)]"
          />
          <button
            type="button"
            onClick={onOpenGuide}
            {...btnHover}
            aria-expanded={guideOpen}
            title={`All elements & shortcuts (${guideShortcut()} or F1)`}
            className="flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium text-[var(--ink-2)] transition-[color,background-color] duration-150 hover:bg-[var(--bg-subtle-hover)] sm:h-7"
          >
            <MoreHorizontal className="size-3.5" strokeWidth={1.9} />
            <span>More</span>
          </button>
        </>
      )}
    </div>
  );
};
