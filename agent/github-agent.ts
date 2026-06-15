import { ToolLoopAgent, type InferAgentUIMessage } from 'ai';
import { trendingTool } from '@/tool/trending-tool';
import { chatModel } from '@/lib/model';
import { buildSystemPrompt } from './prompts/common';
import { GITHUB_ROLE, GITHUB_WORKFLOW } from './prompts/github';
import {
  ANTI_HALLUCINATION,
  TOOL_FAILURE_RUNBOOK,
} from './prompts/anti-hallucination';

/**
 * GitHub 趋势 subagent —— 由主 agent 通过 github_research tool 调用。
 */
export function createGithubAgent() {
  return new ToolLoopAgent({
    model: chatModel,
    instructions: buildSystemPrompt({
      role: GITHUB_ROLE,
      rules: [GITHUB_WORKFLOW],
      appendices: [ANTI_HALLUCINATION, TOOL_FAILURE_RUNBOOK],
    }),
    tools: {
      trending: trendingTool,
    },
  });
}

const _typing = createGithubAgent();
export type GithubAgentUIMessage = InferAgentUIMessage<typeof _typing>;
