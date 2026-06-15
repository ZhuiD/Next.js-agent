import { tool, type UIToolInvocation, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import { createGithubAgent } from '@/agent/github-agent';

/**
 * 把 GitHub Trending subagent 包装成给主 agent 使用的 tool。
 * 实现方式与 literature-research-tool 一致：merge subagent 的 UI stream 到主 writer，
 * 让 subagent 内部的 trending 卡片在前端可见。
 */
export const githubResearchTool = tool({
  description:
    '把 GitHub Trending 调研任务交给"GitHub 趋势 subagent"完成。' +
    '当用户问 GitHub 趋势、热门项目、某语言/方向的开源新星时调用。' +
    'subagent 会自己挑时间窗 / 语言、抓 trending 列表、整理出中文点评报告。',
  inputSchema: z.object({
    task: z
      .string()
      .min(2)
      .describe(
        '用户的原始诉求（中文转述即可）。例如："本周 Rust 热门项目"。',
      ),
    sinceHint: z
      .enum(['daily', 'weekly', 'monthly'])
      .optional()
      .describe('可选：把用户语义里的时间窗提示给 subagent。'),
    languageHint: z
      .string()
      .optional()
      .describe('可选：把用户提到的编程语言提示给 subagent（如 typescript）。'),
  }),
  async *execute({ task, sinceHint, languageHint }, { experimental_context }) {
    yield { state: 'loading' as const, task };

    const ctx = experimental_context as
      | { writer?: UIMessageStreamWriter }
      | undefined;
    const writer = ctx?.writer;

    if (!writer) {
      yield {
        state: 'error' as const,
        message: 'github_research: missing UI stream writer in context',
      };
      return;
    }

    try {
      const subagent = createGithubAgent();
      const prompt = [
        `用户诉求：${task}`,
        sinceHint ? `时间窗提示：${sinceHint}` : null,
        languageHint ? `语言提示：${languageHint}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const result = await subagent.stream({ prompt });

      writer.merge(
        result.toUIMessageStream({
          sendStart: false,
          sendFinish: false,
        }),
      );

      const finalText = await result.text;

      yield {
        state: 'ready' as const,
        task,
        report: finalText,
      };
    } catch (err) {
      yield {
        state: 'error' as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

export type GithubResearchUIToolInvocation = UIToolInvocation<
  typeof githubResearchTool
>;
