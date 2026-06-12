import { trendingAgent } from '@/agent/trending-agent';
import { createAgentUIStreamResponse } from 'ai';

// 长一些的超时，给 LLM + scraping 留余地
export const maxDuration = 60;

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentUIStreamResponse({
    agent: trendingAgent,
    uiMessages: messages,
  });
}
