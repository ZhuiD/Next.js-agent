import { ToolLoopAgent, type InferAgentUIMessage } from 'ai';
import { chatModel } from '@/lib/model';
import { literatureResearchTool } from '@/tool/literature-research-tool';
import { githubResearchTool } from '@/tool/github-research-tool';
import { buildSystemPrompt } from './prompts/common';
import { ROUTER_ROLE, ROUTER_RULES } from './prompts/router';

/**
 * 主路由 agent。
 *
 * 职责：
 * 1. 判断用户意图（GitHub trending / 文献调研 / 闲聊）
 * 2. 派发给对应的 subagent（包装成 tool）
 * 3. 直接闲聊则自己回
 *
 * 不直接接 paper_search / trending 这种叶子工具——保证主 agent prompt 短小。
 *
 * @param context - 透传给所有 tool 的 experimental_context。
 *                  我们用它把 main writer 注入到 subagent-as-tool 里，
 *                  让 subagent 内部工具的 UI stream 能 merge 到主流。
 */
export function createRootAgent(context?: unknown) {
  return new ToolLoopAgent({
    model: chatModel,
    instructions: buildSystemPrompt({
      role: ROUTER_ROLE,
      rules: [ROUTER_RULES],
      // 主 agent 自己不调外部 API，不强制带防幻觉铁律；
      // 但 ROUTER_RULES 里已显式禁止"凭空补论文/仓库"
    }),
    tools: {
      literature_research: literatureResearchTool,
      github_research: githubResearchTool,
    },
    experimental_context: context,
  });
}

const _typing = createRootAgent();
export type RootAgentUIMessage = InferAgentUIMessage<typeof _typing>;
