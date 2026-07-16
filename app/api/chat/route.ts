import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
} from 'ai';
import { z } from 'zod';
import { auth } from '@/auth';
import { createRootAgent } from '@/agent/root-agent';
import type { AppUIMessage } from '@/agent/ui-messages';
import { prisma } from '@/lib/prisma';
import {
  checkUserRateLimit,
  confirmUserQuotaUsage,
  refundUserRateLimit,
} from '@/lib/user-rate-limit';

// 长一些的超时，给 LLM + subagent + scraping/arxiv 留余地
export const maxDuration = 60;

const UIMessagePartSchema = z
  .object({
    type: z.string().min(1),
  })
  .passthrough()
  .superRefine((part, ctx) => {
    // text part 是后续标题生成、消息落库和模型转换都依赖的最小文本单元。
    // 其他 tool/data part 允许透传，但 type=text 时必须真的带 text 字符串。
    if (part.type === 'text' && typeof (part as { text?: unknown }).text !== 'string') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'text message part must include a string text field',
        path: ['text'],
      });
    }
  });

const ChatMessageSchema = z
  .object({
    id: z.string().min(1).optional(),
    role: z.enum(['system', 'user', 'assistant']),
    parts: z.array(UIMessagePartSchema).min(1),
  })
  .passthrough()
  .transform(message => ({
    ...message,
    // 正常情况下 AI SDK 会给每条消息 id；这里兜底生成，避免老客户端或手写请求导致落库失败。
    id: message.id ?? crypto.randomUUID(),
  }));

const ChatRequestBodySchema = z.object({
  id: z.string().min(1).optional(),
  messages: z.array(ChatMessageSchema).min(1),
});

type ParsedChatRequest = {
  id?: string;
  messages: AppUIMessage[];
};

async function parseChatRequest(
  request: Request,
): Promise<
  | { ok: true; body: ParsedChatRequest }
  | { ok: false; response: Response }
> {
  // 后端不能相信客户端一定按 useChat 的格式提交；先把 JSON 和字段形状校验掉，
  // 后面的鉴权、限流、模型调用才不会被 malformed body 拖进异常路径。
  const rawBody = await request.json().catch(() => null);
  const parsed = ChatRequestBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return {
      ok: false,
      response: Response.json(
        { error: '请求格式无效，请提交有效的聊天消息' },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true,
    body: {
      id: parsed.data.id,
      messages: parsed.data.messages as AppUIMessage[],
    },
  };
}

function getTextContent(message: AppUIMessage): string {
  return message.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('\n')
    .trim();
}

function formatStreamError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'AI 调用失败，请稍后再试';
}

async function getChatAccess(chatId: string, userId: string) {
  const existing = await prisma.chat.findUnique({ where: { id: chatId } });

  if (!existing) {
    return { allowed: true, exists: false };
  }

  return { allowed: existing.userId === userId, exists: true };
}

async function createChatIfMissing(
  chatId: string,
  userId: string,
  title: string,
  exists: boolean,
) {
  if (exists) return;

  await prisma.chat.create({
    data: {
      id: chatId,
      userId,
      title,
    },
  });
}

async function saveMessage(chatId: string, message: AppUIMessage) {
  const content = getTextContent(message);
  const partsJson = JSON.stringify(message.parts);

  // message.id 由客户端提交，不能只按这个全局主键 upsert：攻击者如果猜到
  // 其他会话的消息 id，普通 upsert 的 update 分支会改写别人的消息。
  // 先把更新范围限制在当前 chat；不存在时再 create，跨 chat 的 id 冲突
  // 会由主键约束拒绝，而不会触碰原消息。
  const updated = await prisma.message.updateMany({
    where: { id: message.id, chatId },
    data: { content, partsJson },
  });

  if (updated.count === 0) {
    await prisma.message.create({
      data: {
        id: message.id,
        chatId,
        role: message.role,
        content,
        partsJson,
      },
    });
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: '请先使用 GitHub 登录' }, { status: 401 });
  }

  const userId = session.user.id;
  const parsedRequest = await parseChatRequest(request);

  if (!parsedRequest.ok) {
    return parsedRequest.response;
  }

  const { messages, id } = parsedRequest.body;
  const latestMessage = messages[messages.length - 1];

  // 这个接口代表“用户发起一次新的聊天请求”，所以最后一条消息必须来自 user。
  // 如果最后一条不是 user，通常说明客户端状态错乱或有人手写请求，直接 400，不扣额度。
  if (latestMessage.role !== 'user') {
    return Response.json(
      { error: '最后一条消息必须是用户消息' },
      { status: 400 },
    );
  }

  const chatId = id ?? crypto.randomUUID();
  const title = getTextContent(latestMessage).slice(0, 40) || '新对话';

  // 授权检查要早于限流扣次数：登录只能证明“你是谁”，这里还要证明
  // “这个 chat id 是否属于你”。非法访问返回 403，不应该消耗用户额度。
  const chatAccess = await getChatAccess(chatId, userId);

  if (!chatAccess.allowed) {
    return Response.json({ error: '无权访问该对话' }, { status: 403 });
  }

  // 从数据库读取用户的套餐，用于限流判断
  // 注意：session 里只存了 id，plan 字段需要单独查
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  const plan = user?.plan ?? 'free';

  // 限流检查：在调用 LLM 之前，先确认用户是否还有剩余配额
  // 这样超限时不会浪费 LLM Token
  const rateLimit = await checkUserRateLimit(userId, plan, {
    // 用户消息 id 同时是额度流水的幂等键。同一请求被浏览器或网关重试时，
    // 数据库唯一索引会阻止重复扣次数。
    requestId: latestMessage.id,
    chatId,
  });

  if (rateLimit.duplicate) {
    return Response.json(
      { error: '该请求正在处理或已经完成，请勿重复提交' },
      { status: 409 },
    );
  }

  if (!rateLimit.allowed) {
    // HTTP 429 = Too Many Requests
    return Response.json(
      {
        error: '请求过于频繁，请稍后再试',
        limit: rateLimit.limit,
        retryAfter: rateLimit.retryAfter, // 还需等待的秒数
        plan,
        upgradeHint: plan === 'free' ? '升级到 Pro 套餐可享受 200 次/小时' : undefined,
      },
      {
        status: 429,
        headers: {
          // 标准 HTTP 头，告诉客户端多少秒后可以重试
          'Retry-After': String(rateLimit.retryAfter),
        },
      },
    );
  }

  const quotaReservationId = rateLimit.reservationId;
  let quotaRefundPromise: Promise<void> | null = null;
  let streamFailed = false;

  async function refundQuotaOnce(reason: string) {
    if (!quotaReservationId) return;

    // 同一次 route invocation 里可能同时遇到 execute catch、error chunk、onError 兜底。
    // 共用同一个 promise 避免重复工作；数据库中的 RESERVED -> REFUNDED
    // 状态条件则负责跨实例、跨进程的真正幂等。
    quotaRefundPromise ??= refundUserRateLimit(
      userId,
      quotaReservationId,
      reason,
    )
      .then(refunded => {
        if (!refunded) {
          console.warn('Quota refund skipped', {
            reason,
            chatId,
            userId,
          });
        }
      })
      .catch(error => {
        // 退款失败不能再抛进 stream，否则用户会看到第二个错误；
        // QuotaUsage 会保留 RESERVED 状态，后续可以由补偿任务重新处理。
        console.error('Quota refund failed', {
          reason,
          chatId,
          userId,
          error,
        });
      });

    await quotaRefundPromise;
  }

  async function consumeQuota(reason: string) {
    if (!quotaReservationId) return;

    try {
      const consumed = await confirmUserQuotaUsage(
        userId,
        quotaReservationId,
        reason,
      );

      if (!consumed) {
        console.warn('Quota consumption finalization skipped', {
          reason,
          chatId,
          userId,
        });
      }
    } catch (error) {
      // 模型已经成功执行时，账本确认失败不能再给用户制造第二次流错误。
      // 留在 RESERVED 的流水可以被监控发现并由补偿任务确认。
      console.error('Quota consumption finalization failed', {
        reason,
        chatId,
        userId,
        error,
      });
    }
  }

  async function handleStreamFailure(reason: string) {
    streamFailed = true;
    await refundQuotaOnce(reason);
  }

  function handleStreamError(error: unknown): string {
    // createUIMessageStream 的 onError 是同步回调，不能 await。
    // 主 agent stream 的 error chunk 会在 execute 里 await；这里兜底处理
    // SDK 后台 merge、subagent merge、stream 状态机等更外层错误。
    void handleStreamFailure('agent_stream_error');
    return formatStreamError(error);
  }

  // 到这里才真正创建新会话和保存用户消息：请求格式、资源归属、额度都已经通过。
  try {
    await createChatIfMissing(chatId, userId, title, chatAccess.exists);
    await saveMessage(chatId, latestMessage);
  } catch (error) {
    await refundQuotaOnce('request_persist_failed');
    console.error('Failed to persist chat request', {
      chatId,
      userId,
      error,
    });

    return Response.json(
      { error: '保存聊天消息失败，请稍后再试' },
      { status: 500 },
    );
  }

  const stream = createUIMessageStream<AppUIMessage>({
    originalMessages: messages,
    execute: async ({ writer }) => {
      try {
        // experimental_context 由 agent 透传给所有 tool。
        // subagent-as-tool 的 execute 会通过 ctx.writer 把自己的 UI stream
        // merge 到这个主 writer。
        const agent = createRootAgent({ writer });

        const modelMessages = await convertToModelMessages(messages);

        const result = await agent.stream({
          messages: modelMessages,
        });

        const reader = result
          .toUIMessageStream<AppUIMessage>({
            onError: formatStreamError,
          })
          .getReader();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // AI SDK 有些 provider/stream 错误不会 throw，而是变成 error chunk。
            // 先退回预占额度，再把错误转发给前端；这样失败请求不会白扣次数。
            if (value.type === 'error') {
              await handleStreamFailure('agent_error_chunk');
            }

            writer.write(value);
          }
        } finally {
          reader.releaseLock();
        }
      } catch (error) {
        await handleStreamFailure('agent_stream_failed');
        throw error;
      }
    },
    onFinish: async ({ responseMessage, isAborted }) => {
      // 用户主动 abort 时，模型可能已经消耗了上游 token，也可能已经输出了部分内容；
      // 当前产品规则仍然计费，但在流水里单独记录原因，后续可以据数据调整规则。
      if (streamFailed) return;

      if (isAborted) {
        await consumeQuota('user_aborted');
        return;
      }

      await consumeQuota('response_completed');
      await saveMessage(chatId, responseMessage);
    },
    onError: handleStreamError,
  });

  return createUIMessageStreamResponse({ stream });
}
