export type EntityType = 'company' | 'person' | 'auto';

export type NormalizedName = {
  canonical: string;
  tokens: string[];
  entityType: EntityType;
  suffixesStripped: string[];
  detectedType: 'company' | 'person';
};

const COMPANY_SUFFIXES = [
  'incorporated',
  'inc',
  'corporation',
  'corp',
  'limited',
  'ltd',
  'llc',
  'llp',
  'lp',
  'plc',
  'co',
  'company',
  'group',
  'holdings',
  'holding',
  'enterprises',
  'enterprise',
  'international',
  'intl',
  'partners',
  'associates',
  'solutions',
  'technologies',
  'technology',
  'tech',
  'services',
  'systems',
  'global',
  'na',           // n.a.
  'pc',           // p.c.
  'sa',           // s.a.
] as const;

const PERSON_INDICATORS = ['jr', 'sr', 'ii', 'iii', 'iv', 'esq', 'md', 'phd', 'dds'] as const;

function stripPunctuation(s: string): string {
  // Remove dots from abbreviations (I.B.M. → ibm), collapse remaining non-alnum to space
  return s.replace(/\./g, '').replace(/[^a-z0-9 ]/g, ' ');
}

function tokenize(s: string): string[] {
  return s.split(/\s+/).filter((t) => t.length > 0);
}

function detectEntityType(tokens: string[]): 'company' | 'person' {
  const suffixSet = new Set(COMPANY_SUFFIXES as readonly string[]);
  for (const token of tokens) {
    if (suffixSet.has(token)) return 'company';
  }
  // Heuristic: 2 tokens often means person (first last), but not always reliable
  return tokens.length === 2 ? 'person' : 'company';
}

function normalizeCompany(tokens: string[]): { canonical: string; stripped: string[] } {
  const suffixSet = new Set(COMPANY_SUFFIXES as readonly string[]);
  const stripped: string[] = [];
  let end = tokens.length;

  // Strip trailing suffixes (may be multiple: "Corp., Inc.")
  while (end > 0) {
    const last = tokens[end - 1];
    if (last !== undefined && suffixSet.has(last)) {
      stripped.push(last);
      end--;
    } else {
      break;
    }
  }

  const core = tokens.slice(0, end);
  return { canonical: core.join(' '), stripped };
}

function normalizePerson(tokens: string[]): { canonical: string; stripped: string[] } {
  const personSuffixSet = new Set(PERSON_INDICATORS as readonly string[]);
  const stripped: string[] = [];

  // Remove known person suffixes at end
  let filtered = [...tokens];
  while (filtered.length > 0) {
    const last = filtered[filtered.length - 1];
    if (last !== undefined && personSuffixSet.has(last)) {
      stripped.push(last);
      filtered = filtered.slice(0, -1);
    } else {
      break;
    }
  }

  // CourtListener convention: "last, first [middle]"
  if (filtered.length >= 2) {
    const last = filtered[filtered.length - 1];
    const first = filtered.slice(0, -1).join(' ');
    return { canonical: `${last}, ${first}`, stripped };
  }

  return { canonical: filtered.join(' '), stripped };
}

export function normalizeName(raw: string, entityType: EntityType = 'auto'): NormalizedName {
  // Step 1: Unicode normalization + lowercase
  const unicode = raw.normalize('NFKC').toLowerCase();

  // Step 2: Strip punctuation
  const noPunct = stripPunctuation(unicode);

  // Step 3: Normalize whitespace
  const clean = noPunct.trim().replace(/\s+/g, ' ');

  // Step 4: Tokenize
  const tokens = tokenize(clean);

  // Step 5: Detect type if auto
  const detectedType = entityType === 'auto' ? detectEntityType(tokens) : entityType;
  const resolvedType = entityType === 'auto' ? detectedType : entityType;

  // Step 6: Normalize by type
  const { canonical, stripped } =
    resolvedType === 'person' ? normalizePerson(tokens) : normalizeCompany(tokens);

  return {
    canonical: canonical || clean,
    tokens: tokenize(canonical || clean),
    entityType,
    suffixesStripped: stripped,
    detectedType,
  };
}
