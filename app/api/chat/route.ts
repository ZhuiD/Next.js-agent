import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
} from 'ai';
import { auth } from '@/auth';
import { createRootAgent } from '@/agent/root-agent';
import type { AppUIMessage } from '@/agent/ui-messages';
import { prisma } from '@/lib/prisma';
import { checkUserRateLimit } from '@/lib/user-rate-limit';

// 长一些的超时，给 LLM + subagent + scraping/arxiv 留余地
export const maxDuration = 60;

function getTextContent(message: AppUIMessage): string {
  return message.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('\n')
    .trim();
}

async function ensureUserChat(chatId: string, userId: string, title: string) {
  const existing = await prisma.chat.findUnique({ where: { id: chatId } });

  if (existing) {
    if (existing.userId !== userId) {
      return null;
    }

    return existing;
  }

  return prisma.chat.create({
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

  const { messages, id } = (await request.json()) as {
    messages: AppUIMessage[];
    id?: string;
  };

  const chatId = id ?? crypto.randomUUID();
  const latestUserMessage = [...messages]
    .reverse()
    .find(message => message.role === 'user');
  const title = latestUserMessage
    ? getTextContent(latestUserMessage).slice(0, 40) || '新对话'
    : '新对话';

  const chat = await ensureUserChat(chatId, session.user.id, title);

  if (!chat) {
    return Response.json({ error: '无权访问该对话' }, { status: 403 });
  }

  if (latestUserMessage) {
    await saveMessage(chatId, latestUserMessage);
  }

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
