import { createContext, useContext } from 'react';
import type { CaseInput } from '../domain/types';
import type { Route } from './route';

export interface UIContextValue {
  route: Route;
  /** The member being viewed on the People screen, if any. */
  routeParam: string | undefined;
  navigate(route: Route, param?: string): void;
  /** Open the Log Case form, optionally pre-filling a few fields (e.g. a suggested case type). */
  openLogCase(prefill?: Partial<CaseInput>): void;
  editCase(id: string): void;
  viewCase(id: string): void;
  openSettings(): void;
  /** Import a case log from an Excel file shaped like the MCG template. */
  openImport(): void;
  /** Profile & privacy settings. */
  openProfile(): void;
  /** Profile & privacy, scrolled to the cases and books you've burned. */
  openBurned(): void;
  /** The list of keyboard shortcuts. */
  openShortcuts(): void;
}

export const UIContext = createContext<UIContextValue | null>(null);

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside the app shell');
  return ctx;
}
