export function toISOStringUTC(d: Date): string {
  return d.toISOString();
}

export function snapshotAgeSeconds(generatedAt: string): number {
  return Math.floor((Date.now() - new Date(generatedAt).getTime()) / 1000);
}

export function isStale(generatedAt: string, ttlSeconds: number): boolean {
  return snapshotAgeSeconds(generatedAt) > ttlSeconds;
}

/** Parse a CourtListener YYYY-MM-DD date string into a Date (UTC midnight). Returns null for null/empty input. */
export function parseCLDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

export function nowISO(): string {
  return new Date().toISOString();
}
