import { getDocket, getDocketParties, getDocketEntries } from '../courtlistener/pacerApi.js';
import {
  transformDocket,
  transformParty,
  transformAttorney,
  transformDocketEntry,
  classifyEntryType,
} from '../courtlistener/transforms.js';
import { scoreToband } from '../../config/features.js';
import type { GetCaseDigestOutput } from '../../schemas/output/getCaseDigest.js';
import type { Freshness } from '../../schemas/shared/freshness.js';
import type { ToolMeta } from '../../schemas/shared/meta.js';
import { snapshotAgeSeconds } from '../../utils/dates.js';

export async function buildCaseDigest(params: {
  docketId: number;
  maxRecentEntries: number;
  includeParties: boolean;
  includeCounsel: boolean;
  freshness: Freshness;
  meta: ToolMeta;
}): Promise<GetCaseDigestOutput> {
  const { docketId, maxRecentEntries, includeParties, includeCounsel, freshness, meta } = params;

  const [rawDocket, partiesRes, entriesRes] = await Promise.all([
    getDocket(docketId),
    includeParties ? getDocketParties(docketId) : Promise.resolve(null),
    getDocketEntries(docketId, { limit: maxRecentEntries }),
  ]);

  const docket = transformDocket(rawDocket);

  const parties = includeParties && partiesRes
    ? partiesRes.results.map((p, i) => transformParty(p, i))
    : [];

  const counsel: ReturnType<typeof transformAttorney>[] = [];
  if (includeCounsel && partiesRes) {
    for (const party of partiesRes.results) {
      for (const atty of party.attorneys) {
        counsel.push(transformAttorney(atty, party.name));
      }
    }
  }

  const entries = entriesRes.results.map(transformDocketEntry);

  const latestEntry = entries[0];
  const latestActivityDate = latestEntry?.dateFiled ?? null;
  const latestActivitySummary = latestEntry?.description
    ? latestEntry.description.slice(0, 200)
    : null;

  const posture = inferPosture(rawDocket.date_terminated, latestEntry?.description ?? null);

  const limitations: string[] = [];
  if (!partiesRes) limitations.push('Party information not requested');
  if (entriesRes.count > maxRecentEntries) {
    limitations.push(`Showing ${maxRecentEntries} of ${entriesRes.count} total docket entries`);
  }
  if (!rawDocket.assigned_to_str) limitations.push('Judge information unavailable in source');

  return {
    data: {
      caseId: docket.caseId,
      caseNumber: docket.caseNumber,
      caseName: docket.caseName,
      courtId: docket.courtId,
      courtName: docket.courtName,
      summary: buildSummaryText(docket, parties.length, entriesRes.count),
      currentPosture: posture.label,
      currentPostureOrigin: posture.origin,
      venue: docket.courtName,
      judge: docket.judge,
      judgeOrigin: docket.judgeOrigin,
      natureOfSuit: docket.natureOfSuit,
      filedDate: docket.filedDate,
      terminatedDate: docket.terminatedDate,
      isOpen: docket.isOpen,
      latestActivityDate,
      latestActivitySummary,
      recentEntries: entries.map((e) => ({
        entryNumber: e.entryNumber,
        dateFiled: e.dateFiled,
        description: e.description.slice(0, 500),
        documentCount: e.documentCount,
        origin: e.origin,
      })),
      deadlines: [], // Deadline extraction requires document analysis — future enhancement
      parties: parties.map((p) => ({ name: p.name, role: p.role, origin: p.origin })),
      counsel: counsel.map((c) => ({
        name: c.name,
        firm: c.firm,
        party: c.party,
        origin: c.origin,
      })),
      inferredFields: posture.origin === 'inferred' ? ['currentPosture'] : [],
      confidence: { score: 0.85, band: 'medium' },
      limitations,
    },
    freshness,
    _meta: meta,
  };
}

function inferPosture(
  terminatedDate: string | null,
  latestDescription: string | null
): { label: string; origin: 'observed' | 'inferred' } {
  if (terminatedDate) return { label: 'closed', origin: 'observed' };

  if (latestDescription) {
    const d = latestDescription.toLowerCase();
    if (d.includes('trial')) return { label: 'trial', origin: 'inferred' };
    if (d.includes('settlement') || d.includes('stipulation'))
      return { label: 'settlement discussions', origin: 'inferred' };
    if (d.includes('summary judgment'))
      return { label: 'summary judgment briefing', origin: 'inferred' };
    if (d.includes('discovery')) return { label: 'discovery', origin: 'inferred' };
    if (d.includes('motion to dismiss'))
      return { label: 'motion to dismiss briefing', origin: 'inferred' };
  }

  return { label: 'pending', origin: 'inferred' };
}

function buildSummaryText(
  docket: ReturnType<typeof transformDocket>,
  partyCount: number,
  entryCount: number
): string {
  const status = docket.isOpen ? 'active' : 'terminated';
  const filed = docket.filedDate ?? 'unknown date';
  return `${docket.caseName} — ${status} case in ${docket.courtName}, filed ${filed}. ${entryCount} docket entries recorded, ${partyCount} parties identified.`;
}
