/** Raw CourtListener API response types — internal only, never leak to output */

export type CLDocket = {
  id: number;
  docket_number: string;
  case_name: string;
  case_name_short: string;
  court: string;
  court_id: string;
  date_filed: string | null;
  date_terminated: string | null;
  date_modified: string;
  assigned_to_str: string | null;
  referred_to_str: string | null;
  cause: string | null;
  nature_of_suit: string | null;
  jury_demand: string | null;
  jurisdiction_type: string | null;
  absolute_url: string;
};

export type CLParty = {
  id: number;
  name: string;
  type: string | null;
  date_terminated: string | null;
  attorneys: CLAttorney[];
};

export type CLAttorney = {
  id: number;
  name: string;
  contact_raw: string;
  roles: string[];
};

export type CLDocketEntry = {
  id: number;
  entry_number: number | null;
  date_filed: string | null;
  description: string;
  recap_documents: CLDocument[];
};

export type CLDocument = {
  id: number;
  document_number: string | null;
  description: string | null;
  is_available: boolean;
};

export type CLSearchHit = {
  id: string;
  docket_id: number;
  docketNumber: string;
  caseName: string;
  court_id: string;
  court: string;
  dateFiled: string | null;
  dateTerminated: string | null;
  dateArgued: string | null;
  suitNature: string | null;
  score: number;
};

export type CLSearchResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: CLSearchHit[];
};

export type CLPartiesResponse = {
  count: number;
  next: string | null;
  results: CLParty[];
};

export type CLDocketEntriesResponse = {
  count: number;
  next: string | null;
  results: CLDocketEntry[];
};

export type CLFetchJob = {
  id: number;
  status: 'ENQUEUED' | 'PROCESSING' | 'SUCCESSFUL' | 'FAILED';
  message: string | null;
};
