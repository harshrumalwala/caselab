import { beforeEach, describe, expect, it } from 'vitest';
import { rememberImportIntent, takeImportIntent } from './afterSignup';

beforeEach(() => window.localStorage.clear());

describe('after sign-up', () => {
  it('remembers the wish to import and hands it over exactly once', () => {
    expect(takeImportIntent()).toBe(false);
    rememberImportIntent();
    expect(takeImportIntent()).toBe(true);
    expect(takeImportIntent()).toBe(false);
  });

  it('lets a stale wish go: three days is enough to confirm an email', () => {
    const day = 24 * 60 * 60 * 1000;
    rememberImportIntent(1_000_000);
    expect(takeImportIntent(1_000_000 + 4 * day)).toBe(false);
    rememberImportIntent(1_000_000);
    expect(takeImportIntent(1_000_000 + 2 * day)).toBe(true);
  });

  it('ignores damaged storage instead of breaking', () => {
    window.localStorage.setItem('caselab:v1:after-signup', '{not json');
    expect(takeImportIntent()).toBe(false);
    window.localStorage.setItem('caselab:v1:after-signup', '"yes"');
    expect(takeImportIntent()).toBe(false);
  });
});
