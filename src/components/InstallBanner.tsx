import React, { useEffect, useState } from 'react';
import { MonitorDown, X } from 'lucide-react';
import { isIosBrowser, usePwa } from '../pwa';

const DISMISSED_KEY = 'focus:install-dismissed';
const QUIET_DAYS = 30;
const DELAY_MS = 5000;

const recentlyDismissed = () => {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return at > 0 && Date.now() - at < QUIET_DAYS * 86400_000;
  } catch {
    return false;
  }
};

const rememberDismissed = () => {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // Ignore storage errors
  }
};

/**
 * A one-time suggestion to install Focus. iPhone and iPad never offer an
 * install prompt themselves, so without this nobody would know.
 */
export const InstallBanner: React.FC<{ hidden: boolean; onInstall: () => void }> = ({ hidden, onInstall }) => {
  const { installed, updateReady } = usePwa();
  const [due, setDue] = useState(false);
  const [dismissed, setDismissed] = useState(recentlyDismissed);

  useEffect(() => {
    const timer = window.setTimeout(() => setDue(true), DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!due || dismissed || installed || updateReady || hidden) return null;

  const dismiss = () => {
    rememberDismissed();
    setDismissed(true);
  };

  return (
    <div
      role="status"
      style={{
        zIndex: 'var(--z-toast)',
        backgroundColor: 'var(--bg-elevated)',
        boxShadow: 'var(--elevation-floating)',
        top: 'calc(env(safe-area-inset-top, 0px) + 4.25rem)',
      }}
      className="no-print fixed left-1/2 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-full py-1.5 pl-4 pr-1.5 text-xs text-[var(--ink-2)]"
    >
      <span className="min-w-0 truncate">
        {isIosBrowser() ? 'Add Focus to your Home Screen' : 'Install Focus as an app'}
      </span>
      <button
        type="button"
        onClick={() => {
          dismiss();
          onInstall();
        }}
        style={{ backgroundColor: 'var(--ink-1)', color: 'var(--bg-canvas)' }}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 font-medium transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.96]"
      >
        <MonitorDown className="size-3.5" />
        {isIosBrowser() ? 'How' : 'Install'}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="relative flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--ink-3)] transition-colors before:absolute before:-inset-1 hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
};
