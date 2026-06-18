import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// 通用 OpenAI 兼容 Provider。
// 默认：阿里云百炼 (DashScope) qwen-plus
// 可通过环境变量切换到其他 provider：
//   LLM_API_KEY   — API Key
//   LLM_BASE_URL  — Base URL
//   LLM_MODEL     — 模型名
//
// DeepSeek:  LLM_BASE_URL=https://api.deepseek.com/v1  LLM_MODEL=deepseek-chat
// OpenAI:    LLM_BASE_URL=https://api.openai.com/v1     LLM_MODEL=gpt-4o
const provider = createOpenAICompatible({
  name: 'llm',
  baseURL:
    process.env.LLM_BASE_URL ??
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.LLM_API_KEY ?? process.env.DASHSCOPE_API_KEY,
});

export const chatModel = provider(process.env.LLM_MODEL ?? 'qwen-plus');
