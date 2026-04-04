import { Queue } from 'bullmq';
import { getRedisClient } from '../cache/redis.js';

export type RefreshJobData = {
  entityKey: string;
  toolName: string;
};

let refreshQueue: Queue<RefreshJobData> | null = null;

function getQueue(): Queue<RefreshJobData> {
  if (!refreshQueue) {
    refreshQueue = new Queue<RefreshJobData>('cs-refresh', {
      connection: getRedisClient(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return refreshQueue;
}

export async function enqueueRefresh(data: RefreshJobData, delayMs?: number): Promise<void> {
  const jobId = `refresh:${data.entityKey}:${data.toolName}`;
  const opts = delayMs !== undefined ? { jobId, delay: delayMs } : { jobId };
  await getQueue().add(jobId, data, opts);
}

export async function closeRefreshQueue(): Promise<void> {
  if (refreshQueue) {
    await refreshQueue.close();
    refreshQueue = null;
  }
}
