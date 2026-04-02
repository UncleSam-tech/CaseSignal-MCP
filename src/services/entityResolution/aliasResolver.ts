import { query } from '../../db/client.js';
import type { NormalizedName } from './normalizeName.js';

export type AliasMatch = {
  canonical: string;
  confidence: number;
  aliasType: string;
};

type AliasRow = {
  canonical_name: string;
  alias: string;
  alias_type: string;
  confidence: string;
};

export async function resolveAliases(normalized: NormalizedName): Promise<AliasMatch[]> {
  const { canonical } = normalized;

  // Query for exact and prefix matches
  const result = await query<AliasRow>(
    `SELECT canonical_name, alias, alias_type, confidence
     FROM entity_aliases
     WHERE alias = $1 OR alias ILIKE $2
     ORDER BY confidence DESC
     LIMIT 20`,
    [canonical, `${canonical}%`]
  );

  if (result.rows.length === 0) {
    // No alias found — return direct match with default confidence
    return [{ canonical, confidence: 0.85, aliasType: 'direct' }];
  }

  const matches: AliasMatch[] = result.rows.map((row) => {
    const base = parseFloat(row.confidence);
    const isExact = row.alias.toLowerCase() === canonical.toLowerCase();
    const bonus = isExact ? 0.2 : 0.1;
    return {
      canonical: row.canonical_name,
      confidence: Math.min(1, base + bonus),
      aliasType: row.alias_type,
    };
  });

  // Always include the direct match as a fallback
  const hasDirect = matches.some((m) => m.canonical === canonical);
  if (!hasDirect) {
    matches.push({ canonical, confidence: 0.85, aliasType: 'direct' });
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}
