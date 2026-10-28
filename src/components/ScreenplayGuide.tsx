import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Search,
  X,
  Columns2,
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  SCREENPLAY_BLOCKS,
  SCREENPLAY_VOCAB,
  SCREENPLAY_KEY_GROUPS,
  ScreenplayBlockSpec,
  ScreenplayBlockType,
  ScreenplayVocabItem,
  dualShortcut,
  guideShortcut,
  modKeys,
} from '../screenplay';
import { prefersReducedMotion } from '../motion';

type GuideTab = 'elements' | 'keys' | string;

interface GuideEntry {
  key: string;
  section: string;
  title: string;
  detail: string;
  shortcut?: string;
  mono: boolean;
  run: () => void;
  active?: boolean;
}

interface ScreenplayGuideProps {
  open: boolean;
  activeBlock: ScreenplayBlockType;
  onClose: () => void;
  onApplyBlock: (block: ScreenplayBlockType) => void;
  onInsertVocab: (item: ScreenplayVocabItem) => void;
  onToggleDual: () => void;
  onOpenTitlePage?: () => void;
}

const TIER_LABEL: Record<ScreenplayBlockSpec['tier'], string> = {
  core: 'Core',
  common: 'Common',
  advanced: 'Advanced',
};

/**
 * Custom duotone geometric icons modeled after the v.1 capsule tab bar:
 * - Adapts automatically to Paper (light), Sepia, and Night (dark) themes via CSS variables.
 * - When `selected`: renders inside a circular well with a soft emerald/sage glow (`var(--good)`).
 * - When `hovered`: renders with high-contrast two-tone facets (`var(--ink-1)` + `var(--ink-3)`).
 * - When `idle`: renders with muted two-tone facets (`var(--ink-3)` + `var(--ink-4)`).
 */
const GuideTabIcon: React.FC<{
  tabId: string;
  selected: boolean;
  hovered: boolean;
}> = ({ tabId, selected, hovered }) => {
  const primary = selected
    ? 'var(--good)'
    : hovered
    ? 'var(--ink-1)'
    : 'var(--ink-3)';
  const secondary = selected
    ? 'color-mix(in srgb, var(--good) 38%, transparent)'
    : hovered
    ? 'var(--ink-3)'
    : 'var(--ink-4)';

  const renderGlyph = () => {
    switch (tabId) {
      case 'elements':
        // Compass needle diamond (matches "Discover" in v.1)
        return (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
            <path
              d="M11.8 4.2L9.6 9.6L4.2 11.8L6.4 6.4L11.8 4.2Z"
              fill={primary}
            />
            <path
              d="M4.2 11.8L6.4 6.4L9.6 9.6L4.2 11.8Z"
              fill={secondary}
            />
          </svg>
        );

      case 'headings':
        // Isometric 3D cube (matches "3D Models" in v.1)
        return (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
            <path
              d="M8 2L13.2 5V11L8 14L2.8 11V5L8 2Z"
              fill={secondary}
            />
            <path
              d="M8 2L13.2 5L8 8L2.8 5L8 2Z"
              fill={primary}
              fillOpacity={selected ? 0.95 : 0.85}
            />
            <path d="M2.8 5L8 8V14L2.8 11V5Z" fill={primary} />
          </svg>
        );

      case 'characters':
        // Hexagonal avatar badge (matches "Avatars" in v.1)
        return (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
            <path
              d="M8 1.8L13.4 4.9V11.1L8 14.2L2.6 11.1V4.9L8 1.8Z"
              fill={secondary}
            />
            <circle cx="8" cy="6.3" r="1.8" fill={primary} />
            <path
              d="M4.8 11.6C5.3 9.9 6.5 9.1 8 9.1C9.5 9.1 10.7 9.9 11.2 11.6L8 13.4L4.8 11.6Z"
              fill={primary}
            />
          </svg>
        );

      case 'parentheticals':
        // Overlapping motion squares (matches "Animations" in v.1)
        return (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
            <rect
              x="2.2"
              y="4.8"
              width="7.2"
              height="7.2"
              rx="2"
              fill={secondary}
            />
            <rect
              x="5.8"
              y="2.6"
              width="7.6"
              height="7.6"
              rx="2.2"
              fill={primary}
            />
          </svg>
        );

      case 'transitions':
        // Split dissolve prism
        return (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
            <path d="M2.5 3.5H8.5L6.5 12.5H2.5V3.5Z" fill={secondary} />
            <path d="M9.5 3.5H13.5V12.5H7.5L9.5 3.5Z" fill={primary} />
          </svg>
        );

      case 'camera':
        // Camera lens / viewfinder
        return (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
            <rect
              x="2.2"
              y="3.5"
              width="11.6"
              height="9"
              rx="2.4"
              fill={secondary}
            />
            <circle cx="8" cy="8" r="2.6" fill={primary} />
          </svg>
        );

      case 'sequences':
        // Connected hierarchy nodes (matches right-most node icon in v.1)
        return (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
            <circle cx="8" cy="3.5" r="1.8" fill={primary} />
            <path
              d="M8 5.3V8.2M8 8.2L4.5 10.2M8 8.2L11.5 10.2"
              stroke={secondary}
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <circle cx="4.5" cy="11.8" r="1.6" fill={primary} />
            <circle cx="11.5" cy="11.8" r="1.6" fill={secondary} />
          </svg>
        );

      case 'tv':
        // Stacked act cards
        return (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
            <rect
              x="3"
              y="2.5"
              width="10"
              height="3.2"
              rx="1.2"
              fill={secondary}
            />
            <rect
              x="2.2"
              y="6.8"
              width="11.6"
              height="6.4"
              rx="1.8"
              fill={primary}
            />
          </svg>
        );

      default:
        // Shortcuts / Command keycap
        return (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
            <rect
              x="2.2"
              y="2.2"
              width="11.6"
              height="11.6"
              rx="3"
              fill={secondary}
            />
            <path
              d="M6.2 6.2V9.8H9.8V6.2H6.2ZM5.2 3.8C4.4 3.8 3.8 4.4 3.8 5.2C3.8 6 4.4 6.6 5.2 6.6H6.2V5.2C6.2 4.4 5.6 3.8 5.2 3.8ZM10.8 3.8C10 3.8 9.8 4.4 9.8 5.2V6.6H10.8C11.6 6.6 12.2 6 12.2 5.2C12.2 4.4 11.6 3.8 10.8 3.8Z"
              fill={primary}
            />
          </svg>
        );
    }
  };

  return (
    <span
      aria-hidden="true"
      style={{
        backgroundColor: selected
          ? 'color-mix(in srgb, var(--good) 16%, var(--bg-elevated))'
          : 'transparent',
        boxShadow: selected
          ? 'inset 0 0 0 1px color-mix(in srgb, var(--good) 34%, transparent), 0 0 10px -1px color-mix(in srgb, var(--good) 32%, transparent)'
          : 'none',
      }}
      className="relative flex size-5 shrink-0 items-center justify-center rounded-full transition-[background-color,box-shadow,transform] duration-200 ease-out"
    >
      {renderGlyph()}
    </span>
  );
};

/**
 * Screenplay elements guide: a non-modal panel under the top bar that lists
 * every element, standard value, and shortcut. Clicking a row (or pressing
 * Enter on it) inserts it at the writer's last caret position.
 */
export const ScreenplayGuide: React.FC<ScreenplayGuideProps> = ({
  open,
  activeBlock,
  onClose,
  onApplyBlock,
  onInsertVocab,
  onToggleDual,
  onOpenTitlePage,
}) => {
  const [shouldRender, setShouldRender] = useState(open);
  const [isVisible, setIsVisible] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [tab, setTab] = useState<GuideTab>('elements');
  const [hoveredTab, setHoveredTab] = useState<GuideTab | null>(null);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  // Sliding pill metrics (GPU-accelerated translate3d + width)
  const [activePill, setActivePill] = useState<{ x: number; w: number }>({
    x: 0,
    w: 0,
  });
  const [hoverPill, setHoverPill] = useState<{
    x: number;
    w: number;
    visible: boolean;
  }>({
    x: 0,
    w: 0,
    visible: false,
  });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const { mod, alt } = modKeys();

  const tabs = useMemo(
    () => [
      { id: 'elements', label: 'Elements' },
      ...SCREENPLAY_VOCAB.map((g) => ({ id: g.id, label: g.tab })),
      { id: 'keys', label: 'Shortcuts' },
    ],
    []
  );

  const allEntries = useMemo<GuideEntry[]>(() => {
    const titlePage: GuideEntry[] = onOpenTitlePage
      ? [
          {
            key: 'title-page',
            section: `Elements · ${TIER_LABEL.core}`,
            title: 'Title page',
            detail:
              'The first page: title, “Written by”, author, source, draft date and contact.',
            mono: false,
            run: onOpenTitlePage,
          },
        ]
      : [];
    const blocks: GuideEntry[] = SCREENPLAY_BLOCKS.map((b) => ({
      key: `block-${b.id}`,
      section: `Elements · ${TIER_LABEL[b.tier]}`,
      title: b.label,
      detail: b.description,
      shortcut: b.digit !== undefined ? `${mod}${alt}${b.digit}` : b.fountain,
      mono: false,
      run: () => onApplyBlock(b.id),
      active: activeBlock === b.id,
    }));
    blocks.push({
      key: 'dual-dialogue',
      section: `Elements · ${TIER_LABEL.common}`,
      title: 'Dual dialogue',
      detail:
        'Two characters speaking at once, set side by side. Put your cursor in the second speaker’s cue or lines.',
      shortcut: dualShortcut(),
      mono: false,
      run: onToggleDual,
    });
    const vocab: GuideEntry[] = SCREENPLAY_VOCAB.flatMap((g) =>
      g.items.map((item) => ({
        key: `${g.id}-${item.value}`,
        section: g.title,
        title: item.value,
        detail: item.meaning,
        mono: true,
        run: () => onInsertVocab(item),
      }))
    );
    return [...titlePage, ...blocks, ...vocab];
  }, [
    activeBlock,
    onApplyBlock,
    onInsertVocab,
    onToggleDual,
    onOpenTitlePage,
    mod,
    alt,
  ]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleEntries = useMemo(() => {
    if (normalizedQuery) {
      return allEntries.filter((e) =>
        `${e.title} ${e.detail} ${e.section}`
          .toLowerCase()
          .includes(normalizedQuery)
      );
    }
    if (tab === 'elements') {
      return allEntries.filter((e) => e.section.startsWith('Elements'));
    }
    if (tab === 'keys') return [];
    const group = SCREENPLAY_VOCAB.find((g) => g.id === tab);
    return group ? allEntries.filter((e) => e.section === group.title) : [];
  }, [allEntries, normalizedQuery, tab]);

  const activeGroup = SCREENPLAY_VOCAB.find((g) => g.id === tab);
  const showKeys = !normalizedQuery && tab === 'keys';

  useEffect(() => {
    setHighlight(0);
  }, [tab, normalizedQuery]);

  // Measure active & hovered tab capsules and scroll overflow state
  const updateTabMetrics = useCallback(() => {
    const container = tabListRef.current;
    if (!container) return;

    const activeBtn = tabButtonRefs.current[tab];
    if (activeBtn) {
      setActivePill({
        x: activeBtn.offsetLeft,
        w: activeBtn.offsetWidth,
      });
    }

    if (hoveredTab && hoveredTab !== tab) {
      const hoverBtn = tabButtonRefs.current[hoveredTab];
      if (hoverBtn) {
        setHoverPill({
          x: hoverBtn.offsetLeft,
          w: hoverBtn.offsetWidth,
          visible: true,
        });
      }
    } else {
      setHoverPill((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    }

    const maxScroll = container.scrollWidth - container.clientWidth;
    setCanScrollLeft(container.scrollLeft > 4);
    setCanScrollRight(maxScroll - container.scrollLeft > 4);
  }, [tab, hoveredTab]);

  useLayoutEffect(() => {
    if (!shouldRender || normalizedQuery) return;
    updateTabMetrics();
  }, [shouldRender, normalizedQuery, tab, hoveredTab, updateTabMetrics]);

  useEffect(() => {
    if (!shouldRender) return;
    const onResize = () => updateTabMetrics();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [shouldRender, updateTabMetrics]);

  // Smoothly center the newly selected tab inside the v.1 capsule track
  useEffect(() => {
    if (!open || normalizedQuery) return;
    const container = tabListRef.current;
    const btn = tabButtonRefs.current[tab];
    if (!container || !btn) return;

    const targetLeft =
      btn.offsetLeft - container.clientWidth / 2 + btn.offsetWidth / 2;
    container.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [tab, open, normalizedQuery]);

  // Mount & origin-aware enter (200ms) / exit (145ms) lifecycle
  useEffect(() => {
    const reduced = prefersReducedMotion();
    if (open) {
      setQuery('');
      setShouldRender(true);
      if (reduced) {
        setIsVisible(true);
      } else {
        let raf2 = 0;
        const raf1 = window.requestAnimationFrame(() => {
          raf2 = window.requestAnimationFrame(() => {
            setIsVisible(true);
          });
        });
        return () => {
          window.cancelAnimationFrame(raf1);
          window.cancelAnimationFrame(raf2);
        };
      }
    } else {
      setIsVisible(false);
      if (reduced) {
        setShouldRender(false);
      } else {
        const timer = window.setTimeout(() => {
          setShouldRender(false);
        }, 155);
        return () => window.clearTimeout(timer);
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open || !shouldRender) return;
    const focusTimer = window.setTimeout(() => {
      searchRef.current?.focus({ preventScroll: true });
    }, 40);
    return () => window.clearTimeout(focusTimer);
  }, [open, shouldRender]);

  // Keep the highlighted row in view while arrowing through results
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-guide-index="${highlight}"]`
    );
    row?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  if (!shouldRender) return null;

  const nudgeTabs = (dir: -1 | 1) => {
    const container = tabListRef.current;
    if (!container) return;
    container.scrollBy({
      left: dir * 150,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  const runEntry = (entry: GuideEntry) => {
    entry.run();
    if (window.innerWidth < 640) onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (showKeys || visibleEntries.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % visibleEntries.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(
        (h) => (h - 1 + visibleEntries.length) % visibleEntries.length
      );
    } else if (e.key === 'Enter' && e.target === searchRef.current) {
      e.preventDefault();
      const entry = visibleEntries[highlight];
      if (entry) runEntry(entry);
    }
  };

  const handleTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = tabs[(idx + 1) % tabs.length];
      setTab(next.id);
      tabButtonRefs.current[next.id]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
      setTab(prev.id);
      tabButtonRefs.current[prev.id]?.focus();
    }
  };

  // Eased edge-mask when the capsule tab row overflows horizontally
  const scrollMask =
    canScrollLeft && canScrollRight
      ? 'linear-gradient(to right, transparent 0px, black 18px, black calc(100% - 18px), transparent 100%)'
      : canScrollLeft
      ? 'linear-gradient(to right, transparent 0px, black 18px, black 100%)'
      : canScrollRight
      ? 'linear-gradient(to right, black 0px, black calc(100% - 18px), transparent 100%)'
      : undefined;

  let lastSection = '';

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="screenplay-guide-title"
      onKeyDown={handleKeyDown}
      style={{
        zIndex: 'var(--z-toolbar)',
        backgroundColor: 'var(--bg-elevated)',
        boxShadow: 'var(--elevation-floating)',
        transformOrigin: 'top right',
        opacity: isVisible ? 1 : 0,
        transform: isVisible
          ? 'scale(1) translateY(0px)'
          : 'scale(0.96) translateY(-6px)',
        transition: isVisible
          ? 'opacity 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)'
          : 'opacity 145ms cubic-bezier(0.32, 0.72, 0, 1), transform 145ms cubic-bezier(0.32, 0.72, 0, 1)',
        willChange: 'transform, opacity',
      }}
      className="no-print fixed right-3 top-[60px] flex max-h-[calc(100dvh-140px)] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl font-sans motion-reduce:!transform-none motion-reduce:!transition-none"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div>
          <h2
            id="screenplay-guide-title"
            className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--ink-1)]"
          >
            Screenplay guide
          </h2>
          <p className="mt-0.5 text-xs text-[var(--ink-3)]">
            Click anything to insert it at your cursor.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close screenplay guide"
          className="relative -mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--ink-3)] transition-[color,background-color,transform] duration-150 ease-out before:absolute before:-inset-1.5 hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)] active:scale-[0.96]"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4">
        <label className="relative block">
          <span className="sr-only">Search screenplay elements</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ink-3)]"
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search elements, transitions, shots…"
            role="combobox"
            aria-expanded="true"
            aria-controls="screenplay-guide-list"
            aria-activedescendant={
              visibleEntries[highlight] ? `guide-row-${highlight}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
            style={{
              backgroundColor: 'var(--bg-surface)',
              boxShadow:
                'inset 0 0 0 var(--border-hairline) var(--border-subtle)',
            }}
            className="h-9 w-full rounded-full pl-8 pr-3 text-base text-[var(--ink-1)] transition-shadow duration-150 placeholder:text-[var(--ink-4)] focus:outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--border-strong)] sm:text-[13px]"
          />
        </label>
      </div>

      {/* v.1 Recessed Capsule Tab Bar (Theme-adaptive across Paper, Sepia, and Night) */}
      {!normalizedQuery && (
        <div className="mt-3 px-4">
          <div
            style={{
              background: 'var(--capsule-track-bg)',
              boxShadow: 'var(--capsule-track-shadow)',
            }}
            className="relative flex items-center rounded-full p-1"
          >
            {/* Subtle Left Scroll Nudge */}
            {canScrollLeft && (
              <button
                type="button"
                tabIndex={-1}
                aria-label="Scroll tabs left"
                onClick={() => nudgeTabs(-1)}
                style={{
                  background:
                    'linear-gradient(90deg, var(--bg-surface) 55%, transparent)',
                }}
                className="absolute left-1 top-1 bottom-1 z-20 flex w-6 items-center justify-start rounded-l-full pl-1 text-[var(--ink-3)] transition-colors hover:text-[var(--ink-1)] active:scale-[0.96]"
              >
                <ChevronLeft className="size-3.5" strokeWidth={2.2} />
              </button>
            )}

            {/* Inner Scrollable Capsule Track (native scrollbar hidden) */}
            <div
              ref={tabListRef}
              role="tablist"
              aria-label="Guide sections"
              onScroll={updateTabMetrics}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                maskImage: scrollMask,
                WebkitMaskImage: scrollMask,
              }}
              className="relative flex w-full items-center gap-0.5 overflow-x-auto rounded-full [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              {/* Sliding Hover Pill (matches "3D Models" hover state in v.1) */}
              <span
                aria-hidden="true"
                style={{
                  width: `${hoverPill.w}px`,
                  transform: `translate3d(${hoverPill.x}px, 0, 0)`,
                  opacity: hoverPill.visible ? 1 : 0,
                  background: 'var(--capsule-hover-bg)',
                  boxShadow: 'var(--capsule-hover-shadow)',
                  transition:
                    'transform 160ms cubic-bezier(0.32, 0.72, 0, 1), width 160ms cubic-bezier(0.32, 0.72, 0, 1), opacity 140ms ease-out',
                }}
                className="pointer-events-none absolute inset-y-0 left-0 rounded-full motion-reduce:!transition-none"
              />

              {/* Sliding Active Pill (matches "Discover" active state in v.1) */}
              <span
                aria-hidden="true"
                style={{
                  width: `${activePill.w}px`,
                  transform: `translate3d(${activePill.x}px, 0, 0)`,
                  background: 'var(--capsule-active-bg)',
                  boxShadow: 'var(--capsule-active-shadow)',
                  transition:
                    'transform 220ms cubic-bezier(0.32, 0.72, 0, 1), width 220ms cubic-bezier(0.32, 0.72, 0, 1)',
                }}
                className="pointer-events-none absolute inset-y-0 left-0 rounded-full motion-reduce:!transition-none"
              />

              {tabs.map((t, idx) => {
                const selected = tab === t.id;
                const hovered = hoveredTab === t.id && !selected;

                return (
                  <button
                    key={t.id}
                    ref={(el) => {
                      tabButtonRefs.current[t.id] = el;
                    }}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls="screenplay-guide-list"
                    tabIndex={selected ? 0 : -1}
                    onMouseEnter={() => setHoveredTab(t.id)}
                    onFocus={() => setHoveredTab(t.id)}
                    onBlur={() => setHoveredTab(null)}
                    onClick={() => setTab(t.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, idx)}
                    style={{
                      color: selected
                        ? 'var(--ink-1)'
                        : hovered
                        ? 'var(--ink-1)'
                        : 'var(--ink-3)',
                    }}
                    className="relative z-10 inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full pl-2 pr-3 text-xs font-medium tracking-[-0.01em] transition-[color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-1)] active:scale-[0.96]"
                  >
                    <GuideTabIcon
                      tabId={t.id}
                      selected={selected}
                      hovered={hovered}
                    />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Subtle Right Scroll Nudge */}
            {canScrollRight && (
              <button
                type="button"
                tabIndex={-1}
                aria-label="Scroll tabs right"
                onClick={() => nudgeTabs(1)}
                style={{
                  background:
                    'linear-gradient(270deg, var(--bg-surface) 55%, transparent)',
                }}
                className="absolute right-1 top-1 bottom-1 z-20 flex w-6 items-center justify-end rounded-r-full pr-1 text-[var(--ink-3)] transition-colors hover:text-[var(--ink-1)] active:scale-[0.96]"
              >
                <ChevronRight className="size-3.5" strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      <div
        ref={listRef}
        id="screenplay-guide-list"
        role={showKeys ? undefined : 'listbox'}
        aria-label={showKeys ? undefined : 'Screenplay elements'}
        className="focus-scroller mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-3"
      >
        {activeGroup && !normalizedQuery && (
          <p
            role="presentation"
            className="px-2 pb-2 pt-1 text-xs leading-relaxed text-[var(--ink-3)]"
          >
            {activeGroup.hint}
          </p>
        )}

        {showKeys ? (
          <div className="space-y-4 px-2 pt-1">
            {SCREENPLAY_KEY_GROUPS(mod, alt).map((group) => (
              <section key={group.title}>
                <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                  {group.title}
                </h3>
                <div
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                  className="divide-y divide-[var(--border-subtle)] rounded-xl px-3"
                >
                  {group.rows.map((row) => (
                    <div
                      key={`${row.keys}-${row.result}`}
                      className="flex items-center justify-between gap-3 py-2 text-xs"
                    >
                      <span className="text-[var(--ink-2)]">{row.result}</span>
                      <kbd
                        style={{
                          backgroundColor: 'var(--bg-elevated)',
                          boxShadow: 'var(--elevation-raised)',
                        }}
                        className="shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--ink-1)]"
                      >
                        {row.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <p className="text-sm font-medium text-[var(--ink-1)]">
              Nothing matches “{query.trim()}”
            </p>
            <p className="mt-1 text-xs text-[var(--ink-3)]">
              Try a term like “V.O.”, “montage”, or “cut to”.
            </p>
          </div>
        ) : (
          visibleEntries.map((entry, idx) => {
            const showSection =
              (normalizedQuery || tab === 'elements') &&
              entry.section !== lastSection;
            lastSection = entry.section;
            const isHighlighted = idx === highlight;
            return (
              <React.Fragment key={entry.key}>
                {showSection && (
                  <div
                    role="presentation"
                    className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)] first:pt-1"
                  >
                    {entry.section}
                  </div>
                )}
                <button
                  type="button"
                  id={`guide-row-${idx}`}
                  data-guide-index={idx}
                  role="option"
                  aria-selected={isHighlighted}
                  tabIndex={-1}
                  onMouseMove={() => setHighlight(idx)}
                  onClick={() => runEntry(entry)}
                  style={{
                    backgroundColor: isHighlighted
                      ? 'var(--bg-subtle-hover)'
                      : 'transparent',
                  }}
                  className="flex w-full items-start justify-between gap-3 rounded-xl px-2.5 py-2 text-start transition-[background-color,transform] duration-100 ease-out active:scale-[0.99]"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`text-[13px] font-medium text-[var(--ink-1)] ${
                          entry.mono ? 'font-mono tracking-[-0.01em]' : ''
                        }`}
                      >
                        {entry.title}
                      </span>
                      {entry.key === 'title-page' && (
                        <FileText
                          aria-hidden="true"
                          className="size-3.5 text-[var(--ink-3)]"
                        />
                      )}
                      {entry.key === 'dual-dialogue' && (
                        <Columns2
                          aria-hidden="true"
                          className="size-3.5 text-[var(--ink-3)]"
                        />
                      )}
                      {entry.active && (
                        <span className="inline-flex h-4 items-center rounded-full bg-[var(--ink-1)] px-1.5 text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--bg-canvas)]">
                          Current
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-[var(--ink-3)]">
                      {entry.detail}
                    </span>
                  </span>
                  {entry.shortcut && (
                    <kbd
                      style={{ backgroundColor: 'var(--bg-surface)' }}
                      className="mt-0.5 shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--ink-2)] [font-variant-numeric:tabular-nums]"
                    >
                      {entry.shortcut}
                    </kbd>
                  )}
                </button>
              </React.Fragment>
            );
          })
        )}
      </div>

      <div
        style={{
          borderTop: 'var(--border-hairline) solid var(--border-subtle)',
        }}
        className="flex items-center justify-between px-4 py-2.5 text-[11px] text-[var(--ink-3)]"
      >
        <span>↑↓ to browse · ↵ to insert · Esc to close</span>
        <span className="font-mono [font-variant-numeric:tabular-nums]">
          {guideShortcut()}
        </span>
      </div>
    </div>
  );
};
