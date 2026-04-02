import type { FieldOrigin } from '../../schemas/shared/fieldOrigin.js';
import type {
  CLDocket,
  CLParty,
  CLAttorney,
  CLDocketEntry,
  CLSearchHit,
} from './types.js';
import { parseCLDate } from '../../utils/dates.js';

/** Internal domain types — these cross service boundaries */

export type InternalDocket = {
  caseId: string;
  docketId: number;
  caseNumber: string;
  caseName: string;
  courtId: string;
  courtName: string;
  filedDate: string | null;
  terminatedDate: string | null;
  isOpen: boolean;
  judge: string | null;
  judgeOrigin: FieldOrigin;
  natureOfSuit: string | null;
  sourceUpdatedAt: string;
};

export type InternalParty = {
  name: string;
  role: string;
  isTerminated: boolean;
  origin: FieldOrigin;
};

export type InternalAttorney = {
  name: string;
  firm: string | null;
  party: string | null;
  origin: FieldOrigin;
};

export type InternalEntry = {
  entryNumber: number | null;
  dateFiled: string | null;
  description: string;
  documentCount: number;
  origin: FieldOrigin;
};

export type InternalDocketSummary = {
  caseId: string;
  docketId: number;
  caseNumber: string;
  caseName: string;
  courtId: string;
  courtName: string;
  filedDate: string | null;
  terminatedDate: string | null;
  isOpen: boolean;
  searchScore: number;
};

export function transformDocket(raw: CLDocket): InternalDocket {
  return {
    caseId: String(raw.id),
    docketId: raw.id,
    caseNumber: raw.docket_number,
    caseName: raw.case_name || raw.case_name_short || 'Unknown',
    courtId: raw.court_id,
    courtName: raw.court,
    filedDate: raw.date_filed ?? null,
    terminatedDate: raw.date_terminated ?? null,
    isOpen: raw.date_terminated === null,
    judge: raw.assigned_to_str ?? null,
    judgeOrigin: raw.assigned_to_str ? 'observed' : 'unknown',
    natureOfSuit: raw.nature_of_suit ?? null,
    sourceUpdatedAt: raw.date_modified,
  };
}

export function transformParty(raw: CLParty, partyIndex = 0): InternalParty {
  return {
    name: raw.name,
    role: raw.type ?? (partyIndex === 0 ? 'plaintiff' : 'defendant'),
    isTerminated: raw.date_terminated !== null,
    origin: raw.type ? 'observed' : 'normalized',
  };
}

export function transformAttorney(raw: CLAttorney, partyName: string | null): InternalAttorney {
  const firmMatch = raw.contact_raw.match(/([A-Z][^,\n]{3,50}(?:LLP|LLC|PA|PC|PLLC))/);
  return {
    name: raw.name,
    firm: firmMatch?.[1] ?? null,
    party: partyName,
    origin: 'observed',
  };
}

export function transformDocketEntry(raw: CLDocketEntry): InternalEntry {
  return {
    entryNumber: raw.entry_number,
    dateFiled: raw.date_filed,
    description: raw.description || '(no description)',
    documentCount: raw.recap_documents.length,
    origin: 'observed',
  };
}

export function transformSearchHit(raw: CLSearchHit): InternalDocketSummary {
  return {
    caseId: String(raw.docket_id),
    docketId: raw.docket_id,
    caseNumber: raw.docketNumber,
    caseName: raw.caseName,
    courtId: raw.court_id,
    courtName: raw.court,
    filedDate: raw.dateFiled ?? null,
    terminatedDate: raw.dateTerminated ?? null,
    isOpen: raw.dateTerminated === null,
    searchScore: raw.score,
  };
}

/** Classify a docket entry description into an update type */
export function classifyEntryType(
  description: string
): 'filing' | 'order' | 'judgment' | 'hearing' | 'settlement' | 'other' {
  const d = description.toLowerCase();
  if (d.includes('judgment') || d.includes('verdict')) return 'judgment';
  if (d.includes('settlement') || d.includes('stipulation of dismissal')) return 'settlement';
  if (d.includes('order') || d.includes('opinion')) return 'order';
  if (d.includes('hearing') || d.includes('conference') || d.includes('trial')) return 'hearing';
  if (d.includes('complaint') || d.includes('motion') || d.includes('brief')) return 'filing';
  return 'other';
}
