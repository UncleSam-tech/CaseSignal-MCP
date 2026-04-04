import { Queue, type JobsOptions } from 'bullmq';
import { getRedisClient } from '../cache/redis.js';

export type FetchJobData = {
  entityKey: string;
  toolName: string;
  params: Record<string, unknown>;
  requestedAt: string;
};

let fetchQueue: Queue<FetchJobData> | null = null;

function getQueue(): Queue<FetchJobData> {
  if (!fetchQueue) {
    fetchQueue = new Queue<FetchJobData>('cs-fetch', {
      connection: getRedisClient(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return fetchQueue;
}

export async function enqueueFetch(
  data: FetchJobData,
  opts?: JobsOptions
): Promise<string> {
  const jobId = `${data.entityKey}:${data.toolName}`;
  const job = await getQueue().add(jobId, data, { jobId, ...opts });
  return job.id ?? jobId;
}

export async function closeFetchQueue(): Promise<void> {
  if (fetchQueue) {
    await fetchQueue.close();
    fetchQueue = null;
  }
}
