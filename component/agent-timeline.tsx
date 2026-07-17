import type { AgentEventData, AgentEventStatus } from '@/agent/event-types';

const STATUS_STYLES: Record<AgentEventStatus, string> = {
  running: 'border-blue-500 bg-blue-100',
  completed: 'border-emerald-600 bg-emerald-100',
  failed: 'border-red-600 bg-red-100',
  aborted: 'border-amber-600 bg-amber-100',
};

function formatDuration(durationMs?: number) {
  if (durationMs === undefined) return null;
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

export default function AgentTimeline({
  events,
}: {
  events: AgentEventData[];
}) {
  if (events.length === 0) return null;

  const orderedEvents = [...events].sort(
    (left, right) => left.sequence - right.sequence,
  );

  return (
    <section
      aria-label="Agent 执行进度"
      className="my-3 border-y border-zinc-200 py-3"
    >
      <div className="mb-2 text-xs font-medium text-zinc-600">执行进度</div>
      <ol className="ml-1 border-l border-zinc-200">
        {orderedEvents.map(event => {
          const duration = formatDuration(event.durationMs);

          return (
            <li key={event.id} className="relative py-1 pl-4 text-xs">
              <span
                aria-hidden="true"
                className={`absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full border-2 ${STATUS_STYLES[event.status]}`}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="font-medium text-zinc-700">{event.title}</span>
                {duration && (
                  <span className="tabular-nums text-zinc-400">{duration}</span>
                )}
              </div>
              {event.detail && (
                <div className="mt-0.5 text-zinc-500">{event.detail}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
