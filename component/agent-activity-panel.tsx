'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEventData, AgentEventStatus } from '@/agent/event-types';
import type { AppUIMessage } from '@/agent/ui-messages';

type ActivityItem =
  | {
      kind: 'reasoning';
      key: string;
      text: string;
    }
  | {
      kind: 'event';
      key: string;
      event: AgentEventData;
    };

const STATUS_STYLES: Record<AgentEventStatus, string> = {
  running: 'border-blue-500 bg-blue-100',
  completed: 'border-emerald-600 bg-emerald-100',
  failed: 'border-red-600 bg-red-100',
  aborted: 'border-amber-600 bg-amber-100',
};

const HIDDEN_EVENT_TYPES = new Set(['run.started', 'run.completed']);

function formatDuration(durationMs?: number) {
  if (durationMs === undefined) return null;
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function getElapsedTime(events: AgentEventData[]) {
  if (events.length < 2) return null;

  const startedAt = Date.parse(events[0].createdAt);
  const finishedAt = Date.parse(events[events.length - 1].createdAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return null;

  return formatDuration(Math.max(0, finishedAt - startedAt));
}

export function getAgentActivityItems(
  parts: AppUIMessage['parts'],
): ActivityItem[] {
  return parts.flatMap((part, index): ActivityItem[] => {
    // ReasoningUIPart is optional in the AI SDK protocol. Providers that do not
    // support thinking simply never produce this part, so the UI degrades quietly.
    if (part.type === 'reasoning') {
      const text = part.text.trim();
      return text
        ? [{ kind: 'reasoning', key: `reasoning-${index}`, text }]
        : [];
    }

    if (
      part.type === 'data-agent-event' &&
      !HIDDEN_EVENT_TYPES.has(part.data.type)
    ) {
      return [{ kind: 'event', key: part.data.id, event: part.data }];
    }

    return [];
  });
}

export default function AgentActivityPanel({
  parts,
  isStreaming,
}: {
  parts: AppUIMessage['parts'];
  isStreaming: boolean;
}) {
  const items = useMemo(() => getAgentActivityItems(parts), [parts]);
  const allEvents = useMemo(
    () =>
      parts
        .filter(part => part.type === 'data-agent-event')
        .map(part => part.data),
    [parts],
  );
  const [isOpen, setIsOpen] = useState(isStreaming);
  const wasStreaming = useRef(isStreaming);

  useEffect(() => {
    if (isStreaming && !wasStreaming.current) {
      setIsOpen(true);
    } else if (!isStreaming && wasStreaming.current) {
      setIsOpen(false);
    }
    wasStreaming.current = isStreaming;
  }, [isStreaming]);

  if (items.length === 0) return null;

  const hasReasoning = items.some(item => item.kind === 'reasoning');
  const hasFailure = allEvents.some(event => event.status === 'failed');
  const toolCount = allEvents.filter(
    event => event.type === 'tool.started',
  ).length;
  const elapsedTime = getElapsedTime(allEvents);
  const title = isStreaming
    ? hasReasoning
      ? '思考中'
      : '执行中'
    : hasFailure
      ? '执行未完成'
      : hasReasoning
        ? '已完成思考'
        : '运行详情';
  const summary = [
    toolCount > 0 ? `${toolCount} 次工具调用` : null,
    elapsedTime,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section aria-label="Agent 活动" className="mb-3 border-b border-zinc-200">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={`${isOpen ? '收起' : '展开'} Agent 活动`}
        onClick={() => setIsOpen(open => !open)}
        className="flex w-full items-center justify-between gap-3 py-2 text-left text-xs text-zinc-500 transition hover:text-zinc-800"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${isStreaming ? 'animate-pulse bg-blue-500' : hasFailure ? 'bg-red-500' : 'bg-emerald-600'}`}
          />
          <span className="font-medium text-zinc-700">{title}</span>
          {summary && <span className="truncate text-zinc-400">{summary}</span>}
        </span>
        <span
          aria-hidden="true"
          className={`mr-1 h-2 w-2 shrink-0 border-b border-r border-zinc-400 transition-transform ${isOpen ? 'rotate-[225deg]' : 'rotate-45'}`}
        />
      </button>

      {isOpen && (
        <div className="pb-3">
          <div className="ml-1 space-y-3 border-l border-zinc-200 pl-4">
            {items.map(item => {
              if (item.kind === 'reasoning') {
                return (
                  <p
                    key={item.key}
                    className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-600"
                  >
                    {item.text}
                  </p>
                );
              }

              const duration = formatDuration(item.event.durationMs);
              return (
                <div key={item.key} className="relative text-xs">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 ${STATUS_STYLES[item.event.status]}`}
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="font-medium text-zinc-700">
                      {item.event.title}
                    </span>
                    {duration && (
                      <span className="tabular-nums text-zinc-400">
                        {duration}
                      </span>
                    )}
                  </div>
                  {item.event.detail && (
                    <div className="mt-0.5 text-zinc-500">
                      {item.event.detail}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
