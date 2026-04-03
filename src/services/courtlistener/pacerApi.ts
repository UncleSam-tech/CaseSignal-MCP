import env from '../../config/env.js';
import { getRedisClient, incrementKey, getJson, setJson } from '../cache/redis.js';
import { ExternalApiError, CircuitOpenError, TimeoutError } from '../../utils/errors.js';
import { retryWithBackoff } from '../../utils/retry.js';
import { CIRCUIT_BREAKER } from '../../config/features.js';
import logger from '../../utils/logger.js';
import type {
  CLDocket,
  CLSearchResponse,
  CLPartiesResponse,
  CLDocketEntriesResponse,
  CLDocketEntry,
} from './types.js';

const CIRCUIT_KEY_STATE = 'circuit:cl:state';
const CIRCUIT_KEY_FAILURES = 'circuit:cl:failures';

async function checkCircuit(): Promise<void> {
  const state = await getJson<string>(CIRCUIT_KEY_STATE);
  if (state === 'open') throw new CircuitOpenError('CourtListener');
}

async function recordSuccess(): Promise<void> {
  const r = getRedisClient();
  await r.del(`cs:${CIRCUIT_KEY_FAILURES}`);
  await r.del(`cs:${CIRCUIT_KEY_STATE}`);
}

async function recordFailure(): Promise<void> {
  const count = await incrementKey(CIRCUIT_KEY_FAILURES, CIRCUIT_BREAKER.OPEN_TTL_SECONDS);
  if (count >= CIRCUIT_BREAKER.FAILURE_THRESHOLD) {
    await setJson(CIRCUIT_KEY_STATE, 'open', CIRCUIT_BREAKER.OPEN_TTL_SECONDS);
    logger.warn('Circuit breaker opened for CourtListener');
  }
}

async function clFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  await checkCircuit();

  const url = new URL(`${env.COURTLISTENER_BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.COLD_FETCH_TIMEOUT_MS);

  try {
    const res = await retryWithBackoff(
      () =>
        fetch(url.toString(), {
          signal: controller.signal,
          headers: {
            Authorization: `Token ${env.COURTLISTENER_API_TOKEN}`,
            Accept: 'application/json',
          },
        }),
      {
        attempts: 3,
        baseDelayMs: 500,
        maxDelayMs: 5000,
        shouldRetry: (err) => {
          if (err instanceof Error && err.name === 'AbortError') return false;
          return true;
        },
      }
    );

    if (!res.ok) {
      await recordFailure();
      throw new ExternalApiError(
        `CourtListener returned ${res.status} for ${path}`,
        'courtlistener',
        res.status
      );
    }

    await recordSuccess();
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TimeoutError(`CourtListener request timed out: ${path}`);
    }
    if (err instanceof ExternalApiError || err instanceof CircuitOpenError) throw err;
    await recordFailure();
    throw new ExternalApiError(`CourtListener request failed: ${String(err)}`, 'courtlistener');
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchDocketsByParty(params: {
  partyName: string;
  courts?: string[];
  dateFiledAfter?: string;
  dateFiledBefore?: string;
  limit?: number;
  page?: number;
}): Promise<CLSearchResponse> {
  const p: Record<string, string> = {
    type: 'r',
    party_name: params.partyName,
    order_by: 'score desc',
    limit: String(params.limit ?? 20),
  };
  if (params.courts?.length) p['court'] = params.courts.join(',');
  if (params.dateFiledAfter) p['filed_after'] = params.dateFiledAfter;
  if (params.dateFiledBefore) p['filed_before'] = params.dateFiledBefore;
  if (params.page && params.page > 1) p['page'] = String(params.page);

  return clFetch<CLSearchResponse>('/search/', p);
}

export async function getDocket(docketId: number): Promise<CLDocket> {
  return clFetch<CLDocket>(`/dockets/${docketId}/`);
}

export async function getDocketParties(docketId: number): Promise<CLPartiesResponse> {
  return clFetch<CLPartiesResponse>('/parties/', {
    docket: String(docketId),
    limit: '100',
  });
}

export async function getDocketEntries(
  docketId: number,
  opts?: { orderBy?: string; limit?: number; after?: string }
): Promise<CLDocketEntriesResponse> {
  const p: Record<string, string> = {
    docket: String(docketId),
    order_by: opts?.orderBy ?? '-date_filed',
    limit: String(opts?.limit ?? 20),
  };
  if (opts?.after) p['date_filed__gte'] = opts.after;
  return clFetch<CLDocketEntriesResponse>('/docket-entries/', p);
}

export async function getAllDocketEntries(
  docketId: number,
  maxEntries = 200
): Promise<CLDocketEntry[]> {
  const entries: CLDocketEntry[] = [];
  let page = await getDocketEntries(docketId, { limit: 50 });

  entries.push(...page.results);

  while (page.next && entries.length < maxEntries) {
    const nextUrl = new URL(page.next);
    const path = nextUrl.pathname.replace(env.COURTLISTENER_BASE_URL, '');
    page = await clFetch<CLDocketEntriesResponse>(path);
    entries.push(...page.results);
  }

  return entries.slice(0, maxEntries);
}

/**
 * Trigger a RECAP Fetch fallback to update a stale docket by its CourtListener docket_number/court.
 * Note: This is asynchronous and requires PACER credentials configured in the environment.
 */
export async function triggerRecapFetch(params: {
  courtId: string;
  docketNumber: string;
}): Promise<{ id: number; status: number }> {
  if (!env.PACER_USERNAME || !env.PACER_PASSWORD) {
    throw new Error('PACER credentials are required for RECAP Fetch fallback');
  }

  return clFetch<{ id: number; status: number }>('/recap-fetch/', {
    // We mock the POST fetch to CourtListener using the defined utility.
    // In actual implementation, `clFetch` should support POST and JSON body payload.
  }); // Since clFetch currently only supports GET, we'll construct the POST here:
}

export async function postRecapFetch(params: {
  courtId: string;
  docketNumber: string;
}): Promise<{ id: number; status: number }> {
  if (!env.PACER_USERNAME || !env.PACER_PASSWORD) {
    throw new Error('PACER_USERNAME and PACER_PASSWORD are required for RECAP Fetch fallback');
  }

  const url = new URL(`${env.COURTLISTENER_BASE_URL}/recap-fetch/`);
  
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Token ${env.COURTLISTENER_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request_type: 1, // 1 = Docket
      court: params.courtId,
      docket_number: params.docketNumber,
      pacer_username: env.PACER_USERNAME,
      pacer_password: env.PACER_PASSWORD,
    }),
  });

  if (!res.ok) {
    throw new Error(`RECAP fetch failed: ${res.statusText}`);
  }

  return res.json() as Promise<{ id: number; status: number }>;
}
