import { createOpenAI } from '@ai-sdk/openai';

// 阿里云百炼平台 (DashScope) 提供 OpenAI 兼容接口
// 文档: https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope
const dashscope = createOpenAI({
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.DASHSCOPE_API_KEY,
});

// qwen-plus: 工具调用稳定 & 速度较快，新用户有免费额度
// 想换更强模型可改为 'qwen-max'；想要更便宜可改 'qwen-turbo'
export const chatModel = dashscope(process.env.DASHSCOPE_MODEL ?? 'qwen-plus');
