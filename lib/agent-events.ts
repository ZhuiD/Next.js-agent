import type { UIMessageStreamWriter } from 'ai';
import type { AgentRunStatus } from '@/generated/prisma/client';
import type { AppUIMessage } from '@/agent/ui-messages';
import {
  getAgentEventPresentation,
  type AgentEventData,
  type AgentEventInput,
} from '@/agent/event-types';
import { prisma } from '@/lib/prisma';

interface AgentRunSequenceRow {
  nextSequence: number;
}

export interface AgentRuntimeContext {
  writer?: UIMessageStreamWriter<AppUIMessage>;
  events?: AgentRunRecorder;
}

export type StartAgentRunResult =
  | { status: 'started'; recorder: AgentRunRecorder }
  | { status: 'duplicate' }
  | { status: 'unavailable' };

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function normalizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/sk-[a-z0-9_-]{8,}/gi, '[REDACTED]')
    .replace(
      /(api[_-]?key|authorization|token)(\s*[=:]\s*)[^\s,;]+/gi,
      '$1$2[REDACTED]',
    )
    .slice(0, 500);
}

function toEventData(event: {
  id: string;
  runId: string;
  sequence: number;
  type: string;
  scope: string;
  name: string | null;
  status: string;
  title: string;
  detail: string | null;
  durationMs: number | null;
  createdAt: Date;
}): AgentEventData {
  return {
    id: event.id,
    runId: event.runId,
    sequence: event.sequence,
    type: event.type as AgentEventData['type'],
    scope: event.scope,
    ...(event.name ? { name: event.name } : {}),
    status: event.status as AgentEventData['status'],
    title: event.title,
    ...(event.detail ? { detail: event.detail } : {}),
    ...(event.durationMs === null ? {} : { durationMs: event.durationMs }),
    createdAt: event.createdAt.toISOString(),
  };
}

export function getAgentRuntimeContext(
  context: unknown,
): AgentRuntimeContext | undefined {
  if (!context || typeof context !== 'object') return undefined;
  return context as AgentRuntimeContext;
}

export async function startAgentRun(input: {
  userId: string;
  chatId: string;
  requestMessageId: string;
}): Promise<StartAgentRunResult> {
  try {
    const run = await prisma.agentRun.create({ data: input });
    return { status: 'started', recorder: new AgentRunRecorder(run.id) };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: 'duplicate' };
    }

    // 可观测性属于辅助能力。记录系统暂时不可用时保留主聊天功能，
    // 避免一次日志故障把本来可以成功的 LLM 请求也变成失败。
    console.error('Failed to start agent run observability', {
      chatId: input.chatId,
      userId: input.userId,
      error,
    });
    return { status: 'unavailable' };
  }
}

export class AgentRunRecorder {
  private writer?: UIMessageStreamWriter<AppUIMessage>;
  private queue: Promise<void> = Promise.resolve();

  constructor(readonly runId: string) {}

  attachWriter(writer: UIMessageStreamWriter<AppUIMessage>) {
    this.writer = writer;
  }

  emit(input: AgentEventInput): Promise<AgentEventData | null> {
    return this.schedule(() => this.persistEvent(input));
  }

  complete(): Promise<AgentEventData | null> {
    return this.finalize('COMPLETED', {
      type: 'run.completed',
      scope: 'root',
    });
  }

  fail(error: unknown, detail = '执行过程中发生错误'): Promise<AgentEventData | null> {
    return this.finalize(
      'FAILED',
      { type: 'run.failed', scope: 'root', detail },
      normalizeErrorMessage(error),
    );
  }

  abort(): Promise<AgentEventData | null> {
    return this.finalize('ABORTED', {
      type: 'run.aborted',
      scope: 'root',
      detail: '用户停止了本次生成',
    });
  }

  async linkResponseMessage(responseMessageId: string): Promise<void> {
    await this.schedule(async () => {
      await prisma.agentRun.updateMany({
        where: { id: this.runId },
        data: { responseMessageId },
      });
      return null;
    });
  }

  private schedule<T>(operation: () => Promise<T>): Promise<T | null> {
    const result = this.queue.then(operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );

    return result.catch(error => {
      // 事件按同一个 queue 串行执行，既稳定顺序，也把故障隔离在可观测层。
      console.error('Failed to record agent event', {
        runId: this.runId,
        error,
      });
      return null;
    });
  }

  private async persistEvent(
    input: AgentEventInput,
  ): Promise<AgentEventData | null> {
    const event = await prisma.$transaction(async tx => {
      const sequenceRows = await tx.$queryRaw<AgentRunSequenceRow[]>`
        UPDATE "AgentRun"
        SET "nextSequence" = "nextSequence" + 1
        WHERE "id" = ${this.runId} AND "status" = 'RUNNING'
        RETURNING "nextSequence"
      `;
      const sequence = sequenceRows[0]?.nextSequence;
      if (!sequence) return null;

      const presentation = getAgentEventPresentation(input);
      return tx.agentEvent.create({
        data: {
          runId: this.runId,
          sequence,
          type: input.type,
          scope: input.scope,
          name: input.name,
          status: presentation.status,
          title: presentation.title,
          detail: input.detail,
          durationMs: input.durationMs,
        },
      });
    });

    if (!event) return null;
    return this.publish(toEventData(event));
  }

  private finalize(
    status: AgentRunStatus,
    input: AgentEventInput,
    errorMessage?: string,
  ): Promise<AgentEventData | null> {
    return this.schedule(async () => {
      const event = await prisma.$transaction(async tx => {
        const sequenceRows = await tx.$queryRaw<AgentRunSequenceRow[]>`
          UPDATE "AgentRun"
          SET
            "nextSequence" = "nextSequence" + 1,
            "status" = ${status}::"AgentRunStatus",
            "errorMessage" = ${errorMessage ?? null},
            "finishedAt" = ${new Date()}
          WHERE "id" = ${this.runId} AND "status" = 'RUNNING'
          RETURNING "nextSequence"
        `;
        const sequence = sequenceRows[0]?.nextSequence;
        if (!sequence) return null;

        const presentation = getAgentEventPresentation(input);
        return tx.agentEvent.create({
          data: {
            runId: this.runId,
            sequence,
            type: input.type,
            scope: input.scope,
            name: input.name,
            status: presentation.status,
            title: presentation.title,
            detail: input.detail,
            durationMs: input.durationMs,
          },
        });
      });

      if (!event) return null;
      return this.publish(toEventData(event));
    });
  }

  private publish(data: AgentEventData): AgentEventData {
    this.writer?.write({
      type: 'data-agent-event',
      id: data.id,
      data,
    });
    return data;
  }
}
