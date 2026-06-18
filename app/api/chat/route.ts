import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
} from 'ai';
import { createRootAgent } from '@/agent/root-agent';
import type { AppUIMessage } from '@/agent/ui-messages';
import { authContext } from '@/lib/auth/context';
import { runWithAuth } from '@/lib/auth/with-auth';

// 长一些的超时，给 LLM + subagent + scraping/arxiv 留余地
export const maxDuration = 60;
export const runtime = 'nodejs';

export async function POST(request: Request) {
  return runWithAuth(request, async session => {
    const { messages } = await request.json();

    const stream = createUIMessageStream<AppUIMessage>({
      execute: async ({ writer }) => {
        // 流式 execute 可能在独立 async 上下文触发，再 bind 一次确保 getCurrentUser() 可用
        await authContext.run(session, async () => {
          const agent = createRootAgent({ writer });

          const modelMessages = await convertToModelMessages(messages);

          const result = await agent.stream({
            messages: modelMessages,
          });

          writer.merge(result.toUIMessageStream());
        });
      },
    });

    return createUIMessageStreamResponse({ stream });
  });
}
