import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { auth } from '@/auth';
import {
  cleanupDatabase,
  createTestUser,
  describeWithTestDatabase,
  explainSkippedIntegrationTests,
  hasTestDatabase,
} from './utils/db';
import type { prisma as prismaExport } from '@/lib/prisma';
import type * as conversationsRouteModule from '@/app/api/conversations/route';
import type * as conversationDetailRouteModule from '@/app/api/conversations/[id]/route';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

let prisma: typeof prismaExport;
let conversationsRoute: typeof conversationsRouteModule;
let conversationDetailRoute: typeof conversationDetailRouteModule;

const mockedAuth = vi.mocked(auth as unknown as () => Promise<unknown>);

function mockSession(userId: string | null) {
  mockedAuth.mockResolvedValue(
    userId ? { user: { id: userId } } : null,
  );
}

async function readJson(response: Response) {
  return response.json() as Promise<unknown>;
}

describeWithTestDatabase('conversation route integration', () => {
  beforeAll(async () => {
    ({ prisma } = await import('@/lib/prisma'));
    conversationsRoute = await import('@/app/api/conversations/route');
    conversationDetailRoute = await import('@/app/api/conversations/[id]/route');
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupDatabase(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  test('requires auth before listing conversations', async () => {
    mockSession(null);

    const response = await conversationsRoute.GET();

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: '请先登录' });
  });

  test('lists only the current user conversations', async () => {
    const user = await createTestUser(prisma, { id: 'user-a' });
    const otherUser = await createTestUser(prisma, { id: 'user-b' });

    const ownChat = await prisma.chat.create({
      data: { id: 'chat-a', userId: user.id, title: '自己的对话' },
    });
    await prisma.chat.create({
      data: { id: 'chat-b', userId: otherUser.id, title: '别人的对话' },
    });

    mockSession(user.id);

    const response = await conversationsRoute.GET();
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual([
      {
        id: ownChat.id,
        title: ownChat.title,
        updatedAt: ownChat.updatedAt.toISOString(),
      },
    ]);
  });

  test('forbids reading another user conversation', async () => {
    const user = await createTestUser(prisma, { id: 'user-a' });
    const otherUser = await createTestUser(prisma, { id: 'user-b' });
    const otherChat = await prisma.chat.create({
      data: { id: 'chat-b', userId: otherUser.id, title: '别人的对话' },
    });

    mockSession(user.id);

    const response = await conversationDetailRoute.GET(
      new Request(`http://localhost/api/conversations/${otherChat.id}`),
      { params: Promise.resolve({ id: otherChat.id }) },
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({ error: '无权访问' });
  });

  test('returns own conversation messages with parsed parts fallback', async () => {
    const user = await createTestUser(prisma, { id: 'user-a' });
    const chat = await prisma.chat.create({
      data: { id: 'chat-a', userId: user.id, title: '自己的对话' },
    });
    await prisma.message.createMany({
      data: [
        {
          id: 'msg-a',
          chatId: chat.id,
          role: 'user',
          content: '你好',
          partsJson: JSON.stringify([{ type: 'text', text: '你好' }]),
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
        },
        {
          id: 'msg-b',
          chatId: chat.id,
          role: 'assistant',
          content: '你好，有什么可以帮你？',
          partsJson: null,
          createdAt: new Date('2024-01-01T00:00:01.000Z'),
        },
      ],
    });

    mockSession(user.id);

    const response = await conversationDetailRoute.GET(
      new Request(`http://localhost/api/conversations/${chat.id}`),
      { params: Promise.resolve({ id: chat.id }) },
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      id: chat.id,
      title: chat.title,
      messages: [
        {
          id: 'msg-a',
          role: 'user',
          content: '你好',
          parts: [{ type: 'text', text: '你好' }],
        },
        {
          id: 'msg-b',
          role: 'assistant',
          content: '你好，有什么可以帮你？',
          parts: [{ type: 'text', text: '你好，有什么可以帮你？' }],
        },
      ],
    });
  });

  test('deletes an owned conversation and cascades messages', async () => {
    const user = await createTestUser(prisma, { id: 'user-a' });
    const chat = await prisma.chat.create({
      data: { id: 'chat-a', userId: user.id, title: '待删除' },
    });
    await prisma.message.create({
      data: {
        id: 'msg-a',
        chatId: chat.id,
        role: 'user',
        content: '删除我',
      },
    });

    mockSession(user.id);

    const response = await conversationDetailRoute.DELETE(
      new Request(`http://localhost/api/conversations/${chat.id}`),
      { params: Promise.resolve({ id: chat.id }) },
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
    await expect(
      prisma.chat.findUnique({ where: { id: chat.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.message.findMany({ where: { chatId: chat.id } }),
    ).resolves.toEqual([]);
  });

  test('forbids deleting another user conversation', async () => {
    const user = await createTestUser(prisma, { id: 'user-a' });
    const otherUser = await createTestUser(prisma, { id: 'user-b' });
    const otherChat = await prisma.chat.create({
      data: { id: 'chat-b', userId: otherUser.id, title: '不能删除' },
    });

    mockSession(user.id);

    const response = await conversationDetailRoute.DELETE(
      new Request(`http://localhost/api/conversations/${otherChat.id}`),
      { params: Promise.resolve({ id: otherChat.id }) },
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({ error: '无权删除' });
    await expect(
      prisma.chat.findUnique({ where: { id: otherChat.id } }),
    ).resolves.toMatchObject({ id: otherChat.id });
  });
});

describe.skipIf(hasTestDatabase)('conversation route integration setup', () => {
  test('explains why database integration tests were skipped', () => {
    expect(explainSkippedIntegrationTests()).toMatch(/TEST_DATABASE_URL|ALLOW/);
  });
});
