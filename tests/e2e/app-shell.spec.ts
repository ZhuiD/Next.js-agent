import { expect, test, type Page } from '@playwright/test';

const expires = '2099-01-01T00:00:00.000Z';
const defaultAccountSummary = {
  user: { plan: 'free' },
  quota: {
    limit: 20,
    remaining: 19,
    unlimited: false,
    resetAt: expires,
  },
  model: 'ci-model',
};

type AccountSummary = typeof defaultAccountSummary;

async function blockUnexpectedApiCalls(page: Page) {
  // Browser E2E should prove the page wiring works without touching real
  // OAuth, Supabase, or the LLM API. Specific mocks below opt in endpoint by endpoint.
  await page.route('**/api/**', route => route.abort('blockedbyclient'));
}

async function mockAnonymousSession(page: Page) {
  await blockUnexpectedApiCalls(page);

  await page.route('**/api/auth/session**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'null',
    }),
  );
}

function createUiMessageStream(chunks: object[]) {
  return `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`;
}

async function mockAuthenticatedApp(
  page: Page,
  {
    accountSummaries = [defaultAccountSummary],
  }: {
    accountSummaries?: AccountSummary[];
  } = {},
) {
  await blockUnexpectedApiCalls(page);
  let accountSummaryIndex = 0;

  await page.route('**/api/auth/session**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'user-e2e',
          name: 'E2E User',
          email: 'e2e@example.test',
          image: null,
        },
        expires,
      }),
    }),
  );

  await page.route('**/api/me', route =>
    {
      // The sidebar fetches account summary on login and again after a chat
      // request settles. Returning a sequence lets E2E verify quota refreshes.
      const summary =
        accountSummaries[
          Math.min(accountSummaryIndex, accountSummaries.length - 1)
        ];
      accountSummaryIndex += 1;

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(summary),
      });
    },
  );

  await page.route('**/api/conversations', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'e2e-chat',
          title: 'E2E 会话',
          updatedAt: expires,
        },
      ]),
    }),
  );

  await page.route('**/api/conversations/e2e-chat', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'e2e-chat',
        title: 'E2E 会话',
        messages: [
          {
            id: 'message-user',
            role: 'user',
            content: '之前的问题',
            createdAt: expires,
            parts: [{ type: 'text', text: '之前的问题' }],
          },
          {
            id: 'message-assistant',
            role: 'assistant',
            content: '之前的回答',
            createdAt: expires,
            parts: [{ type: 'text', text: '之前的回答' }],
          },
        ],
      }),
    }),
  );
}

test('keeps the chat read-only for anonymous visitors', async ({ page }) => {
  await mockAnonymousSession(page);

  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'GitTrendInsight & Research Agent' }),
  ).toBeVisible();
  await expect(page.getByText('登录后查看历史对话')).toBeVisible();
  await expect(page.getByText('请先登录后再开始对话')).toBeVisible();
  await expect(page.getByPlaceholder('登录后即可发送消息')).toBeDisabled();
  await expect(page.getByRole('button', { name: '发送' })).toBeDisabled();
});

test('renders the authenticated app shell from mocked account APIs', async ({
  page,
}) => {
  await mockAuthenticatedApp(page);

  await page.goto('/');

  await expect(page.getByText('E2E 会话')).toBeVisible();
  await expect(page.getByText('E2E User')).toBeVisible();
  await expect(page.getByText('剩余 19/20 次')).toBeVisible();
  await expect(page.getByText('模型：ci-model')).toBeVisible();
  await expect(
    page.getByPlaceholder('例如：最近 24 小时最火的 AI 项目，用中文总结'),
  ).toBeEnabled();
});

test('loads a historical conversation into the chat area', async ({ page }) => {
  await mockAuthenticatedApp(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'E2E 会话' }).click();

  await expect(page.getByText('之前的问题')).toBeVisible();
  await expect(page.getByText('之前的回答')).toBeVisible();
  await expect(page.getByText('Agent', { exact: true })).toBeVisible();
});

test('sends a message, renders the streamed answer, and refreshes quota', async ({
  page,
}) => {
  let chatRequestBody: unknown;

  await mockAuthenticatedApp(page, {
    accountSummaries: [
      defaultAccountSummary,
      {
        ...defaultAccountSummary,
        quota: {
          ...defaultAccountSummary.quota,
          remaining: 18,
        },
      },
    ],
  });

  await page.route('**/api/chat', async route => {
    chatRequestBody = await route.request().postDataJSON();

    return route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'x-vercel-ai-ui-message-stream': 'v1',
      },
      body: createUiMessageStream([
        { type: 'start', messageId: 'assistant-e2e' },
        { type: 'start-step' },
        { type: 'text-start', id: 'text-1' },
        {
          type: 'text-delta',
          id: 'text-1',
          delta: '这是 E2E 模拟的 Agent 回复。',
        },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'stop' },
      ]),
    });
  });

  await page.goto('/');
  await page
    .getByPlaceholder('例如：最近 24 小时最火的 AI 项目，用中文总结')
    .fill('请用中文总结今天的 GitHub 趋势');
  await page.getByRole('button', { name: '发送' }).click();

  await expect(page.getByText('请用中文总结今天的 GitHub 趋势')).toBeVisible();
  await expect(page.getByText('这是 E2E 模拟的 Agent 回复。')).toBeVisible();
  await expect(page.getByText('剩余 18/20 次')).toBeVisible();
  await expect.poll(() => chatRequestBody).not.toBeUndefined();

  const body = chatRequestBody as {
    id?: string;
    messages?: Array<{
      role?: string;
      parts?: Array<{ type?: string; text?: string }>;
    }>;
  };
  const latestMessage = body.messages?.at(-1);

  expect(body.id).toEqual(expect.any(String));
  expect(latestMessage?.role).toBe('user');
  expect(latestMessage?.parts).toContainEqual({
    type: 'text',
    text: '请用中文总结今天的 GitHub 趋势',
  });
});
