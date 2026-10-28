import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { X } from 'lucide-react';
import { gsapButtonHover, prefersReducedMotion } from '../motion';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ open, onClose }) => {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || prefersReducedMotion()) return;
    if (backdropRef.current) {
      gsap.fromTo(
        backdropRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.2, ease: 'power3.out' }
      );
    }
    if (dialogRef.current) {
      gsap.fromTo(
        dialogRef.current,
        { opacity: 0, scale: 0.96, y: 8 },
        { opacity: 1, scale: 1, y: 0, duration: 0.22, ease: 'power3.out' }
      );
    }
  }, [open]);

  if (!open) return null;

  const btnHover = gsapButtonHover({ hoverScale: 1.05, hoverY: -0.5, pressScale: 0.94 });

  const groups = [
    {
      title: 'Timeline, Cabinet & Writing Flow',
      items: [
        { label: 'Toggle Narrative Timeline / Bird’s-Eye', keys: '⌘ M' },
        { label: 'Toggle Project Filing Cabinet & Folders', keys: '⌘ K' },
        { label: 'Cycle Focus Mode (Off / Paragraph / Spotlight)', keys: '⌘ D' },
        { label: 'Toggle Typewriter Scrolling', keys: '⌘ T' },
        { label: 'Toggle Folder Tree Drawer', keys: '⌘ \\' },
        { label: 'Keyboard Shortcuts Reference', keys: '⌘ /' },
      ],
    },
    {
      title: 'Screenplay Scene & Dialogue Flow',
      items: [
        { label: 'Screenplay Elements Guide (every element & value)', keys: '⌘ ⌥ / or F1' },
        { label: 'Switch Element (Scene, Action, Character…)', keys: '⌘ ⌥ 1–9' },
        { label: 'Scene Heading Autocomplete', keys: 'INT. / EXT.' },
        { label: 'Action → Character Cue / Dialogue → Parenthetical', keys: 'Tab' },
        { label: 'Character Cue → Dialogue Line', keys: 'Enter' },
        { label: 'Character Cue (forced)', keys: '@ + Space' },
        { label: 'Parenthetical Direction', keys: '(' },
        { label: 'Scene Transition', keys: '> + Space' },
        { label: 'Dual Dialogue', keys: '⌘ ⇧ D' },
      ],
    },
    {
      title: 'Text Formatting',
      items: [
        { label: 'Bold / Italic / Strikethrough', keys: '⌘ B / ⌘ I / ⌘ ⇧ X' },
      ],
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-dialog-title"
      style={{ zIndex: 'var(--z-modal)' }}
      className="no-print fixed inset-0 flex items-center justify-center p-4"
    >
      <div
        ref={backdropRef}
        onClick={onClose}
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px]"
      />
      <div
        ref={dialogRef}
        style={{
          backgroundColor: 'var(--bg-elevated)',
          boxShadow: 'var(--elevation-floating)',
        }}
        className="relative w-full max-w-md rounded-2xl p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="shortcuts-dialog-title"
            className="font-serif text-lg font-semibold text-[var(--ink-1)]"
          >
            Keyboard & Writing Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            {...btnHover}
            aria-label="Close shortcuts dialog"
            className="flex size-8 items-center justify-center rounded-lg text-[var(--ink-3)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                {group.title}
              </div>
              <div
                style={{ backgroundColor: 'var(--bg-surface)' }}
                className="divide-y divide-[var(--border-subtle)] rounded-xl px-3 py-1"
              >
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between py-2 text-xs"
                  >
                    <span className="text-[var(--ink-2)]">{item.label}</span>
                    <kbd
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        boxShadow: 'var(--elevation-raised)',
                      }}
                      className="rounded-md px-2 py-0.5 font-mono text-[11px] font-medium text-[var(--ink-1)]"
                    >
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
