import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Clapperboard,
  GitCommitHorizontal,
  Pin,
  RotateCcw,
} from 'lucide-react';
import { canHover, prefersReducedMotion } from '../motion';
import { Tone, WORK_KIND_TONE, toneVar } from '../palette';
import { NewWorkOptions } from '../storage';

interface NewWorkModalProps {
  open: boolean;
  onClose: () => void;
  onCreateWork: (title: string, options?: NewWorkOptions) => void;
}

const DEFAULT_WORD_GOAL = 1000;

const GOAL_SWATCHES: {
  value: number;
  shortLabel: string;
  tone: Tone;
}[] = [
  { value: 500, shortLabel: '500', tone: 'sky' },
  { value: 1000, shortLabel: '1k', tone: 'lavender' },
  { value: 1500, shortLabel: '1.5k', tone: 'butter' },
  { value: 2500, shortLabel: '2.5k', tone: 'sage' },
  { value: 5000, shortLabel: '5k', tone: 'blush' },
];

export const NewWorkModal: React.FC<NewWorkModalProps> = ({
  open,
  onClose,
  onCreateWork,
}) => {
  // Keep modal mounted through its 165ms exit transition so it never cuts to display:none
  const [shouldRender, setShouldRender] = useState(open);
  const [isVisible, setIsVisible] = useState(false);

  const [title, setTitle] = useState('');
  const [wordGoal, setWordGoal] = useState<number>(DEFAULT_WORD_GOAL);

  const [includeOpeningSlugline, setIncludeOpeningSlugline] = useState(true);
  const [openInTimeline, setOpenInTimeline] = useState(false);
  const [pinToLibrary, setPinToLibrary] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Reset form fields when modal opens
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setWordGoal(DEFAULT_WORD_GOAL);
    setIncludeOpeningSlugline(true);
    setOpenInTimeline(false);
  }, [open]);

  // Sync mount & visibility lifecycle with enter (220ms ease-out) and exit (160ms ease-out)
  useEffect(() => {
    const reduced = prefersReducedMotion();
    if (open) {
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
        }, 170);
        return () => window.clearTimeout(timer);
      }
    }
  }, [open]);

  // Focus title input on desktop and wire Escape key
  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => {
      if (canHover()) {
        inputRef.current?.focus();
      }
    }, 80);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  const handleResetDefaults = () => {
    setTitle('');
    setWordGoal(DEFAULT_WORD_GOAL);
    setIncludeOpeningSlugline(true);
    setOpenInTimeline(false);
    setPinToLibrary(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateWork(title, {
      includeOpeningSlugline,
      openInTimeline,
      pinToLibrary,
      wordGoal,
    });
    onClose();
  };

  if (!shouldRender) return null;

  const activeTone = WORK_KIND_TONE.screenplay;

  const toggleRows = [
    {
      id: 'sp-slugline',
      icon: Clapperboard,
      label: 'Start with opening slugline',
      hint: 'INT. LOCATION - DAY',
      checked: includeOpeningSlugline,
      onChange: setIncludeOpeningSlugline,
    },
    {
      id: 'sp-timeline',
      icon: GitCommitHorizontal,
      label: 'Open in Narrative Timeline',
      hint: 'Scene stripboard',
      checked: openInTimeline,
      onChange: setOpenInTimeline,
    },
    {
      id: 'pin-library',
      icon: Pin,
      label: 'Pin to top of archive',
      hint: 'Sidebar & cabinet',
      checked: pinToLibrary,
      onChange: setPinToLibrary,
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-work-dialog-title"
      style={{ zIndex: 'var(--z-modal)' }}
      className="no-print fixed inset-0 flex items-center justify-center p-4"
    >
      {/* Paired Backdrop — matches modal enter/exit timing */}
      <div
        onClick={onClose}
        style={{
          opacity: isVisible ? 1 : 0,
          transition: isVisible
            ? 'opacity 220ms cubic-bezier(0.32, 0.72, 0, 1)'
            : 'opacity 160ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        className="fixed inset-0 bg-black/35 backdrop-blur-[2px] motion-reduce:!transition-none"
      />

      {/* Dialog Surface */}
      <div
        style={{
          backgroundColor: 'var(--bg-elevated)',
          backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${toneVar(
            activeTone
          )} 24%, var(--bg-elevated)) 0%, var(--bg-elevated) 130px)`,
          boxShadow: 'var(--elevation-floating)',
          opacity: isVisible ? 1 : 0,
          transform: isVisible
            ? 'scale(1) translateY(0px)'
            : open
            ? 'scale(0.96) translateY(8px)'
            : 'scale(0.97) translateY(-6px)',
          transition: isVisible
            ? 'opacity 220ms cubic-bezier(0.32, 0.72, 0, 1), transform 220ms cubic-bezier(0.32, 0.72, 0, 1), background-image 200ms ease-out'
            : 'opacity 160ms cubic-bezier(0.32, 0.72, 0, 1), transform 160ms cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform, opacity',
        }}
        className="focus-scroller relative max-h-[92dvh] w-full max-w-[500px] overflow-y-auto rounded-[22px] p-5 sm:p-6 motion-reduce:!transform-none motion-reduce:!transition-none"
      >
        {/* Header Section */}
        <div
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
          className=" flex items-start justify-between gap-3 pb-4"
        >
          <div>
            <div className="flex items-center gap-2">
              <h2
                id="new-work-dialog-title"
                className="font-serif text-xl font-semibold tracking-tight text-[var(--ink-1)] sm:text-[22px]"
              >
                New Screenplay
              </h2>
            </div>
            <p className="mt-1 text-xs text-[var(--ink-3)]">
              Set the title, word goal, and starting layout for your script
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="relative flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--ink-3)] transition-[transform,background-color,color] duration-150 ease-out before:absolute before:-inset-1.5 hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)] active:scale-[0.95]"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Row 1: Working Title (Two-column row like Language in reference) */}
          <div
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
            className="flex flex-col gap-2.5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <label
                htmlFor="new-work-title"
                className="block text-[13px] font-semibold text-[var(--ink-1)]"
              >
                Working title
              </label>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                Formatted in uppercase on title page
              </p>
            </div>

            <div className="w-full sm:w-56 shrink-0">
              <input
                ref={inputRef}
                id="new-work-title"
                type="text"
                enterKeyHint="done"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="NIGHT FREQUENCY"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  boxShadow:
                    'inset 0 0 0 var(--border-hairline) var(--border-strong)',
                }}
                className="h-9 w-full rounded-xl px-3 text-base font-medium text-[var(--ink-1)] transition-shadow duration-150 placeholder:font-normal placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-1)] sm:text-xs"
              />
            </div>
          </div>

          {/* Row 2: Session Word Goal Swatches (like Accent color circles in reference) */}
          <div
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
            className="flex flex-col gap-2.5 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="text-[13px] font-semibold text-[var(--ink-1)]">
                Session word goal
              </div>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                Pick the target for your bottom progress ring
              </p>
            </div>

            <div
              role="radiogroup"
              aria-label="Session word goal"
              className="flex items-center gap-2"
            >
              {GOAL_SWATCHES.map((swatch) => {
                const selected = wordGoal === swatch.value;
                return (
                  <button
                    key={swatch.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${swatch.value} words`}
                    onClick={() => setWordGoal(swatch.value)}
                    style={{
                      backgroundColor: toneVar(swatch.tone),
                      color: 'var(--on-pastel)',
                      boxShadow: selected
                        ? '0 0 0 1.5px var(--bg-elevated), 0 0 0 3px var(--ink-1)'
                        : 'inset 0 0 0 1px rgba(17,17,17,0.08)',
                    }}
                    className="flex size-8 items-center justify-center rounded-full font-mono text-[10px] font-semibold tracking-tight transition-[transform,box-shadow] duration-150 ease-out [font-variant-numeric:tabular-nums] hover:scale-[1.06] active:scale-[0.94]"
                  >
                    {swatch.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rows 3–5: Three Toggle Switch Rows with Hairline Dividers */}
          <div className="divide-y divide-[var(--border-subtle)]">
            {toggleRows.map((row) => {
              const RowIcon = row.icon;
              return (
                <div
                  key={row.id}
                  onClick={() => row.onChange(!row.checked)}
                  className="flex cursor-pointer items-center justify-between gap-3 py-3.5 select-none"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <RowIcon
                      className="size-4 shrink-0 text-[var(--ink-3)]"
                      strokeWidth={1.85}
                    />
                    <span className="truncate text-[13px] font-medium text-[var(--ink-1)]">
                      {row.label}
                    </span>
                    <span className="hidden rounded-md bg-[var(--bg-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-3)] sm:inline-block">
                      {row.hint}
                    </span>
                  </div>

                  {/* Pill Toggle Switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={row.checked}
                    aria-label={row.label}
                    onClick={(e) => {
                      e.stopPropagation();
                      row.onChange(!row.checked);
                    }}
                    style={{
                      backgroundColor: row.checked
                        ? 'var(--ink-1)'
                        : 'var(--bg-surface)',
                      boxShadow: row.checked
                        ? 'none'
                        : 'inset 0 0 0 1px var(--border-strong)',
                    }}
                    className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-1)] focus-visible:ring-offset-2 active:scale-[0.96]"
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        backgroundColor: row.checked
                          ? toneVar(activeTone)
                          : 'var(--ink-3)',
                        transform: row.checked
                          ? 'translateX(20px)'
                          : 'translateX(0px)',
                        transition:
                          'transform 180ms cubic-bezier(0.32, 0.72, 0, 1), background-color 150ms ease-out',
                      }}
                      className="pointer-events-none size-5 rounded-full shadow-sm motion-reduce:!transition-none"
                    />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Bottom Footer Bar: Reset to default | Cancel | Create */}
          <div
            style={{ borderTop: '1px solid var(--border-subtle)' }}
            className="mt-1 flex items-center justify-between gap-3 pt-4"
          >
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 rounded-lg py-1.5 pr-2 text-xs font-medium text-[var(--ink-3)] transition-[color,transform] duration-150 ease-out hover:text-[var(--ink-1)] active:scale-[0.96]"
            >
              <RotateCcw className="size-3.5" strokeWidth={1.85} />
              <span>Reset to default</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  boxShadow:
                    'inset 0 0 0 var(--border-hairline) var(--border-strong)',
                }}
                className="h-9 rounded-xl px-4 text-xs font-semibold text-[var(--ink-1)] transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bg-subtle-hover)] active:scale-[0.96]"
              >
                Cancel
              </button>

              <button
                type="submit"
                style={{
                  backgroundColor: 'var(--ink-1)',
                  color: 'var(--bg-canvas)',
                }}
                className="inline-flex h-9 items-center gap-2 rounded-xl px-4 text-xs font-semibold transition-[transform,opacity] duration-150 ease-out hover:opacity-90 active:scale-[0.96]"
              >
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: toneVar(activeTone) }}
                  className="size-2 rounded-full transition-colors duration-150"
                />
                <span>Create Screenplay</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
