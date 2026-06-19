import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// 阿里云百炼 (DashScope) 提供 OpenAI 兼容接口
// 文档: https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope
//
// 注意：必须用 @ai-sdk/openai-compatible 而不是 @ai-sdk/openai。
// 后者在新版默认走 OpenAI 的 Responses API (/v1/responses)，
// DashScope 兼容层只支持 Chat Completions API (/v1/chat/completions)，
// 否则多轮带工具结果的对话会报 "tool must be one of user,assistant,system,function"。
const dashscope = createOpenAICompatible({
  name: 'dashscope',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.DASHSCOPE_API_KEY,
});

const dashscopeModel = process.env.DASHSCOPE_MODEL;

if (!dashscopeModel) {
  throw new Error('DASHSCOPE_MODEL is required');
}

export const chatModel = dashscope(dashscopeModel);
