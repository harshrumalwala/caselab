import { useCallback, useEffect, useState } from 'react';

// The browser offers "install this app" once, early, with an event the page has to keep hold of. It is caught here, as soon as
// this file loads, so the Settings button still works when the person opens Settings long after the page started.
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let offered: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it for our own button instead of the browser's mini bar
    offered = e as InstallEvent;
    tell();
  });
  window.addEventListener('appinstalled', () => {
    offered = null;
    installed = true;
    tell();
  });
}

/** Already opened from the home screen or an installed window. */
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return installed || standalone || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Whether this browser can install CaseLab with one click, and how. Browsers that can't (Safari) get a how-to instead. */
export function useInstall(): { available: boolean; installedApp: boolean; install: () => Promise<void> } {
  const [, rerender] = useState(0);
  useEffect(() => {
    const update = () => rerender((n) => n + 1);
    listeners.add(update);
    return () => void listeners.delete(update);
  }, []);

  const install = useCallback(async () => {
    const event = offered;
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    offered = null; // an offer can be used once
    tell();
  }, []);

  return { available: offered !== null, installedApp: isInstalledApp(), install };
}
