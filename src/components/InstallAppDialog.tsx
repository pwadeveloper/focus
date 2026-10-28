import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { MonitorDown, Share, X } from 'lucide-react';
import { installApp, installPlatform, usePwa, type InstallPlatform } from '../pwa';
import { prefersReducedMotion } from '../motion';

interface InstallAppDialogProps {
  open: boolean;
  onClose: () => void;
}

const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="font-medium text-[var(--ink-1)]">{children}</span>
);

const inlineIcon = 'mx-0.5 inline size-3.5 -translate-y-px text-[var(--ink-1)]';

function steps(platform: InstallPlatform, host: string): { device: string; steps: React.ReactNode[]; note?: string } {
  switch (platform) {
    case 'ios':
      return {
        device: 'iPhone or iPad',
        steps: [
          <>Open Focus in <Key>Safari</Key>. On iOS 16.4 or later, Chrome and Edge work too.</>,
          <>
            Tap the <Key>Share</Key> button <Share className={inlineIcon} /> (at the bottom of the screen on iPhone,
            at the top on iPad).
          </>,
          <>Scroll down, tap <Key>Add to Home Screen</Key>, then <Key>Add</Key>.</>,
        ],
        note: 'Apple doesn’t let websites show an install prompt, so this is the way on iPhone and iPad.',
      };
    case 'android':
      return {
        device: 'Android',
        steps: [
          <>Tap the <Key>⋮</Key> menu at the top right of Chrome.</>,
          <>Tap <Key>Install app</Key> (or <Key>Add to Home screen</Key>), then <Key>Install</Key>.</>,
        ],
        note: 'Chrome may also offer it in a banner at the bottom of the screen once you’ve used Focus for a moment.',
      };
    case 'chromium':
      return {
        device: 'this computer',
        steps: [
          <>
            Click the install icon <MonitorDown className={inlineIcon} /> at the right end of the address bar, then{' '}
            <Key>Install</Key>.
          </>,
          <>
            No icon? In Chrome, open <Key>⋮ → Cast, save and share → Install page as app</Key>. In Edge, open{' '}
            <Key>⋯ → Apps → Install this site as an app</Key>.
          </>,
        ],
      };
    case 'mac-safari':
      return {
        device: 'this Mac',
        steps: [
          <>In the menu bar, choose <Key>File → Add to Dock</Key>.</>,
          <>Click <Key>Add</Key>. This needs macOS Sonoma or later.</>,
        ],
      };
    case 'firefox':
      return {
        device: 'this computer',
        steps: [
          <>
            Firefox on computers can’t install web apps. Open <Key>{host}</Key> in Chrome, Edge or Safari and install
            it from there.
          </>,
        ],
      };
    default:
      return {
        device: 'this device',
        steps: [<>Look in your browser’s menu for <Key>Install app</Key> or <Key>Add to Home Screen</Key>.</>],
      };
  }
}

const OTHER_DEVICES: { device: string; how: string }[] = [
  { device: 'iPhone and iPad', how: 'Safari → Share → Add to Home Screen' },
  { device: 'Android', how: 'Chrome → ⋮ menu → Install app' },
  { device: 'Windows, Mac, Chromebook', how: 'Chrome or Edge → install icon in the address bar' },
  { device: 'Mac with Safari', how: 'File → Add to Dock' },
];

/** How to install Focus as an app on this device (and the others). */
export const InstallAppDialog: React.FC<InstallAppDialogProps> = ({ open, onClose }) => {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const { canInstall } = usePwa();

  useEffect(() => {
    if (!open) return;
    const returnFocus = document.activeElement as HTMLElement | null;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      returnFocus?.focus?.({ preventScroll: true });
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

  if (!open) return null;

  const platform = installPlatform();
  const guide = steps(platform, window.location.host);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-title"
      style={{ zIndex: 'var(--z-modal)' }}
      className="no-print fixed inset-0 flex items-center justify-center p-4"
    >
      <div ref={backdropRef} onClick={onClose} className="fixed inset-0 bg-black/35 backdrop-blur-[2px]" />
      <div
        ref={dialogRef}
        style={{ backgroundColor: 'var(--bg-elevated)', boxShadow: 'var(--elevation-floating)' }}
        className="focus-scroller relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
          <div>
            <h2 id="install-title" className="text-lg font-semibold tracking-[-0.01em] text-[var(--ink-1)]">
              Install Focus as an app
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">
              It opens in its own window from your home screen or dock, and works offline.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="relative -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--ink-3)] transition-[color,background-color] duration-150 ease-out before:absolute before:-inset-0.5 hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 pb-5 sm:px-6">
          {canInstall && (
            <button
              type="button"
              onClick={() => {
                void installApp().then((opened) => {
                  if (opened) onClose();
                });
              }}
              style={{ backgroundColor: 'var(--ink-1)', color: 'var(--bg-canvas)' }}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-full px-5 text-[13px] font-medium transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.96]"
            >
              <MonitorDown className="size-4" />
              Install Focus
            </button>
          )}

          <section>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
              {canInstall ? 'Or, on ' : 'On '}
              {guide.device}
            </h3>
            <ol className="space-y-2">
              {guide.steps.map((step, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-[var(--ink-2)]">
                  <span
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                    className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-[var(--ink-1)] [font-variant-numeric:tabular-nums]"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">{step}</span>
                </li>
              ))}
            </ol>
            {guide.note && <p className="mt-2.5 text-xs leading-relaxed text-[var(--ink-3)]">{guide.note}</p>}
          </section>

          <details className="group border-t border-[var(--border-subtle)] pt-3">
            <summary className="cursor-pointer list-none text-xs font-medium text-[var(--ink-2)] transition-colors hover:text-[var(--ink-1)]">
              Installing on another device
            </summary>
            <dl className="mt-2.5 space-y-1.5">
              {OTHER_DEVICES.map((row) => (
                <div key={row.device} className="text-xs leading-relaxed">
                  <dt className="inline font-medium text-[var(--ink-1)]">{row.device}: </dt>
                  <dd className="inline text-[var(--ink-2)]">{row.how}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </div>
    </div>
  );
};
