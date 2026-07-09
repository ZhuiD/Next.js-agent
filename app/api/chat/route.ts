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
import { checkUserRateLimit } from '@/lib/user-rate-limit';

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

  await prisma.message.upsert({
    where: { id: message.id },
    update: {
      content,
      partsJson: JSON.stringify(message.parts),
    },
    create: {
      id: message.id,
      chatId,
      role: message.role,
      content,
      partsJson: JSON.stringify(message.parts),
    },
  });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: '请先使用 GitHub 登录' }, { status: 401 });
  }

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
  const chatAccess = await getChatAccess(chatId, session.user.id);

  if (!chatAccess.allowed) {
    return Response.json({ error: '无权访问该对话' }, { status: 403 });
  }

  // 从数据库读取用户的套餐，用于限流判断
  // 注意：session 里只存了 id，plan 字段需要单独查
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  });
  const plan = user?.plan ?? 'free';

  // 限流检查：在调用 LLM 之前，先确认用户是否还有剩余配额
  // 这样超限时不会浪费 LLM Token
  const rateLimit = await checkUserRateLimit(session.user.id, plan);

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

  // 到这里才真正创建新会话和保存用户消息：请求格式、资源归属、额度都已经通过。
  await createChatIfMissing(chatId, session.user.id, title, chatAccess.exists);
  await saveMessage(chatId, latestMessage);

  const stream = createUIMessageStream<AppUIMessage>({
    originalMessages: messages,
    execute: async ({ writer }) => {
      // experimental_context 由 agent 透传给所有 tool。
      // subagent-as-tool 的 execute 会通过 ctx.writer 把自己的 UI stream
      // merge 到这个主 writer。
      const agent = createRootAgent({ writer });

      const modelMessages = await convertToModelMessages(messages);

      const result = await agent.stream({
        messages: modelMessages,
      });

      // 把主 agent 自己的 stream 也 merge 进去（路由文本 + tool calls + finish）。
      writer.merge(result.toUIMessageStream());
    },
    onFinish: async ({ responseMessage, isAborted }) => {
      if (!isAborted) {
        await saveMessage(chatId, responseMessage);
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
