import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthPayload } from './jwt';

/**
 * 请求级用户上下文，类似 Java ThreadLocal。
 * 每个 HTTP 请求在 runWithAuth() 内独立绑定，并发请求互不干扰。
 */
export const authContext = new AsyncLocalStorage<AuthPayload>();

/** 在当前 async 链任意深度读取已登录用户；未鉴权或未在 run 内调用时返回 undefined */
export function getCurrentUser(): AuthPayload | undefined {
  return authContext.getStore();
}
