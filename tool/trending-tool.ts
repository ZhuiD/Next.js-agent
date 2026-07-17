import { tool, type UIToolInvocation } from 'ai';
import { z } from 'zod';
import { fetchGithubTrending } from '@/lib/github-trending';
import { getAgentRuntimeContext } from '@/lib/agent-events';

export const trendingTool = tool({
  description:
    '获取 GitHub Trending 趋势仓库列表。支持时间范围 (daily/weekly/monthly) 与编程语言筛选。当用户想了解最近热门项目、热门 AI 项目、某个语言的趋势时调用。',
  inputSchema: z.object({
    since: z
      .enum(['daily', 'weekly', 'monthly'])
      .default('daily')
      .describe('时间范围：daily=24小时内, weekly=本周, monthly=本月'),
    language: z
      .string()
      .optional()
      .describe(
        '编程语言筛选，例如 "typescript"、"python"、"rust"。不填表示所有语言。',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .default(15)
      .describe('返回的仓库数量，默认 15，最多 25。'),
  }),
  async *execute(
    { since, language, limit },
    { experimental_context },
  ) {
    const events = getAgentRuntimeContext(experimental_context)?.events;
    const startedAt = Date.now();
    await events?.emit({
      type: 'tool.started',
      scope: 'github-research',
      name: 'github-trending',
    });
    yield { state: 'loading' as const, since, language, limit };

    try {
      const repos = await fetchGithubTrending(since, language, limit);
      await events?.emit({
        type: 'tool.completed',
        scope: 'github-research',
        name: 'github-trending',
        detail: `找到 ${repos.length} 个仓库`,
        durationMs: Date.now() - startedAt,
      });
      yield {
        state: 'ready' as const,
        since,
        language: language ?? null,
        count: repos.length,
        repos,
      };
    } catch (err) {
      await events?.emit({
        type: 'tool.failed',
        scope: 'github-research',
        name: 'github-trending',
        detail: '本次 GitHub Trending 抓取失败',
        durationMs: Date.now() - startedAt,
      });
      yield {
        state: 'error' as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

export type TrendingUIToolInvocation = UIToolInvocation<typeof trendingTool>;
