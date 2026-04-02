import pg from 'pg';
import { config } from 'dotenv';

config();

type AliasRecord = {
  canonical_name: string;
  alias: string;
  alias_type: string;
  confidence: number;
};

const SUFFIX_VARIANTS: Array<[string, string]> = [
  ['incorporated', 'inc'],
  ['corporation', 'corp'],
  ['limited', 'ltd'],
  ['company', 'co'],
  ['international', 'intl'],
  ['technologies', 'tech'],
  ['l.l.c.', 'llc'],
  ['l.l.p.', 'llp'],
  ['p.c.', 'pc'],
  ['s.a.', 'sa'],
];

function buildSuffixAliases(): AliasRecord[] {
  const records: AliasRecord[] = [];
  for (const [full, abbr] of SUFFIX_VARIANTS) {
    records.push({
      canonical_name: abbr,
      alias: full,
      alias_type: 'suffix_variant',
      confidence: 0.95,
    });
    records.push({
      canonical_name: full,
      alias: abbr,
      alias_type: 'suffix_variant',
      confidence: 0.95,
    });
  }
  return records;
}

async function run(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env['DATABASE_URL'] });

  try {
    const aliases = buildSuffixAliases();
    let inserted = 0;

    for (const alias of aliases) {
      await pool.query(
        `INSERT INTO entity_aliases (canonical_name, alias, alias_type, confidence)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (canonical_name, alias) DO NOTHING`,
        [alias.canonical_name, alias.alias, alias.alias_type, alias.confidence]
      );
      inserted++;
    }

    console.log(`Seeded ${inserted} alias records.`);
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
