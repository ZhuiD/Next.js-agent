import { afterEach, describe, expect, test, vi } from 'vitest';
import { createMinIntervalLimiter } from '@/lib/rate-limit';

describe('createMinIntervalLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('runs the first job immediately and delays the next queued job', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);

    const limiter = createMinIntervalLimiter(1000);
    const startedAt: number[] = [];

    await expect(
      limiter(async () => {
        startedAt.push(Date.now());
        return 'first';
      }),
    ).resolves.toBe('first');

    const second = limiter(async () => {
      startedAt.push(Date.now());
      return 'second';
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(startedAt).toEqual([10_000]);

    await vi.advanceTimersByTimeAsync(1);
    await expect(second).resolves.toBe('second');

    expect(startedAt).toEqual([10_000, 11_000]);
  });

  test('releases the queue even if a job fails', async () => {
    const limiter = createMinIntervalLimiter(0);

    await expect(
      limiter(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await expect(limiter(async () => 'next job')).resolves.toBe('next job');
  });
});
