import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { GAME_KEY } from './storageKeys';

interface GameValue {
  /** Whether levels, XP and rewards are shown. On unless this browser was told otherwise. */
  enabled: boolean;
  setEnabled: (on: boolean) => void;
}

const Ctx = createContext<GameValue>({ enabled: true, setEnabled: () => {} });

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(GAME_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** "Keep it simple": one switch that hides every level, XP number and reward. It is a preference of this browser, nothing is stored on the account. */
export function GameProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(readEnabled);
  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    try {
      if (on) window.localStorage.removeItem(GAME_KEY);
      else window.localStorage.setItem(GAME_KEY, 'off');
    } catch {
      /* the choice lasts for this visit only */
    }
  }, []);
  const value = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useGame = () => useContext(Ctx);
