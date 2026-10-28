import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Installable app support: registers the service worker, notices when a new
 * version is ready (without reloading in the middle of a scene), and keeps
 * the browser's install prompt for an "Install Focus" button.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let state = {
  updateReady: false,
  canInstall: false,
};
let updateServiceWorker: ((reload?: boolean) => Promise<void>) | null = null;
let installPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const setState = (patch: Partial<typeof state>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function startPwa() {
  if (updateServiceWorker) return;
  updateServiceWorker = registerSW({
    onNeedRefresh: () => setState({ updateReady: true }),
    onRegisteredSW: (_url, registration) => {
      // Check for a new version every hour while Focus stays open
      if (registration) window.setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    },
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep it for the Install button instead of the browser's own banner
    event.preventDefault();
    installPrompt = event as BeforeInstallPromptEvent;
    setState({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    setState({ canInstall: false });
  });
}

export const usePwa = () => useSyncExternalStore(subscribe, () => state);

/** Switches to the new version (local edits are already saved). */
export const applyUpdate = () => updateServiceWorker?.(true);
export const dismissUpdate = () => setState({ updateReady: false });

export async function installApp() {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice.catch(() => undefined);
  installPrompt = null;
  setState({ canInstall: false });
}

/** Already running as an installed app. */
export const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhone and iPad install from Safari's Share menu; there's no install prompt. */
export const isIosBrowser = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
