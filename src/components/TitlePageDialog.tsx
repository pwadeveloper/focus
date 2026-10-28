import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { X } from 'lucide-react';
import { DocumentItem, TitlePage } from '../types';
import { DEFAULT_TITLE_PAGE_CREDIT } from '../editorUtils';
import { canHover, prefersReducedMotion } from '../motion';

interface TitlePageDialogProps {
  open: boolean;
  doc: DocumentItem;
  onClose: () => void;
  onChangeTitle: (title: string) => void;
  onChangeTitlePage: (patch: Partial<TitlePage>) => void;
}

const CREDIT_OPTIONS = [
  'Written by',
  'Screenplay by',
  'Teleplay by',
  'Story by',
  'Created by',
];

const todayLabel = () =>
  new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

const fieldClass =
  'w-full rounded-xl px-3 text-base text-[var(--ink-1)] transition-[box-shadow,background-color] duration-150 ease-out placeholder:text-[var(--ink-4)] focus:bg-[var(--bg-elevated)] focus:shadow-[inset_0_0_0_1px_var(--border-strong)] focus:outline-none sm:text-[13px]';

const Field: React.FC<{
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}> = ({ id, label, hint, children, action }) => (
  <div>
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <label htmlFor={id} className="text-xs font-medium text-[var(--ink-2)]">
        {label}
        {hint && (
          <span className="ml-1.5 font-normal text-[var(--ink-3)]">{hint}</span>
        )}
      </label>
      {action}
    </div>
    {children}
  </div>
);

/** Renders multi-line field text with preserved line breaks. */
const Lines: React.FC<{ text?: string }> = ({ text }) => (
  <>
    {(text ?? '')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
  </>
);

/**
 * Screenplay title page editor with a live, to-scale page preview. Fields save
 * as you type, like the rest of the app, so closing never discards anything.
 */
export const TitlePageDialog: React.FC<TitlePageDialogProps> = ({
  open,
  doc,
  onClose,
  onChangeTitle,
  onChangeTitlePage,
}) => {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // Read the latest onClose without re-running the open effect: re-running
  // it on every keystroke would steal focus back to the first field
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
      gsap.fromTo(
        backdropRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.2, ease: 'power3.out' }
      );
    }
    if (dialogRef.current) {
      gsap.fromTo(
        dialogRef.current,
        { opacity: 0, scale: 0.97, y: 10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.24, ease: 'power3.out' }
      );
    }
  }, [open]);

  if (!open) return null;

  const tp = doc.titlePage ?? {};
  const credit = tp.credit ?? DEFAULT_TITLE_PAGE_CREDIT;
  const hasFooterLeft = Boolean(tp.contact?.trim() || tp.draftDate?.trim());
  const hasFooterRight = Boolean(tp.notes?.trim() || tp.copyright?.trim());

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="title-page-dialog-title"
      style={{ zIndex: 'var(--z-modal)' }}
      className="no-print fixed inset-0 flex items-center justify-center p-4"
    >
      <div
        ref={backdropRef}
        onClick={onClose}
        className="fixed inset-0 bg-black/35 backdrop-blur-[2px]"
      />

      <div
        ref={dialogRef}
        style={{
          backgroundColor: 'var(--bg-elevated)',
          boxShadow: 'var(--elevation-floating)',
        }}
        className="focus-scroller relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-y-auto rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5 sm:px-6">
          <div>
            <h2
              id="title-page-dialog-title"
              className="text-lg font-semibold tracking-[-0.01em] text-[var(--ink-1)]"
            >
              Title page
            </h2>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">
              The first page of your screenplay. Changes save as you type.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close title page"
            className="relative -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--ink-3)] transition-[color,background-color] duration-150 ease-out before:absolute before:-inset-0.5 hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-6 px-5 pb-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_300px]">
          {/* Fields */}
          <div className="space-y-3.5">
            <Field id="tp-title" label="Title">
              <input
                ref={firstFieldRef}
                id="tp-title"
                type="text"
                value={doc.title}
                onChange={(e) => onChangeTitle(e.target.value)}
                placeholder="NIGHT FREQUENCY"
                style={{ backgroundColor: 'var(--bg-surface)' }}
                className={`${fieldClass} h-10`}
              />
            </Field>

            <Field id="tp-episode" label="Episode title" hint="TV only">
              <input
                id="tp-episode"
                type="text"
                value={tp.episode ?? ''}
                onChange={(e) => onChangeTitlePage({ episode: e.target.value })}
                placeholder="Burglar in the House"
                style={{ backgroundColor: 'var(--bg-surface)' }}
                className={`${fieldClass} h-10`}
              />
            </Field>

            <div className="grid gap-3.5 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <Field id="tp-credit" label="Credit">
                <input
                  id="tp-credit"
                  type="text"
                  list="tp-credit-options"
                  value={credit}
                  onChange={(e) => onChangeTitlePage({ credit: e.target.value })}
                  placeholder="Written by"
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                  className={`${fieldClass} h-10`}
                />
                <datalist id="tp-credit-options">
                  {CREDIT_OPTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </Field>
              <Field id="tp-author" label="Author">
                <input
                  id="tp-author"
                  type="text"
                  autoComplete="name"
                  value={tp.author ?? ''}
                  onChange={(e) => onChangeTitlePage({ author: e.target.value })}
                  placeholder="Your name"
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                  className={`${fieldClass} h-10`}
                />
              </Field>
            </div>

            <Field id="tp-source" label="Source" hint="optional">
              <input
                id="tp-source"
                type="text"
                value={tp.source ?? ''}
                onChange={(e) => onChangeTitlePage({ source: e.target.value })}
                placeholder="Based on the novel by…"
                style={{ backgroundColor: 'var(--bg-surface)' }}
                className={`${fieldClass} h-10`}
              />
            </Field>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field id="tp-contact" label="Contact" hint="lower left">
                <textarea
                  id="tp-contact"
                  rows={4}
                  value={tp.contact ?? ''}
                  onChange={(e) => onChangeTitlePage({ contact: e.target.value })}
                  placeholder={'Email\nPhone\nAgent or manager'}
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                  className={`${fieldClass} block resize-none py-2 leading-snug`}
                />
              </Field>
              <div className="space-y-3.5">
                <Field
                  id="tp-draft"
                  label="Draft date"
                  action={
                    <button
                      type="button"
                      onClick={() => onChangeTitlePage({ draftDate: todayLabel() })}
                      className="relative text-xs font-medium text-[var(--ink-2)] underline decoration-[var(--border-strong)] underline-offset-2 transition-colors before:absolute before:-inset-x-2 before:-inset-y-1.5 hover:text-[var(--ink-1)] hover:decoration-[var(--ink-1)]"
                    >
                      Today
                    </button>
                  }
                >
                  <input
                    id="tp-draft"
                    type="text"
                    value={tp.draftDate ?? ''}
                    onChange={(e) => onChangeTitlePage({ draftDate: e.target.value })}
                    placeholder="First draft, October 2026"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                    className={`${fieldClass} h-10`}
                  />
                </Field>
                <Field id="tp-copyright" label="Copyright" hint="optional">
                  <input
                    id="tp-copyright"
                    type="text"
                    value={tp.copyright ?? ''}
                    onChange={(e) => onChangeTitlePage({ copyright: e.target.value })}
                    placeholder="© 2026 / WGA Registered"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                    className={`${fieldClass} h-10`}
                  />
                </Field>
              </div>
            </div>

            <Field id="tp-notes" label="Notes" hint="optional, lower right">
              <input
                id="tp-notes"
                type="text"
                value={tp.notes ?? ''}
                onChange={(e) => onChangeTitlePage({ notes: e.target.value })}
                placeholder="Revised pages, production notes…"
                style={{ backgroundColor: 'var(--bg-surface)' }}
                className={`${fieldClass} h-10`}
              />
            </Field>
          </div>

          {/* Live page preview (US Letter proportions) */}
          <div className="md:pt-5">
            <div
              aria-label="Title page preview"
              role="img"
              style={{
                aspectRatio: '8.5 / 11',
                backgroundColor: '#FFFFFF',
                color: '#111111',
                boxShadow:
                  '0 0 0 1px rgb(17 17 17 / 0.08), 0 12px 32px -12px rgb(17 17 17 / 0.25)',
                fontFamily: '"Courier Prime", "Courier New", Courier, monospace',
              }}
              className="relative mx-auto flex w-full max-w-[300px] flex-col rounded-sm px-[11%] pb-[9%] pt-[30%] text-[9px] leading-[1.45]"
            >
              <div className="text-center">
                <p className="break-words font-bold uppercase underline underline-offset-2">
                  {doc.title.trim() || 'Untitled'}
                </p>
                {tp.episode?.trim() && (
                  <p className="mt-[1.1em] break-words">“{tp.episode.trim()}”</p>
                )}
                {credit.trim() && (
                  <p className="mt-[2.2em]">
                    <Lines text={credit} />
                  </p>
                )}
                {tp.author?.trim() && (
                  <p className="mt-[1.1em]">
                    <Lines text={tp.author} />
                  </p>
                )}
                {tp.source?.trim() && (
                  <p className="mt-[2.2em]">
                    <Lines text={tp.source} />
                  </p>
                )}
              </div>
              {(hasFooterLeft || hasFooterRight) && (
                <div className="mt-auto flex items-end justify-between gap-3 text-[8px]">
                  <p className="min-w-0 break-words">
                    <Lines text={tp.contact} />
                    {tp.contact?.trim() && tp.draftDate?.trim() && (
                      <span className="block h-[1em]" />
                    )}
                    <Lines text={tp.draftDate} />
                  </p>
                  <p className="min-w-0 break-words text-right">
                    <Lines text={tp.notes} />
                    {tp.notes?.trim() && tp.copyright?.trim() && (
                      <span className="block h-[1em]" />
                    )}
                    <Lines text={tp.copyright} />
                  </p>
                </div>
              )}
            </div>
            <p className="mt-2.5 text-center text-[11px] text-[var(--ink-3)]">
              Exported as the first page of your script
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-[var(--border-subtle)] px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            style={{ backgroundColor: 'var(--ink-1)', color: 'var(--bg-canvas)' }}
            className="h-9 rounded-full px-5 text-xs font-medium transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.96]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
