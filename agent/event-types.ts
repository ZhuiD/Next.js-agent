export type AgentEventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.aborted'
  | 'agent.started'
  | 'agent.completed'
  | 'agent.failed'
  | 'tool.started'
  | 'tool.completed'
  | 'tool.failed';

export type AgentEventStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted';

export interface AgentEventInput {
  type: AgentEventType;
  scope: string;
  name?: string;
  detail?: string;
  durationMs?: number;
}

export interface AgentEventData extends AgentEventInput {
  id: string;
  runId: string;
  sequence: number;
  status: AgentEventStatus;
  title: string;
  createdAt: string;
}

const AGENT_LABELS: Record<string, string> = {
  'literature-research': '文献调研 Agent',
  'github-research': 'GitHub 趋势 Agent',
};

const TOOL_LABELS: Record<string, string> = {
  'paper-search': 'arXiv 检索',
  'github-trending': 'GitHub Trending 抓取',
};

function getLabel(labels: Record<string, string>, name?: string) {
  if (!name) return 'Agent';
  return labels[name] ?? name;
}

/**
 * 所有用户可见文案都从固定事件类型生成，不把 prompt、模型 reasoning、
 * 工具原始输入或输出直接暴露给前端。
 */
export function getAgentEventPresentation(input: AgentEventInput): {
  status: AgentEventStatus;
  title: string;
} {
  const agent = getLabel(AGENT_LABELS, input.name);
  const tool = getLabel(TOOL_LABELS, input.name);

  switch (input.type) {
    case 'run.started':
      return { status: 'running', title: '开始处理请求' };
    case 'run.completed':
      return { status: 'completed', title: '任务已完成' };
    case 'run.failed':
      return { status: 'failed', title: '任务执行失败' };
    case 'run.aborted':
      return { status: 'aborted', title: '任务已停止' };
    case 'agent.started':
      return { status: 'running', title: `${agent} 已启动` };
    case 'agent.completed':
      return { status: 'completed', title: `${agent} 已完成` };
    case 'agent.failed':
      return { status: 'failed', title: `${agent} 执行失败` };
    case 'tool.started':
      return { status: 'running', title: `正在执行 ${tool}` };
    case 'tool.completed':
      return { status: 'completed', title: `${tool} 已完成` };
    case 'tool.failed':
      return { status: 'failed', title: `${tool} 失败` };
  }
}
