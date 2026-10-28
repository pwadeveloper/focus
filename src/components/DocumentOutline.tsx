import React, { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { DocumentUnit, WorkKind } from '../types';
import { getUnitBadgeLabel } from '../editorUtils';
import { canHover, prefersReducedMotion } from '../motion';

export interface OutlineHeadingItem {
  id: string;
  text: string;
  sublabel?: string;
  kindTag?: 'unit' | 'slugline' | 'dialogue' | 'action' | 'transition' | 'heading';
  level: 0 | 1 | 2 | 3; // 0 = Primary Unit / Title, 1 = H1, 2 = Slugline / H2, 3 = Dialogue / Action / H3
  element: HTMLElement | null;
  unitId?: string;
}

interface DocumentOutlineProps {
  workKind: WorkKind;
  docTitle: string;
  contentHtml: string;
  units?: DocumentUnit[];
  activeUnitId?: string;
  onSelectUnit?: (unitId: string) => void;
  editorContainerRef: React.RefObject<HTMLDivElement | null>;
  titleInputRef: React.RefObject<HTMLTextAreaElement | null>;
  sidebarOpen: boolean;
  isTyping: boolean;
}

/**
 * Formats a unit's top-level label so screenplay scenes always lead with
 * "Scene 1", "Scene 2", etc. (never repeating raw "INT. LOCATION - DAY" 20 times).
 */
function formatUnitPrimaryLabel(
  unit: DocumentUnit,
  units: DocumentUnit[]
): string {
  const badge = getUnitBadgeLabel(unit, units); // e.g. "Scene 4"
  const rawTitle = (unit.title || '').trim();

  if (!rawTitle || rawTitle.toLowerCase() === badge.toLowerCase()) {
    return badge;
  }

  return `${badge} · ${rawTitle}`;
}

/**
 * Extracts structured sub-items (INT./EXT. sluglines, dialogue exchanges,
 * action beats, transitions, or markdown headings) from a root container
 * (either the live editor DOM for the active scene or a temporary div for other scenes).
 */
function extractScreenplaySubsFromRoot(
  root: HTMLElement,
  unitId: string,
  isLiveDom: boolean
): OutlineHeadingItem[] {
  const subs: OutlineHeadingItem[] = [];
  const children = Array.from(root.children) as HTMLElement[];

  // For non-live scenes, check if the scene only has the untouched default placeholder
  if (!isLiveDom) {
    const plain = (root.textContent || '').trim();
    if (!plain || plain.toUpperCase() === 'INT. LOCATION - DAY') {
      return [];
    }
  }

  let lastActionAdded = false;

  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    const tag = el.tagName.toLowerCase();
    const rawText = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!rawText) continue;

    const spType = el.getAttribute('data-sp-type');

    // 1. Sluglines (INT. / EXT.), Sections, Act Breaks, Shots, or Markdown Headings -> Level 2 Sub
    if (
      spType === 'slugline' ||
      spType === 'section' ||
      spType === 'act-break' ||
      spType === 'shot' ||
      tag === 'h1' ||
      tag === 'h2' ||
      tag === 'h3' ||
      /^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)/i.test(rawText)
    ) {
      subs.push({
        id: `outline-sp-slug-${unitId}-${i}`,
        text: spType === 'section' ? rawText : rawText.toUpperCase(),
        sublabel: spType === 'section' ? 'SECTION' : spType === 'shot' ? 'SHOT' : 'SLUG',
        kindTag: 'slugline',
        level: 2,
        element: isLiveDom ? el : null,
        unitId,
      });
      lastActionAdded = false;
      continue;
    }

    // 2. Character + Dialogue exchange -> Level 3 Sub
    if (spType === 'character') {
      const charName = rawText.toUpperCase();
      let dialogueSnippet = '';

      // Look ahead for the dialogue line belonging to this character cue
      const next1 = children[i + 1];
      const next2 = children[i + 2];
      if (next1) {
        const next1Type = next1.getAttribute('data-sp-type');
        if (next1Type === 'dialogue') {
          dialogueSnippet = (next1.textContent || '').replace(/\s+/g, ' ').trim();
        } else if (
          next1Type === 'parenthetical' &&
          next2 &&
          next2.getAttribute('data-sp-type') === 'dialogue'
        ) {
          dialogueSnippet = (next2.textContent || '').replace(/\s+/g, ' ').trim();
        }
      }

      const combinedText = dialogueSnippet
        ? `${charName}: “${dialogueSnippet}”`
        : charName;

      subs.push({
        id: `outline-sp-dlg-${unitId}-${i}`,
        text: combinedText,
        sublabel: 'DIALOGUE',
        kindTag: 'dialogue',
        level: 3,
        element: isLiveDom ? el : null,
        unitId,
      });
      lastActionAdded = false;
      continue;
    }

    // 3. Transitions (CUT TO:, DISSOLVE TO:, etc.) -> Level 3 Sub
    if (spType === 'transition') {
      subs.push({
        id: `outline-sp-trans-${unitId}-${i}`,
        text: `→ ${rawText.toUpperCase()}`,
        sublabel: 'CUT',
        kindTag: 'transition',
        level: 3,
        element: isLiveDom ? el : null,
        unitId,
      });
      lastActionAdded = false;
      continue;
    }

    // 4. Action beats (include in live active scene, or first beat after each slugline/dialogue)
    if (
      (spType === 'action' || (!spType && tag === 'p')) &&
      (isLiveDom ? !lastActionAdded || children.length <= 10 : !lastActionAdded)
    ) {
      subs.push({
        id: `outline-sp-act-${unitId}-${i}`,
        text: rawText,
        sublabel: 'BEAT',
        kindTag: 'action',
        level: 3,
        element: isLiveDom ? el : null,
        unitId,
      });
      lastActionAdded = true;
    }
  }

  return subs;
}

export const DocumentOutline: React.FC<DocumentOutlineProps> = ({
  workKind,
  docTitle,
  contentHtml,
  units,
  activeUnitId,
  onSelectUnit,
  editorContainerRef,
  titleInputRef,
  sidebarOpen,
  isTyping,
}) => {
  const [headings, setHeadings] = useState<OutlineHeadingItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const navRef = useRef<HTMLElement>(null);
  const ticksWrapperRef = useRef<HTMLButtonElement>(null);
  const labelsWrapperRef = useRef<HTMLDivElement>(null);
  const labelRowsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const tickBarsRef = useRef<(HTMLSpanElement | null)[]>([]);

  const scanHeadings = useCallback(() => {
    const items: OutlineHeadingItem[] = [];

    if (units && units.length > 0) {
      units.forEach((u) => {
        const isCurrentUnit = u.id === activeUnitId;
        const badge = getUnitBadgeLabel(u, units);
        const labelText = formatUnitPrimaryLabel(u, units);

        // Top-level Scene entry
        items.push({
          id: `outline-unit-${u.id}`,
          text: labelText,
          sublabel: badge,
          kindTag: 'unit',
          level: 0,
          element: isCurrentUnit ? titleInputRef.current : null,
          unitId: u.id,
        });

        if (isCurrentUnit && editorContainerRef.current) {
          const liveSubs = extractScreenplaySubsFromRoot(
            editorContainerRef.current,
            u.id,
            true
          );
          items.push(...liveSubs);
        } else if (u.contentHtml) {
          const temp = document.createElement('div');
          temp.innerHTML = u.contentHtml;
          const storedSubs = extractScreenplaySubsFromRoot(temp, u.id, false);
          items.push(...storedSubs);
        }
      });
    } else {
      items.push({
        id: 'outline-doc-title',
        text: docTitle.trim() || 'Untitled screenplay',
        kindTag: 'unit',
        level: 0,
        element: titleInputRef.current,
      });

      const editor = editorContainerRef.current;
      if (editor) {
        const nodes = editor.querySelectorAll('h1, h2, h3');
        nodes.forEach((node, idx) => {
          const el = node as HTMLElement;
          const rawText = (el.textContent || '').trim();
          if (!rawText) return;
          const tag = el.tagName.toLowerCase();
          const level: 1 | 2 | 3 = tag === 'h1' ? 1 : tag === 'h2' ? 2 : 3;
          items.push({
            id: `outline-heading-${idx}`,
            text: rawText,
            kindTag: 'heading',
            level,
            element: el,
          });
        });
      }
    }

    setHeadings(items);
  }, [
    workKind,
    units,
    activeUnitId,
    docTitle,
    editorContainerRef,
    titleInputRef,
  ]);

  useEffect(() => {
    scanHeadings();
  }, [contentHtml, docTitle, activeUnitId, units, scanHeadings]);

  // Dismiss expanded outline on touch outside
  useEffect(() => {
    if (!isExpanded) return;
    const handlePointerDownOutside = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
        setHoveredIndex(null);
      }
    };
    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () =>
      document.removeEventListener('pointerdown', handlePointerDownOutside);
  }, [isExpanded]);

  const updateActiveFromScroll = useCallback(() => {
    if (headings.length === 0) return;

    let baseIdx = headings.findIndex(
      (h) => h.unitId === activeUnitId && h.level === 0
    );
    if (baseIdx === -1) baseIdx = 0;

    // If the user's cursor is inside a specific block in the editor, highlight its corresponding outline item
    const editor = editorContainerRef.current;
    const activeBlock = editor?.querySelector('.is-active-block');
    if (activeBlock) {
      let matchedIdx = -1;
      for (let i = baseIdx + 1; i < headings.length; i++) {
        const item = headings[i];
        if (item.unitId !== activeUnitId) break;
        if (
          item.element === activeBlock ||
          (item.element &&
            activeBlock.compareDocumentPosition(item.element) &
              Node.DOCUMENT_POSITION_PRECEDING)
        ) {
          matchedIdx = i;
        }
      }
      if (matchedIdx !== -1) {
        setActiveIndex(matchedIdx);
        return;
      }
    }

    const threshold = window.innerHeight * 0.35;
    let activeIdx = baseIdx;

    for (let i = baseIdx + 1; i < headings.length; i++) {
      const item = headings[i];
      if (item.unitId !== activeUnitId) break;
      if (item.element) {
        const rect = item.element.getBoundingClientRect();
        if (rect.top <= threshold) {
          activeIdx = i;
        }
      }
    }
    setActiveIndex(activeIdx);
  }, [headings, activeUnitId, editorContainerRef]);

  useEffect(() => {
    updateActiveFromScroll();
    window.addEventListener('scroll', updateActiveFromScroll, {
      passive: true,
    });
    document.addEventListener('selectionchange', updateActiveFromScroll);
    return () => {
      window.removeEventListener('scroll', updateActiveFromScroll);
      document.removeEventListener('selectionchange', updateActiveFromScroll);
    };
  }, [updateActiveFromScroll]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const targetOpacity = sidebarOpen ? 0 : isTyping && !isExpanded ? 0.42 : 1;

    if (prefersReducedMotion()) {
      nav.style.opacity = String(targetOpacity);
      return;
    }

    gsap.to(nav, {
      opacity: targetOpacity,
      duration: 0.25,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  }, [isTyping, isExpanded, sidebarOpen]);

  useEffect(() => {
    const ticksEl = ticksWrapperRef.current;
    const labelsEl = labelsWrapperRef.current;
    const rows = labelRowsRef.current.filter(Boolean) as HTMLButtonElement[];
    const ticks = tickBarsRef.current.filter(Boolean) as HTMLSpanElement[];

    if (!ticksEl || !labelsEl) return;

    if (prefersReducedMotion()) {
      ticksEl.style.opacity = isExpanded ? '0' : '1';
      ticksEl.style.pointerEvents = isExpanded ? 'none' : 'auto';
      labelsEl.style.opacity = isExpanded ? '1' : '0';
      labelsEl.style.visibility = isExpanded ? 'visible' : 'hidden';
      labelsEl.style.pointerEvents = isExpanded ? 'auto' : 'none';
      return;
    }

    if (isExpanded) {
      gsap.killTweensOf([ticksEl, labelsEl, ...rows, ...ticks]);

      gsap.to(ticksEl, {
        autoAlpha: 0,
        x: -4,
        duration: 0.14,
        ease: 'power2.out',
      });

      gsap.set(labelsEl, { pointerEvents: 'auto' });
      gsap.to(labelsEl, {
        autoAlpha: 1,
        x: 0,
        duration: 0.2,
        ease: 'power3.out',
      });

      gsap.fromTo(
        rows,
        { x: -7, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.22,
          stagger: 0.012,
          ease: 'power3.out',
          overwrite: 'auto',
        }
      );
    } else {
      gsap.killTweensOf([ticksEl, labelsEl, ...rows, ...ticks]);

      gsap.set(labelsEl, { pointerEvents: 'none' });
      gsap.to(labelsEl, {
        autoAlpha: 0,
        x: -6,
        duration: 0.15,
        ease: 'power2.in',
      });

      gsap.to(ticksEl, {
        autoAlpha: 1,
        x: 0,
        duration: 0.2,
        ease: 'power3.out',
      });

      gsap.fromTo(
        ticks,
        { scaleX: 0.6, opacity: 0.3 },
        {
          scaleX: 1,
          opacity: 1,
          duration: 0.2,
          stagger: 0.01,
          ease: 'power2.out',
          overwrite: 'auto',
        }
      );
    }
  }, [isExpanded, headings.length]);

  const handleItemHoverEnter = (idx: number, btn: HTMLButtonElement) => {
    if (!canHover()) return;
    setHoveredIndex(idx);
    if (prefersReducedMotion()) return;
    gsap.to(btn, {
      x: 3.5,
      duration: 0.16,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  };

  const handleItemHoverLeave = (btn: HTMLButtonElement) => {
    setHoveredIndex(null);
    if (prefersReducedMotion()) return;
    gsap.to(btn, {
      x: 0,
      duration: 0.18,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  };

  const handleJumpToHeading = (item: OutlineHeadingItem, idx: number) => {
    setActiveIndex(idx);
    if (!canHover()) {
      setIsExpanded(false);
    }

    if (item.unitId && item.unitId !== activeUnitId && onSelectUnit) {
      onSelectUnit(item.unitId);
      return;
    }

    if (item.level === 0 || !item.element) {
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
      return;
    }

    const rect = item.element.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - window.innerHeight * 0.22;

    window.scrollTo({
      top: Math.max(0, targetY),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });

    if (!prefersReducedMotion()) {
      gsap.fromTo(
        item.element,
        { x: 4 },
        {
          x: 0,
          duration: 0.45,
          ease: 'power3.out',
          overwrite: 'auto',
        }
      );
    }
  };

  if (sidebarOpen) return null;

  return (
    <nav
      ref={navRef}
      aria-label="Document outline"
      onMouseEnter={() => {
        if (canHover()) setIsExpanded(true);
      }}
      onMouseLeave={() => {
        if (canHover()) {
          setIsExpanded(false);
          setHoveredIndex(null);
        }
      }}
      onFocus={() => setIsExpanded(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsExpanded(false);
        }
      }}
      style={{
        zIndex: 'calc(var(--z-header) - 1)',
        left: 'max(0.375rem, env(safe-area-inset-left, 0px))',
      }}
      className="no-print fixed top-[28vh] select-none md:!left-3 lg:!left-5"
    >
      <div className="relative flex items-start">
        {/* Resting State: Minimal Horizontal Tick Marks (tappable on mobile, hoverable on desktop) */}
        <button
          ref={ticksWrapperRef}
          type="button"
          aria-label="Expand document outline"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded(true)}
          className="flex min-h-11 min-w-9 flex-col justify-center gap-2 py-2 pr-3 text-start md:gap-2.5"
        >
          {headings.map((item, idx) => {
            const isActive = idx === activeIndex;
            const isCurrentUnitHeader =
              item.level === 0 && item.unitId && item.unitId === activeUnitId;
            const widthPx = isActive
              ? 18
              : item.level === 0 || item.level === 1
              ? 13
              : item.level === 2
              ? 9
              : 6;

            return (
              <span
                key={item.id}
                ref={(el) => {
                  tickBarsRef.current[idx] = el;
                }}
                style={{
                  width: `${widthPx}px`,
                  height: isActive || isCurrentUnitHeader ? '2.5px' : '2px',
                  transformOrigin: 'left center',
                  backgroundColor:
                    isActive || isCurrentUnitHeader
                      ? 'var(--accent)'
                      : item.level === 0
                      ? 'var(--ink-3)'
                      : 'var(--ink-4)',
                  opacity: isActive ? 1 : isCurrentUnitHeader ? 0.85 : 0.55,
                }}
                className="block rounded-full transition-[width,background-color,opacity] duration-200 ease-out"
              />
            );
          })}
        </button>

        {/* Hovered / Tapped State: Expanded Section List */}
        <div
          ref={labelsWrapperRef}
          aria-hidden={!isExpanded}
          style={{
            opacity: 0,
            visibility: 'hidden',
            pointerEvents: 'none',
            backgroundColor:
              'color-mix(in srgb, var(--bg-elevated) 96%, transparent)',
            boxShadow: 'var(--elevation-floating)',
          }}
          className="focus-scroller absolute left-0 top-0 -my-1.5 flex max-h-[62dvh] w-60 flex-col gap-0.5 overflow-y-auto rounded-2xl p-2.5 backdrop-blur-md"
        >
          {headings.map((item, idx) => {
            const isActive = idx === activeIndex;
            const isHovered = idx === hoveredIndex;
            const isCurrentUnitHeader =
              item.level === 0 && item.unitId && item.unitId === activeUnitId;
            const highlighted = isActive || isHovered || isCurrentUnitHeader;

            return (
              <button
                key={item.id}
                ref={(el) => {
                  labelRowsRef.current[idx] = el;
                }}
                type="button"
                title={item.text}
                onMouseEnter={(e) => handleItemHoverEnter(idx, e.currentTarget)}
                onMouseLeave={(e) => handleItemHoverLeave(e.currentTarget)}
                onClick={() => handleJumpToHeading(item, idx)}
                style={{
                  color:
                    isActive || isHovered
                      ? 'var(--accent)'
                      : isCurrentUnitHeader
                      ? 'var(--ink-1)'
                      : item.level === 0 || item.level === 1
                      ? 'var(--ink-2)'
                      : 'var(--ink-3)',
                  backgroundColor: isActive
                    ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                    : 'transparent',
                  paddingInlineStart:
                    item.level === 2
                      ? '0.65rem'
                      : item.level === 3
                      ? '1.25rem'
                      : '0.35rem',
                }}
                className={`flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-start transition-colors duration-150 md:py-1 ${
                  item.level === 0 || item.level === 1
                    ? 'font-sans text-xs font-semibold tracking-[-0.01em]'
                    : item.kindTag === 'slugline'
                    ? 'font-mono text-[10.5px] font-semibold uppercase tracking-[0.02em]'
                    : item.level === 2
                    ? 'font-sans text-[11.5px] font-medium'
                    : 'font-sans text-[11px] font-normal'
                }`}
              >
                {item.level >= 2 && (
                  <span
                    style={{
                      backgroundColor: highlighted
                        ? 'var(--accent)'
                        : 'var(--border-strong)',
                    }}
                    className={`shrink-0 rounded-full ${
                      item.level === 2 ? 'size-1.5' : 'h-px w-2'
                    }`}
                  />
                )}
                <span className="truncate">{item.text}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
