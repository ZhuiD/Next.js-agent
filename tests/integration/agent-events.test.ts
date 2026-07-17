import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  cleanupDatabase,
  createTestUser,
  describeWithTestDatabase,
  explainSkippedIntegrationTests,
  hasTestDatabase,
} from './utils/db';
import type { prisma as prismaExport } from '@/lib/prisma';
import type * as agentEventsModule from '@/lib/agent-events';

let prisma: typeof prismaExport;
let agentEvents: typeof agentEventsModule;

async function createChatWithRequest(userId: string, suffix: string) {
  const chatId = `chat-${suffix}`;
  const requestMessageId = `message-${suffix}`;

  await prisma.chat.create({
    data: {
      id: chatId,
      userId,
      title: `Test ${suffix}`,
      messages: {
        create: {
          id: requestMessageId,
          role: 'user',
          content: '测试 Agent 事件',
        },
      },
    },
  });

  return { chatId, requestMessageId };
}

describeWithTestDatabase('agent event integration', () => {
  beforeAll(async () => {
    ({ prisma } = await import('@/lib/prisma'));
    agentEvents = await import('@/lib/agent-events');
  });

  beforeEach(async () => {
    await cleanupDatabase(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  test('serializes concurrent events and finalizes a run only once', async () => {
    const user = await createTestUser(prisma, { id: 'user-a' });
    const request = await createChatWithRequest(user.id, 'ordered');
    const started = await agentEvents.startAgentRun({
      userId: user.id,
      ...request,
    });

    expect(started.status).toBe('started');
    if (started.status !== 'started') return;

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        started.recorder.emit({
          type: index % 2 === 0 ? 'tool.started' : 'tool.completed',
          scope: 'test-agent',
          name: 'paper-search',
          detail: `event-${index + 1}`,
        }),
      ),
    );
    const completed = await started.recorder.complete();
    const duplicateCompletion = await started.recorder.complete();

    const run = await prisma.agentRun.findUnique({
      where: { requestMessageId: request.requestMessageId },
      include: { events: { orderBy: { sequence: 'asc' } } },
    });

    expect(completed?.type).toBe('run.completed');
    expect(duplicateCompletion).toBeNull();
    expect(run).toMatchObject({
      status: 'COMPLETED',
      nextSequence: 9,
    });
    expect(run?.events.map(event => event.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(run?.events.at(-1)).toMatchObject({
      type: 'run.completed',
      status: 'completed',
      title: '任务已完成',
    });
  });

  test('redacts secrets when a run fails', async () => {
    const user = await createTestUser(prisma, { id: 'user-a' });
    const request = await createChatWithRequest(user.id, 'failed');
    const started = await agentEvents.startAgentRun({
      userId: user.id,
      ...request,
    });

    expect(started.status).toBe('started');
    if (started.status !== 'started') return;

    await started.recorder.fail(
      new Error('provider rejected sk-super-secret-token-12345678'),
      '模型服务调用失败',
    );
    const run = await prisma.agentRun.findUnique({
      where: { requestMessageId: request.requestMessageId },
      include: { events: true },
    });

    expect(run?.status).toBe('FAILED');
    expect(run?.errorMessage).toBe('provider rejected [REDACTED]');
    expect(run?.errorMessage).not.toContain('super-secret');
    expect(run?.events).toEqual([
      expect.objectContaining({
        type: 'run.failed',
        status: 'failed',
        detail: '模型服务调用失败',
      }),
    ]);
  });

  test('deduplicates runs and cascades events when the chat is deleted', async () => {
    const user = await createTestUser(prisma, { id: 'user-a' });
    const request = await createChatWithRequest(user.id, 'cascade');
    const first = await agentEvents.startAgentRun({
      userId: user.id,
      ...request,
    });
    const duplicate = await agentEvents.startAgentRun({
      userId: user.id,
      ...request,
    });

    expect(first.status).toBe('started');
    expect(duplicate.status).toBe('duplicate');
    if (first.status !== 'started') return;

    await first.recorder.emit({ type: 'run.started', scope: 'root' });
    await prisma.chat.delete({ where: { id: request.chatId } });

    await expect(
      prisma.agentRun.findMany({ where: { chatId: request.chatId } }),
    ).resolves.toEqual([]);
    await expect(prisma.agentEvent.findMany()).resolves.toEqual([]);
  });
});

describe.skipIf(hasTestDatabase)('agent event integration setup', () => {
  test('explains why database integration tests were skipped', () => {
    expect(explainSkippedIntegrationTests()).toMatch(/TEST_DATABASE_URL|ALLOW/);
  });
});
