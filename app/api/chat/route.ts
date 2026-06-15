import { createTrendingAgent } from '@/agent/trending-agent';
import { createAgentUIStreamResponse } from 'ai';

// 长一些的超时，给 LLM + scraping 留余地
export const maxDuration = 60;

export async function POST(request: Request) {
  const { messages } = await request.json();

  // 每次请求重建 agent，确保 system prompt 里的"今天"用的是真实当前日期，
  // 而不是模块加载时（可能是几小时前）冻结的时间。
  const agent = createTrendingAgent();

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
  });
}
