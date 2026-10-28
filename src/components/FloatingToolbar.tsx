import React, { useEffect, useRef } from 'react';
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

export interface SelectionRectInfo {
  top: number;
  left: number;
  visible: boolean;
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

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;

    if (rect.visible) {
      const halfWidth = Math.min(180, (window.innerWidth - 16) / 2);
      const clampedLeft = Math.min(
        window.innerWidth - halfWidth - 8,
        Math.max(halfWidth + 8, rect.left)
      );
      const clampedTop = Math.max(56, rect.top);
      if (prefersReducedMotion()) {
        el.style.left = `${clampedLeft}px`;
        el.style.top = `${clampedTop}px`;
        el.style.opacity = '1';
        wasVisibleRef.current = true;
        return;
      }

      if (!wasVisibleRef.current) {
        gsap.set(el, { left: clampedLeft, top: clampedTop });
        gsap.fromTo(
          el,
          { opacity: 0, scale: 0.95, y: 6 },
          {
            opacity: 1,
            scale: 1,
            y: 0,
            duration: 0.18,
            ease: 'power3.out',
            overwrite: 'auto',
          }
        );
        wasVisibleRef.current = true;
      } else {
        gsap.to(el, {
          left: clampedLeft,
          top: clampedTop,
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.16,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }
    } else {
      wasVisibleRef.current = false;
    }
  }, [rect.visible, rect.left, rect.top]);

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
        top: `${Math.max(12, rect.top)}px`,
        left: `${rect.left}px`,
        transform: 'translate(-50%, -100%)',
        transformOrigin: 'bottom center',
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
