import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Installable app support: registers the service worker, notices when a new
 * version is ready (without reloading in the middle of a scene), and keeps
 * the browser's install prompt for the Install app button.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let state = {
  updateReady: false,
  /** The browser offered an install prompt we can open from a button */
  canInstall: false,
  installed: false,
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

  setState({ installed: isInstalled() });
  // Not prevented, so Chrome on Android still shows its own install banner;
  // the saved event also powers the Install app button
  window.addEventListener('beforeinstallprompt', (event) => {
    installPrompt = event as BeforeInstallPromptEvent;
    setState({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    setState({ canInstall: false, installed: true });
  });
}

export const usePwa = () => useSyncExternalStore(subscribe, () => state);

/** Switches to the new version (local edits are already saved). */
export const applyUpdate = () => updateServiceWorker?.(true);
export const dismissUpdate = () => setState({ updateReady: false });

/** Opens the browser's install prompt; false when it can't (show the steps instead). */
export async function installApp(): Promise<boolean> {
  if (!installPrompt) return false;
  try {
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => undefined);
    installPrompt = null;
    setState({ canInstall: false, installed: choice?.outcome === 'accepted' || state.installed });
    return true;
  } catch {
    installPrompt = null;
    setState({ canInstall: false });
    return false;
  }
}

/** Already running as an installed app. */
export const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhone and iPad install from Safari's Share menu; there's no install prompt. */
export const isIosBrowser = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export type InstallPlatform = 'ios' | 'android' | 'chromium' | 'mac-safari' | 'firefox' | 'other';

/** Which install steps to show for this browser. */
export function installPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  if (isIosBrowser()) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Edg\/|Chrome\/|Chromium\//.test(ua)) return 'chromium';
  if (/Macintosh/.test(ua) && /Safari\//.test(ua)) return 'mac-safari';
  return 'other';
}
