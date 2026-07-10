import { expect, test, type Page } from '@playwright/test';

const expires = '2099-01-01T00:00:00.000Z';

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

async function mockAuthenticatedApp(page: Page) {
  await blockUnexpectedApiCalls(page);

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
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { plan: 'free' },
        quota: {
          limit: 20,
          remaining: 19,
          unlimited: false,
          resetAt: expires,
        },
        model: 'ci-model',
      }),
    }),
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
