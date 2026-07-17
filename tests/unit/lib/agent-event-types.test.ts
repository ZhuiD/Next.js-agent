import { describe, expect, test } from 'vitest';
import { getAgentEventPresentation } from '@/agent/event-types';

describe('agent event presentation', () => {
  test('maps internal names to fixed user-visible labels', () => {
    expect(
      getAgentEventPresentation({
        type: 'tool.started',
        scope: 'literature-research',
        name: 'paper-search',
      }),
    ).toEqual({ status: 'running', title: '正在执行 arXiv 检索' });

    expect(
      getAgentEventPresentation({
        type: 'agent.completed',
        scope: 'root',
        name: 'github-research',
      }),
    ).toEqual({ status: 'completed', title: 'GitHub 趋势 Agent 已完成' });
  });
});
