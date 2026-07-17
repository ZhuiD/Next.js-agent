import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import AgentActivityPanel from '@/component/agent-activity-panel';
import type { AgentEventData } from '@/agent/event-types';
import type { AppUIMessage } from '@/agent/ui-messages';

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

function dataPart(data: AgentEventData): AppUIMessage['parts'][number] {
  return { type: 'data-agent-event', id: data.id, data };
}

describe('AgentActivityPanel', () => {
  test('interleaves model reasoning and real tool events in part order', () => {
    const parts: AppUIMessage['parts'] = [
      { type: 'reasoning', text: '先判断需要检索的研究方向。' },
      dataPart(
        event({
          id: 'event-2',
          sequence: 2,
          type: 'tool.started',
          name: 'paper-search',
          title: '正在执行 arXiv 检索',
        }),
      ),
      { type: 'reasoning', text: '第一组结果不够，需要补充关键词。' },
      dataPart(
        event({
          id: 'event-3',
          sequence: 3,
          type: 'tool.completed',
          name: 'paper-search',
          status: 'completed',
          title: 'arXiv 检索已完成',
          detail: '找到 6 篇论文',
          durationMs: 1250,
        }),
      ),
    ];

    render(<AgentActivityPanel parts={parts} isStreaming />);

    const activity = screen.getByRole('region', { name: 'Agent 活动' });
    const visibleText = activity.textContent ?? '';
    expect(visibleText.indexOf('先判断需要检索的研究方向。')).toBeLessThan(
      visibleText.indexOf('正在执行 arXiv 检索'),
    );
    expect(visibleText.indexOf('正在执行 arXiv 检索')).toBeLessThan(
      visibleText.indexOf('第一组结果不够，需要补充关键词。'),
    );
    expect(activity).toHaveTextContent('找到 6 篇论文');
    expect(activity).toHaveTextContent('1.3 s');
    expect(screen.getByText('思考中')).toBeVisible();
  });

  test('silently hides unsupported reasoning and empty run bookkeeping', () => {
    const parts: AppUIMessage['parts'] = [
      dataPart(event({ id: 'event-1', sequence: 1 })),
      dataPart(
        event({
          id: 'event-2',
          sequence: 2,
          type: 'run.completed',
          status: 'completed',
          title: '任务已完成',
        }),
      ),
      { type: 'text', text: '普通模型直接返回的答案。' },
    ];

    render(<AgentActivityPanel parts={parts} isStreaming={false} />);

    expect(
      screen.queryByRole('region', { name: 'Agent 活动' }),
    ).not.toBeInTheDocument();
  });

  test('shows tool-only activity and collapses it when streaming finishes', async () => {
    const parts: AppUIMessage['parts'] = [
      dataPart(
        event({
          id: 'event-1',
          sequence: 1,
          type: 'tool.started',
          title: '正在执行 GitHub Trending 抓取',
        }),
      ),
    ];
    const { rerender } = render(
      <AgentActivityPanel parts={parts} isStreaming />,
    );

    expect(screen.getByText('执行中')).toBeVisible();
    expect(screen.getByText('正在执行 GitHub Trending 抓取')).toBeVisible();

    rerender(<AgentActivityPanel parts={parts} isStreaming={false} />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '展开 Agent 活动' }),
      ).toHaveAttribute('aria-expanded', 'false'),
    );
    expect(
      screen.queryByText('正在执行 GitHub Trending 抓取'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '展开 Agent 活动' }));
    expect(screen.getByText('正在执行 GitHub Trending 抓取')).toBeVisible();
  });
});
