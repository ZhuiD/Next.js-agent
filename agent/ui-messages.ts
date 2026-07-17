import type { UIMessage, InferUITools } from 'ai';
import type { AgentEventData } from '@/agent/event-types';
import type { literatureResearchTool } from '@/tool/literature-research-tool';
import type { githubResearchTool } from '@/tool/github-research-tool';
import type { paperSearchTool } from '@/tool/paper-search-tool';
import type { trendingTool } from '@/tool/trending-tool';

/**
 * 客户端实际会收到的 UI message 类型 —— 是**主 agent + 所有 subagent 工具**的并集。
 *
 * 原因：主 agent 只持有 literature_research / github_research 两个"subagent-as-tool"，
 * 但 subagent 会把它们内部的 paper_search / trending 工具调用通过 writer.merge
 * 转发到主 stream，所以前端最终会同时看到这 4 种 tool 的 part。
 */
type AllTools = {
  literature_research: typeof literatureResearchTool;
  github_research: typeof githubResearchTool;
  paper_search: typeof paperSearchTool;
  trending: typeof trendingTool;
};

type AppDataParts = {
  'agent-event': AgentEventData;
};

export type AppUIMessage = UIMessage<
  unknown,
  AppDataParts,
  InferUITools<AllTools>
>;
