import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { applyUpdate, dismissUpdate, usePwa } from '../pwa';

/** A new version of Focus has downloaded; the writer chooses when to switch. */
export const UpdateToast: React.FC = () => {
  const { updateReady } = usePwa();
  if (!updateReady) return null;
  return (
    <div
      role="status"
      style={{
        zIndex: 'var(--z-toast)',
        backgroundColor: 'var(--bg-elevated)',
        boxShadow: 'var(--elevation-floating)',
        top: 'calc(env(safe-area-inset-top, 0px) + 4.25rem)',
      }}
      className="no-print fixed left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full py-1.5 pl-4 pr-1.5 text-xs text-[var(--ink-2)]"
    >
      <span className="whitespace-nowrap">A new version of Focus is ready.</span>
      <button
        type="button"
        onClick={() => void applyUpdate()}
        style={{ backgroundColor: 'var(--ink-1)', color: 'var(--bg-canvas)' }}
        className="flex h-7 items-center gap-1.5 rounded-full px-3 font-medium transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.96]"
      >
        <RefreshCw className="size-3.5" />
        Reload
      </button>
      <button
        type="button"
        onClick={dismissUpdate}
        aria-label="Later"
        className="relative flex size-7 items-center justify-center rounded-full text-[var(--ink-3)] transition-colors before:absolute before:-inset-1 hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
};
