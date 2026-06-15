import { ToolLoopAgent, type InferAgentUIMessage } from 'ai';
import { paperSearchTool } from '@/tool/paper-search-tool';
import { chatModel } from '@/lib/model';
import { buildSystemPrompt } from './prompts/common';
import { RESEARCH_ROLE, RESEARCH_WORKFLOW } from './prompts/research';
import {
  ANTI_HALLUCINATION,
  TOOL_FAILURE_RUNBOOK,
} from './prompts/anti-hallucination';

/**
 * 文献调研 subagent —— 由主 agent 通过 literature_research tool 调用。
 * 拥有独立的 system prompt + 工具集 + 上下文。
 */
export function createResearchAgent() {
  return new ToolLoopAgent({
    model: chatModel,
    instructions: buildSystemPrompt({
      role: RESEARCH_ROLE,
      rules: [RESEARCH_WORKFLOW],
      appendices: [ANTI_HALLUCINATION, TOOL_FAILURE_RUNBOOK],
    }),
    tools: {
      paper_search: paperSearchTool,
    },
  });
}

const _typing = createResearchAgent();
export type ResearchAgentUIMessage = InferAgentUIMessage<typeof _typing>;
