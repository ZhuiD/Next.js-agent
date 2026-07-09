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

    expect(response.status).toBe(429);
    expect(chat).toBeNull();
    expect(rateLimit?.count).toBe(20);
    expect(mockedCreateRootAgent).not.toHaveBeenCalled();
  });
});

describe.skipIf(hasTestDatabase)('chat route integration setup', () => {
  test('explains why database integration tests were skipped', () => {
    expect(explainSkippedIntegrationTests()).toMatch(/TEST_DATABASE_URL|ALLOW/);
  });
});
