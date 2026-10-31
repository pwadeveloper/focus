import React, { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Quote,
  List,
  ListOrdered,
  Code,
  RemoveFormatting,
} from 'lucide-react';
import { gsapButtonHover, prefersReducedMotion } from '../motion';

/** The selection's box in viewport pixels; left is its horizontal centre. */
export interface SelectionRectInfo {
  top: number;
  bottom: number;
  left: number;
  visible: boolean;
}

const GAP = 10;
const EDGE = 8;

/** Bottom edge of the app header while it's showing (it fades out as you type). */
const headerBottom = () => {
  const header = document.querySelector<HTMLElement>('[data-app-header]');
  if (!header) return 0;
  const style = getComputedStyle(header);
  if (style.visibility === 'hidden' || Number(style.opacity) === 0) return 0;
  return Math.max(0, header.getBoundingClientRect().bottom);
};

/** Above the selection, or below it when there's no room above, never over it. */
function placeToolbar(el: HTMLElement, rect: SelectionRectInfo) {
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  const minTop = headerBottom() + EDGE;
  const maxTop = window.innerHeight - height - EDGE;
  const left = Math.min(window.innerWidth - width - EDGE, Math.max(EDGE, rect.left - width / 2));
  const above = rect.top - GAP - height;
  if (above >= minTop) return { left, top: above, below: false };
  const below = rect.bottom + GAP;
  if (below <= maxTop) return { left, top: below, below: true };
  // The selection fills the screen; keep to the top edge
  return { left, top: minTop, below: false };
}

interface FloatingToolbarProps {
  rect: SelectionRectInfo;
  activeFormats: Set<string>;
  onCommand: (command: string, value?: string) => void;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  rect,
  activeFormats,
  onCommand,
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const wasVisibleRef = useRef(false);

  // Positioned in pixels before paint, so the entrance animation's transform
  // can't shift it back over the text it's meant to sit beside
  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el || !rect.visible) {
      wasVisibleRef.current = false;
      return;
    }

    const place = placeToolbar(el, rect);
    el.style.left = `${place.left}px`;
    el.style.top = `${place.top}px`;
    el.style.transformOrigin = place.below ? 'top center' : 'bottom center';
    // Scrolled out of view: hide rather than pin to an edge
    el.style.visibility = rect.bottom < 0 || rect.top > window.innerHeight ? 'hidden' : 'visible';

    if (wasVisibleRef.current) return;
    wasVisibleRef.current = true;
    if (prefersReducedMotion()) return;
    gsap.fromTo(
      el,
      { opacity: 0, scale: 0.95, y: place.below ? -6 : 6 },
      { opacity: 1, scale: 1, y: 0, duration: 0.18, ease: 'power3.out', overwrite: 'auto' }
    );
  }, [rect]);

  if (!rect.visible) return null;

  const hoverHandlers = gsapButtonHover({
    hoverScale: 1.06,
    hoverY: -1,
    pressScale: 0.94,
  });

  const tools = [
    {
      id: 'bold',
      label: 'Bold (⌘B)',
      icon: Bold,
      action: () => onCommand('bold'),
    },
    {
      id: 'italic',
      label: 'Italic (⌘I)',
      icon: Italic,
      action: () => onCommand('italic'),
    },
    {
      id: 'strikeThrough',
      label: 'Strikethrough (⌘⇧X)',
      icon: Strikethrough,
      action: () => onCommand('strikeThrough'),
    },
    {
      id: 'code',
      label: 'Inline code (⌘E)',
      icon: Code,
      action: () => onCommand('inlineCode'),
    },
    { divider: true, id: 'div-1' },
    {
      id: 'h1',
      label: 'Heading 1',
      icon: Heading1,
      action: () => onCommand('formatBlock', activeFormats.has('h1') ? 'P' : 'H1'),
    },
    {
      id: 'h2',
      label: 'Heading 2',
      icon: Heading2,
      action: () => onCommand('formatBlock', activeFormats.has('h2') ? 'P' : 'H2'),
    },
    {
      id: 'blockquote',
      label: 'Blockquote (⌘⇧9)',
      icon: Quote,
      action: () =>
        onCommand('formatBlock', activeFormats.has('blockquote') ? 'P' : 'BLOCKQUOTE'),
    },
    { divider: true, id: 'div-2' },
    {
      id: 'ul',
      label: 'Bullet list',
      icon: List,
      action: () => onCommand('insertUnorderedList'),
    },
    {
      id: 'ol',
      label: 'Numbered list',
      icon: ListOrdered,
      action: () => onCommand('insertOrderedList'),
    },
    {
      id: 'clear',
      label: 'Clear formatting',
      icon: RemoveFormatting,
      action: () => onCommand('removeFormat'),
    },
  ];

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Text formatting"
      style={{
        boxShadow: 'var(--elevation-floating)',
        backgroundColor: 'var(--bg-elevated)',
        zIndex: 'var(--z-toolbar)',
      }}
      onMouseDown={(e) => {
        // Prevent losing editor text selection when clicking toolbar buttons
        e.preventDefault();
      }}
      className="focus-scroller no-print fixed flex max-w-[calc(100vw-16px)] items-center gap-0.5 overflow-x-auto rounded-xl p-1"
    >
      {tools.map((tool) => {
        if ('divider' in tool && tool.divider) {
          return (
            <div
              key={tool.id}
              className="mx-0.5 h-5"
              style={{
                width: 'var(--border-hairline)',
                backgroundColor: 'var(--border-subtle)',
              }}
            />
          );
        }

        const Icon = tool.icon!;
        const isActive = activeFormats.has(tool.id);

        return (
          <button
            key={tool.id}
            type="button"
            onClick={tool.action}
            {...hoverHandlers}
            aria-label={tool.label}
            aria-pressed={isActive}
            title={tool.label}
            style={{
              color: isActive ? 'var(--accent)' : 'var(--ink-2)',
              backgroundColor: isActive ? 'var(--accent-soft)' : 'transparent',
            }}
            className="flex size-8 items-center justify-center rounded-lg transition-colors duration-150 ease-out hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
          >
            <Icon className="size-4" strokeWidth={1.85} />
          </button>
        );
      })}
    </div>
  );
};
