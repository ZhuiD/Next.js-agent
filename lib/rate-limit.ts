/**
 * 进程内的最小间隔节流器：把所有调用串行化，确保两次调用之间至少间隔 `minIntervalMs`。
 * 首次调用立即执行，后续调用按序排队等待。
 *
 * 用途：S2 / arXiv 这类共享配额的外部 API，必须遵守"每秒不超过 N 次"的约束，
 * 否则在 serverless / agent 多步连续调用场景下很容易打爆配额。
 */
export function createMinIntervalLimiter(minIntervalMs: number) {
  let chain: Promise<void> = Promise.resolve();
  let lastFinishedAt = 0;

  return async function schedule<T>(fn: () => Promise<T>): Promise<T> {
    const prev = chain;
    let release!: () => void;
    chain = new Promise<void>(r => (release = r));

    try {
      await prev;
      const waitMs = lastFinishedAt + minIntervalMs - Date.now();
      if (waitMs > 0) {
        await new Promise(r => setTimeout(r, waitMs));
      }
      const result = await fn();
      return result;
    } finally {
      lastFinishedAt = Date.now();
      release();
    }
  };
}
