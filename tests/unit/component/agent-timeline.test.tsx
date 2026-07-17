import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import AgentTimeline from '@/component/agent-timeline';
import type { AgentEventData } from '@/agent/event-types';

function event(
  overrides: Partial<AgentEventData> & Pick<AgentEventData, 'id' | 'sequence'>,
): AgentEventData {
  return {
    runId: 'run-a',
    type: 'run.started',
    scope: 'root',
    status: 'running',
    title: '开始处理请求',
    createdAt: '2026-07-16T08:00:00.000Z',
    ...overrides,
  };
}

describe('AgentTimeline', () => {
  test('sorts events by sequence and renders safe progress details', () => {
    render(
      <AgentTimeline
        events={[
          event({
            id: 'event-2',
            sequence: 2,
            type: 'tool.completed',
            status: 'completed',
            title: 'arXiv 检索已完成',
            detail: '找到 6 篇论文',
            durationMs: 1250,
          }),
          event({ id: 'event-1', sequence: 1 }),
        ]}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('开始处理请求');
    expect(items[1]).toHaveTextContent('arXiv 检索已完成');
    expect(items[1]).toHaveTextContent('找到 6 篇论文');
    expect(items[1]).toHaveTextContent('1.3 s');
  });
});
