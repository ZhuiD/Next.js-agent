import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { auth } from '@/auth';
import { createRootAgent } from '@/agent/root-agent';
import {
  cleanupDatabase,
  createTestUser,
  describeWithTestDatabase,
  explainSkippedIntegrationTests,
  hasTestDatabase,
} from './utils/db';
import type { PrismaClient } from '@/generated/prisma/client';
import type * as chatRouteModule from '@/app/api/chat/route';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/agent/root-agent', () => ({
  createRootAgent: vi.fn(),
}));

let prisma: PrismaClient;
let chatRoute: typeof chatRouteModule;

const mockedAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockedCreateRootAgent = vi.mocked(
  createRootAgent as unknown as () => unknown,
);

function mockSession(userId: string | null) {
  mockedAuth.mockResolvedValue(userId ? { user: { id: userId } } : null);
}

function chatRequest(body: unknown) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function readJson(response: Response) {
  return response.json() as Promise<unknown>;
}

describeWithTestDatabase('chat route integration', () => {
  beforeAll(async () => {
    ({ prisma } = await import('@/lib/prisma'));
    chatRoute = await import('@/app/api/chat/route');
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupDatabase(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  test('rejects malformed JSON without consuming quota', async () => {
    const user = await createTestUser(prisma, { id: 'user-a', plan: 'free' });
    mockSession(user.id);

    const response = await chatRoute.POST(chatRequest('{not-json'));
    const rateLimit = await prisma.rateLimit.findUnique({
      where: { userId: user.id },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: '请求格式无效，请提交有效的聊天消息',
    });
    expect(rateLimit).toBeNull();
    expect(mockedCreateRootAgent).not.toHaveBeenCalled();
  });

  test('rejects non-user latest message without consuming quota', async () => {
    const user = await createTestUser(prisma, { id: 'user-a', plan: 'free' });
    mockSession(user.id);

    const response = await chatRoute.POST(
      chatRequest({
        id: 'chat-a',
        messages: [
          {
            id: 'msg-a',
            role: 'assistant',
            parts: [{ type: 'text', text: '不能这样提交' }],
          },
        ],
      }),
    );
    const rateLimit = await prisma.rateLimit.findUnique({
      where: { userId: user.id },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: '最后一条消息必须是用户消息',
    });
    expect(rateLimit).toBeNull();
    expect(mockedCreateRootAgent).not.toHaveBeenCalled();
  });

  test('rejects another user chat id without consuming quota', async () => {
    const user = await createTestUser(prisma, { id: 'user-a', plan: 'free' });
    const otherUser = await createTestUser(prisma, { id: 'user-b', plan: 'free' });
    await prisma.chat.create({
      data: { id: 'chat-b', userId: otherUser.id, title: '别人的对话' },
    });
    mockSession(user.id);

    const response = await chatRoute.POST(
      chatRequest({
        id: 'chat-b',
        messages: [
          {
            id: 'msg-a',
            role: 'user',
            parts: [{ type: 'text', text: '我要访问别人的对话' }],
          },
        ],
      }),
    );
    const rateLimit = await prisma.rateLimit.findUnique({
      where: { userId: user.id },
    });

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({ error: '无权访问该对话' });
    expect(rateLimit).toBeNull();
    expect(mockedCreateRootAgent).not.toHaveBeenCalled();
  });

  test('returns 429 before creating chat or calling the agent when quota is exhausted', async () => {
    const user = await createTestUser(prisma, { id: 'user-a', plan: 'free' });
    await prisma.rateLimit.create({
      data: {
        userId: user.id,
        count: 20,
        windowStart: new Date(),
      },
    });
    mockSession(user.id);

    const response = await chatRoute.POST(
      chatRequest({
        id: 'chat-a',
        messages: [
          {
            id: 'msg-a',
            role: 'user',
            parts: [{ type: 'text', text: '这次应该被限流' }],
          },
        ],
      }),
    );
    const chat = await prisma.chat.findUnique({ where: { id: 'chat-a' } });
    const rateLimit = await prisma.rateLimit.findUnique({
      where: { userId: user.id },
    });
    const usageCount = await prisma.quotaUsage.count({
      where: { userId: user.id },
    });

    expect(response.status).toBe(429);
    expect(chat).toBeNull();
    expect(rateLimit?.count).toBe(20);
    expect(usageCount).toBe(0);
    expect(mockedCreateRootAgent).not.toHaveBeenCalled();
  });

  test('returns 409 for a duplicate message without consuming quota again', async () => {
    const user = await createTestUser(prisma, { id: 'user-a', plan: 'free' });
    const windowStart = new Date();
    await prisma.rateLimit.create({
      data: { userId: user.id, count: 1, windowStart },
    });
    await prisma.quotaUsage.create({
      data: {
        id: 'usage-a',
        userId: user.id,
        requestId: 'msg-a',
        chatId: 'chat-a',
        plan: 'free',
        limit: 20,
        windowStart,
      },
    });
    mockSession(user.id);

    const response = await chatRoute.POST(
      chatRequest({
        id: 'chat-a',
        messages: [
          {
            id: 'msg-a',
            role: 'user',
            parts: [{ type: 'text', text: '这是一条重复请求' }],
          },
        ],
      }),
    );
    const rateLimit = await prisma.rateLimit.findUnique({
      where: { userId: user.id },
    });
    const usageCount = await prisma.quotaUsage.count({
      where: { userId: user.id },
    });

    expect(response.status).toBe(409);
    await expect(readJson(response)).resolves.toEqual({
      error: '该请求正在处理或已经完成，请勿重复提交',
    });
    expect(rateLimit?.count).toBe(1);
    expect(usageCount).toBe(1);
    expect(mockedCreateRootAgent).not.toHaveBeenCalled();
  });

  test('does not overwrite a message that belongs to another chat', async () => {
    const user = await createTestUser(prisma, { id: 'user-a', plan: 'free' });
    const otherUser = await createTestUser(prisma, { id: 'user-b', plan: 'free' });
    await prisma.chat.create({
      data: {
        id: 'chat-b',
        userId: otherUser.id,
        title: '其他用户的会话',
        messages: {
          create: {
            id: 'shared-message-id',
            role: 'user',
            content: '不能被改写的原内容',
          },
        },
      },
    });
    mockSession(user.id);

    const response = await chatRoute.POST(
      chatRequest({
        id: 'chat-a',
        messages: [
          {
            id: 'shared-message-id',
            role: 'user',
            parts: [{ type: 'text', text: '恶意覆盖内容' }],
          },
        ],
      }),
    );
    const originalMessage = await prisma.message.findUnique({
      where: { id: 'shared-message-id' },
    });
    const rateLimit = await prisma.rateLimit.findUnique({
      where: { userId: user.id },
    });
    const usage = await prisma.quotaUsage.findUnique({
      where: { requestId: 'shared-message-id' },
    });

    expect(response.status).toBe(500);
    expect(originalMessage).toMatchObject({
      chatId: 'chat-b',
      content: '不能被改写的原内容',
    });
    expect(rateLimit?.count).toBe(0);
    expect(usage).toMatchObject({
      userId: user.id,
      status: 'REFUNDED',
      refundReason: 'request_persist_failed',
    });
    expect(mockedCreateRootAgent).not.toHaveBeenCalled();
  });
});

describe.skipIf(hasTestDatabase)('chat route integration setup', () => {
  test('explains why database integration tests were skipped', () => {
    expect(explainSkippedIntegrationTests()).toMatch(/TEST_DATABASE_URL|ALLOW/);
  });
});
