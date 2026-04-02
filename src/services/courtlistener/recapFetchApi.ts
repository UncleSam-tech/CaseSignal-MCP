import env from '../../config/env.js';
import { ExternalApiError } from '../../utils/errors.js';
import { enqueueFetch } from '../queues/fetchQueue.js';
import logger from '../../utils/logger.js';
import type { CLFetchJob } from './types.js';

async function clPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = `${env.COURTLISTENER_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${env.COURTLISTENER_API_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new ExternalApiError(
      `CourtListener RECAP fetch returned ${res.status}`,
      'courtlistener',
      res.status
    );
  }
  return (await res.json()) as T;
}

async function pollFetchJob(jobId: number, maxWaitMs = 20000): Promise<CLFetchJob> {
  const startAt = Date.now();
  const pollInterval = 1500;

  while (Date.now() - startAt < maxWaitMs) {
    const job = await clPost<CLFetchJob>(`/recap-fetch/${jobId}/`, {});
    if (job.status === 'SUCCESSFUL' || job.status === 'FAILED') return job;
    await new Promise<void>((r) => setTimeout(r, pollInterval));
  }

  // Timed out — return last known state
  const url = `${env.COURTLISTENER_BASE_URL}/recap-fetch/${jobId}/`;
  const res = await fetch(url, {
    headers: { Authorization: `Token ${env.COURTLISTENER_API_TOKEN}` },
  });
  return (await res.json()) as CLFetchJob;
}

/**
 * Attempt a RECAP/PACER fetch for a stale docket.
 * Non-blocking: enqueues a background job and returns immediately if PACER credentials
 * are not configured. When credentials are present, polls up to 20s before giving up.
 */
export async function fetchStaleDocket(params: {
  docketId: number;
  courtId: string;
  entityKey: string;
  toolName: string;
}): Promise<{ triggered: boolean; jobId?: number }> {
  if (!env.PACER_USERNAME || !env.PACER_PASSWORD) {
    logger.debug('RECAP fetch skipped — PACER credentials not configured');
    return { triggered: false };
  }

  if (!env.ENABLE_FETCH_FALLBACK) {
    return { triggered: false };
  }

  try {
    const job = await clPost<CLFetchJob>('/recap-fetch/', {
      request_type: 2, // DOCKET
      pacer_case_id: String(params.docketId),
      court_id: params.courtId,
      show_parties_and_counsel: true,
      show_terminated_parties: true,
    });

    // Enqueue background job to watch completion and refresh snapshot
    await enqueueFetch({
      entityKey: params.entityKey,
      toolName: params.toolName,
      params: { recapFetchJobId: job.id, docketId: params.docketId },
      requestedAt: new Date().toISOString(),
    });

    return { triggered: true, jobId: job.id };
  } catch (err) {
    logger.warn('RECAP fetch trigger failed', { err, docketId: params.docketId });
    return { triggered: false };
  }
}
