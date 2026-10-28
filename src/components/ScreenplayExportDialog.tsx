import React, { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { Download, Lock, Printer, X } from 'lucide-react';
import { DocumentItem, RevisionColor, ScreenplayExportSettings } from '../types';
import {
  REVISION_COLORS,
  fillTokens,
  renderScreenplayHtml,
  resolveExportSettings,
} from '../screenplayExport';
import { canHover, prefersReducedMotion } from '../motion';

interface ScreenplayExportDialogProps {
  open: boolean;
  doc: DocumentItem;
  onClose: () => void;
  onChangeSettings: (patch: Partial<ScreenplayExportSettings>) => void;
  /** Snapshot the current draft as the revision baseline. */
  onLockDraft: (color: RevisionColor) => void;
  onDownload: () => void;
}

const fieldClass =
  'h-9 w-full rounded-xl px-3 text-base text-[var(--ink-1)] transition-[box-shadow,background-color] duration-150 ease-out placeholder:text-[var(--ink-4)] focus:bg-[var(--bg-elevated)] focus:shadow-[inset_0_0_0_1px_var(--border-strong)] focus:outline-none sm:text-[13px]';

const Toggle: React.FC<{
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}> = ({ id, label, hint, checked, disabled, onChange }) => (
  <label
    htmlFor={id}
    className={`flex items-start justify-between gap-3 py-2.5 ${
      disabled ? 'opacity-50' : 'cursor-pointer'
    }`}
  >
    <span className="min-w-0">
      <span className="block text-[13px] font-medium text-[var(--ink-1)]">{label}</span>
      <span className="mt-0.5 block text-xs leading-snug text-[var(--ink-3)]">{hint}</span>
    </span>
    <input
      id={id}
      type="checkbox"
      role="switch"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="peer sr-only"
    />
    <span
      aria-hidden="true"
      style={{ backgroundColor: checked ? 'var(--ink-1)' : 'var(--border-strong)' }}
      className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ease-out peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ink-2)]"
    >
      <span
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
        className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out"
      />
    </span>
  </label>
);

/** Print a standalone HTML document from a hidden iframe (no popup needed). */
const printHtml = (html: string) => {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const cleanup = () => window.setTimeout(() => frame.remove(), 1000);
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return cleanup();
    // Give the screenplay font a moment so page breaks match the preview
    const go = () => {
      win.focus();
      win.print();
      cleanup();
    };
    const fonts = (win.document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) fonts.ready.then(go, go);
    else go();
  };
  frame.srcdoc = html;
};

/**
 * Screenplay export: page options, revision locking, and a live preview of the
 * exact paginated pages that download and print.
 */
export const ScreenplayExportDialog: React.FC<ScreenplayExportDialogProps> = ({
  open,
  doc,
  onClose,
  onChangeSettings,
  onLockDraft,
  onDownload,
}) => {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [lockColor, setLockColor] = useState<RevisionColor>('Blue');

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      if (canHover()) firstFieldRef.current?.focus();
    }, 60);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      returnFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open || prefersReducedMotion()) return;
    if (backdropRef.current) {
      gsap.fromTo(backdropRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power3.out' });
    }
    if (dialogRef.current) {
      gsap.fromTo(
        dialogRef.current,
        { opacity: 0, scale: 0.97, y: 10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.24, ease: 'power3.out' }
      );
    }
  }, [open]);

  // Suggest the next color in the standard order once a draft is locked
  useEffect(() => {
    if (!open || !doc.revisionBaseline) return;
    const idx = REVISION_COLORS.indexOf(doc.revisionBaseline.color);
    setLockColor(REVISION_COLORS[Math.min(idx + 1, REVISION_COLORS.length - 1)]);
  }, [open, doc.revisionBaseline]);

  const settings = resolveExportSettings(doc);
  const preview = useMemo(
    () => (open ? renderScreenplayHtml(doc, undefined, { preview: true }) : null),
    [open, doc]
  );

  if (!open || !preview) return null;

  const baseline = doc.revisionBaseline;
  const headerExample = settings.header ? fillTokens(settings.header, doc, 2) : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sp-export-title"
      style={{ zIndex: 'var(--z-modal)' }}
      className="no-print fixed inset-0 flex items-center justify-center p-4"
    >
      <div ref={backdropRef} onClick={onClose} className="fixed inset-0 bg-black/35 backdrop-blur-[2px]" />

      <div
        ref={dialogRef}
        style={{ backgroundColor: 'var(--bg-elevated)', boxShadow: 'var(--elevation-floating)' }}
        className="relative flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
          <div>
            <h2 id="sp-export-title" className="text-lg font-semibold tracking-[-0.01em] text-[var(--ink-1)]">
              Export screenplay
            </h2>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">
              Industry-standard pages: Courier 12, 54 lines a page.{' '}
              <span className="[font-variant-numeric:tabular-nums]">
                {preview.pageCount} {preview.pageCount === 1 ? 'page' : 'pages'}
              </span>
              {settings.titlePage ? ' plus title page' : ''}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export"
            className="relative -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--ink-3)] transition-[color,background-color] duration-150 ease-out before:absolute before:-inset-0.5 hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-hidden px-5 pb-5 sm:px-6 md:grid-cols-[320px_minmax(0,1fr)]">
          {/* Options */}
          <div className="focus-scroller min-h-0 space-y-5 overflow-y-auto pr-1">
            <section>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Header & footer
              </h3>
              <div className="space-y-2.5">
                <div>
                  <label htmlFor="sp-header" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                    Header <span className="font-normal text-[var(--ink-3)]">top left</span>
                  </label>
                  <input
                    ref={firstFieldRef}
                    id="sp-header"
                    type="text"
                    value={settings.header}
                    onChange={(e) => onChangeSettings({ header: e.target.value })}
                    placeholder="{title} - {revision}"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                    className={fieldClass}
                  />
                  {headerExample && (
                    <p className="mt-1 truncate font-mono text-[11px] text-[var(--ink-3)]">{headerExample}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="sp-footer" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                    Footer <span className="font-normal text-[var(--ink-3)]">centered</span>
                  </label>
                  <input
                    id="sp-footer"
                    type="text"
                    value={settings.footer}
                    onChange={(e) => onChangeSettings({ footer: e.target.value })}
                    placeholder="Confidential"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                    className={fieldClass}
                  />
                </div>
                <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
                  Placeholders: <code className="font-mono">{'{title}'}</code>{' '}
                  <code className="font-mono">{'{date}'}</code>{' '}
                  <code className="font-mono">{'{revision}'}</code>{' '}
                  <code className="font-mono">{'{page}'}</code>
                </p>
              </div>
            </section>

            <section className="divide-y divide-[var(--border-subtle)]">
              <h3 className="pb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Pages
              </h3>
              <Toggle
                id="sp-title-page"
                label="Title page"
                hint="Print the title page first (unnumbered)."
                checked={settings.titlePage}
                onChange={(v) => onChangeSettings({ titlePage: v })}
              />
              <Toggle
                id="sp-page-numbers"
                label="Page numbers"
                hint="Top right, starting on page 2. Page 1 is never numbered."
                checked={settings.pageNumbers}
                onChange={(v) => onChangeSettings({ pageNumbers: v })}
              />
              <Toggle
                id="sp-more"
                label="(MORE) and (CONT'D)"
                hint="When a speech breaks across pages: (MORE) at the bottom, NAME (CONT'D) on the next."
                checked={settings.moreContd}
                onChange={(v) => onChangeSettings({ moreContd: v })}
              />
              <Toggle
                id="sp-auto-contd"
                label="(CONT'D) for returning speakers"
                hint="Add (CONT'D) when a character speaks again after an action line in the same scene."
                checked={settings.autoContd}
                onChange={(v) => onChangeSettings({ autoContd: v })}
              />
              <Toggle
                id="sp-scene-numbers"
                label="Scene numbers"
                hint="Both margins of every scene heading. For shooting scripts, not spec scripts."
                checked={settings.sceneNumbers}
                onChange={(v) => onChangeSettings({ sceneNumbers: v })}
              />
            </section>

            <section>
              <h3 className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Revisions
              </h3>
              {baseline ? (
                <Toggle
                  id="sp-revisions"
                  label="Revision marks"
                  hint={`An asterisk beside every line changed since the ${baseline.color} draft was locked on ${new Date(baseline.lockedAt).toLocaleDateString()}.`}
                  checked={settings.revisionMarks}
                  onChange={(v) => onChangeSettings({ revisionMarks: v })}
                />
              ) : (
                <p className="py-1.5 text-xs leading-relaxed text-[var(--ink-3)]">
                  Lock this draft to start tracking changes. Later exports mark every changed line with an asterisk.
                </p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <label htmlFor="sp-rev-color" className="sr-only">
                  Revision color
                </label>
                <select
                  id="sp-rev-color"
                  value={lockColor}
                  onChange={(e) => setLockColor(e.target.value as RevisionColor)}
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                  className="h-9 min-w-0 flex-1 rounded-xl px-2.5 text-base text-[var(--ink-1)] focus:outline-none sm:text-[13px]"
                >
                  {REVISION_COLORS.map((color) => (
                    <option key={color} value={color}>
                      {color} revision
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onLockDraft(lockColor)}
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-[var(--ink-1)] transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bg-subtle-hover)] active:scale-[0.96]"
                >
                  <Lock className="size-3.5" />
                  {baseline ? 'Lock again' : 'Lock this draft'}
                </button>
              </div>
            </section>
          </div>

          {/* Live preview of the exact pages */}
          <div
            style={{ backgroundColor: '#E9E5DD' }}
            className="relative min-h-[50vh] overflow-hidden rounded-xl md:min-h-0"
          >
            <iframe
              title="Screenplay page preview"
              srcDoc={preview.html}
              className="absolute inset-0 size-full border-0"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={onDownload}
            style={{ backgroundColor: 'var(--bg-surface)' }}
            className="flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-medium text-[var(--ink-1)] transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bg-subtle-hover)] active:scale-[0.96]"
          >
            <Download className="size-3.5" />
            Download HTML
          </button>
          <button
            type="button"
            onClick={() => printHtml(renderScreenplayHtml(doc).html)}
            style={{ backgroundColor: 'var(--ink-1)', color: 'var(--bg-canvas)' }}
            className="flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-medium transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.96]"
          >
            <Printer className="size-3.5" />
            Print / Save as PDF
          </button>
        </div>
      </div>
    </div>
  );
};
