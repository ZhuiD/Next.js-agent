import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
} from 'ai';
import { createRootAgent } from '@/agent/root-agent';
import type { AppUIMessage } from '@/agent/ui-messages';

// 长一些的超时，给 LLM + subagent + scraping/arxiv 留余地
export const maxDuration = 60;

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = createUIMessageStream<AppUIMessage>({
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
  });

  return createUIMessageStreamResponse({ stream });
}
