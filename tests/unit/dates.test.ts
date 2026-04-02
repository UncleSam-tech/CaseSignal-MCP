import { describe, it, expect } from 'vitest';
import { snapshotAgeSeconds, isStale, parseCLDate, nowISO } from '../../src/utils/dates.js';

describe('snapshotAgeSeconds', () => {
  it('returns 0 for current time', () => {
    const age = snapshotAgeSeconds(new Date().toISOString());
    expect(age).toBeLessThan(2);
  });

  it('returns correct age for 1 hour ago', () => {
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const age = snapshotAgeSeconds(oneHourAgo);
    expect(age).toBeGreaterThanOrEqual(3598);
    expect(age).toBeLessThanOrEqual(3602);
  });
});

describe('isStale', () => {
  it('returns false for fresh snapshot', () => {
    expect(isStale(new Date().toISOString(), 3600)).toBe(false);
  });

  it('returns true for stale snapshot', () => {
    const old = new Date(Date.now() - 7200_000).toISOString();
    expect(isStale(old, 3600)).toBe(true);
  });
});

describe('parseCLDate', () => {
  it('parses YYYY-MM-DD format', () => {
    const d = parseCLDate('2024-01-15');
    expect(d?.getUTCFullYear()).toBe(2024);
    expect(d?.getUTCMonth()).toBe(0);
    expect(d?.getUTCDate()).toBe(15);
  });

  it('returns null for null input', () => {
    expect(parseCLDate(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCLDate('')).toBeNull();
  });

  it('returns null for invalid format', () => {
    expect(parseCLDate('not-a-date')).toBeNull();
  });
});

describe('nowISO', () => {
  it('returns a valid ISO date string', () => {
    const result = nowISO();
    expect(() => new Date(result)).not.toThrow();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
