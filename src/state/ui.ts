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
  /** Profile & privacy settings. */
  openProfile(): void;
}

export const UIContext = createContext<UIContextValue | null>(null);

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside the app shell');
  return ctx;
}
