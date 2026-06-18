import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
} from 'ai';
import { auth } from '@/auth';
import { createRootAgent } from '@/agent/root-agent';
import type { AppUIMessage } from '@/agent/ui-messages';
import { prisma } from '@/lib/prisma';

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
