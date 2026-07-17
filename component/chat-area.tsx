'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { signIn, useSession } from 'next-auth/react';
import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ChatInput from '@/component/chat-input';
import TrendingView from '@/component/trending-view';
import PaperView from '@/component/paper-view';
import ResearchDisclaimer from '@/component/research-disclaimer';
import AgentTimeline from '@/component/agent-timeline';
import { useStickToBottom } from '@/lib/use-stick-to-bottom';
import type { AppUIMessage } from '@/agent/ui-messages';

const SUGGESTIONS = [
  '最近 24 小时最火的 AI 项目，用中文总结',
  '本周 TypeScript 趋势仓库，挑 5 个深度点评',
  '帮我调研近 1 年视频生成扩散模型方向的 arXiv 论文',
  '最新的 3D 高斯泼溅（Gaussian Splatting）有哪些新工作？',
];

function formatRetryAfter(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 60) return `${Math.max(1, Math.ceil(value))} 秒`;
  return `${Math.ceil(value / 60)} 分钟`;
}

function buildChatErrorMessage(payload: unknown, status: number): string {
  if (!payload || typeof payload !== 'object') {
    return `请求失败（${status}）`;
  }

  const data = payload as {
    error?: unknown;
    retryAfter?: unknown;
    upgradeHint?: unknown;
  };

  const retryAfter = formatRetryAfter(data.retryAfter);
  const parts = [
    typeof data.error === 'string' ? data.error : `请求失败（${status}）`,
    retryAfter ? `请约 ${retryAfter} 后再试` : null,
    typeof data.upgradeHint === 'string' ? data.upgradeHint : null,
  ].filter(Boolean);

  return parts.join('。');
}

async function chatFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);

  if (response.ok) return response;

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = await response
      .clone()
      .json()
      .catch(() => null);
    throw new Error(buildChatErrorMessage(payload, response.status));
  }

  const text = await response
    .clone()
    .text()
    .catch(() => '');
  throw new Error(text.trim() || `请求失败（${response.status}）`);
}

interface ChatAreaProps {
  chatId: string;
  initialMessages: AppUIMessage[];
  // 第一条消息发出后回调，通知侧边栏刷新列表
  onFirstMessage?: () => void;
  // 请求完成或失败后回调，通知侧边栏刷新额度
  onRequestSettled?: () => void;
}

export default function ChatArea({
  chatId,
  initialMessages,
  onFirstMessage,
  onRequestSettled,
}: ChatAreaProps) {
  const { status: authStatus } = useSession();
  const transport = useMemo(
    () =>
      new DefaultChatTransport<AppUIMessage>({
        fetch: chatFetch,
      }),
    [],
  );
  const {
    status: chatStatus,
    sendMessage,
    messages,
    stop,
    error,
    clearError,
  } = useChat<AppUIMessage>({
    id: chatId,
    messages: initialMessages,
    transport,
    onFinish: () => {
      onRequestSettled?.();
    },
    onError: () => {
      onRequestSettled?.();
    },
    // AI SDK 会把 id 放进 POST body，后端 route.ts 里的 const { messages, id } = await request.json() 能读到
  });
  const { contentRef, isAtBottom, scrollToBottom } =
    useStickToBottom<HTMLDivElement>();

  const isBusy = chatStatus === 'streaming' || chatStatus === 'submitted';
  const isAuthLoading = authStatus === 'loading';
  const isAuthenticated = authStatus === 'authenticated';
  const canSend = isAuthenticated && !isAuthLoading;
  const isEmpty = messages.length === 0;
  const inputPlaceholder = isAuthenticated
    ? '例如：最近 24 小时最火的 AI 项目，用中文总结'
    : '登录后即可发送消息';

  function handleSend(text: string) {
    if (!canSend) return;
    clearError();
    // 如果是这个对话的第一条消息，通知父组件刷新侧边栏列表
    if (messages.length === 0) {
      onFirstMessage?.();
    }
    sendMessage({ text });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 消息列表区域：flex-1 + overflow-y-auto 实现内部滚动 */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {isAuthLoading && (
            <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500">
              正在确认登录状态…
            </div>
          )}

          {!isAuthLoading && !isAuthenticated && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="font-medium">请先登录后再开始对话</div>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                聊天记录、工具调用结果和限流配额都绑定到你的 GitHub 账号。
              </p>
              <button
                type="button"
                onClick={() => signIn('github')}
                className="mt-3 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700"
              >
                使用 GitHub 登录
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <div className="font-medium">请求没有成功</div>
              <p className="mt-1 text-xs leading-relaxed">{error.message}</p>
              <button
                type="button"
                onClick={clearError}
                className="mt-3 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
              >
                我知道了
              </button>
            </div>
          )}

          {isEmpty && (
            <div className="mb-6 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  disabled={!canSend || isBusy}
                  onClick={() => handleSend(s)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((message, msgIdx) => {
            const isLastMessage = msgIdx === messages.length - 1;
            const hasPaperResults =
              message.role === 'assistant' &&
              message.parts.some(
                p =>
                  p.type === 'tool-paper_search' &&
                  p.state === 'output-available' &&
                  p.output.state === 'ready' &&
                  p.output.count > 0,
              );
            const showResearchDisclaimer =
              hasPaperResults && (!isLastMessage || !isBusy);
            const agentEvents =
              message.role === 'assistant'
                ? message.parts
                    .filter(part => part.type === 'data-agent-event')
                    .map(part => part.data)
                : [];

            return (
              <div
                key={message.id}
                className={
                  message.role === 'user'
                    ? 'self-end max-w-[85%] rounded-2xl bg-zinc-900 px-4 py-2 text-white'
                    : 'self-stretch'
                }
              >
                {message.role === 'assistant' && (
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Agent
                  </div>
                )}
                <AgentTimeline events={agentEvents} />
                {message.parts.map((part, i) => {
                  switch (part.type) {
                    case 'text':
                      return message.role === 'user' ? (
                        <div key={i} className="whitespace-pre-wrap text-sm">
                          {part.text}
                        </div>
                      ) : (
                        <div
                          key={i}
                          className="prose prose-sm max-w-none prose-zinc prose-a:text-blue-600"
                        >
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ href, children }) => (
                                <a href={href} target="_blank" rel="noreferrer">
                                  {children}
                                </a>
                              ),
                            }}
                          >
                            {part.text}
                          </ReactMarkdown>
                        </div>
                      );

                    case 'step-start':
                      return i > 0 ? (
                        <hr
                          key={i}
                          className="my-3 border-dashed border-zinc-200"
                        />
                      ) : null;

                    case 'tool-trending':
                      return <TrendingView key={i} invocation={part} />;

                    case 'tool-paper_search':
                      return <PaperView key={i} invocation={part} />;

                    case 'data-agent-event':
                      // 所有事件在上方统一排序展示，避免 data part 混进正文和工具卡片。
                      return null;
                  }
                })}

                {showResearchDisclaimer && <ResearchDisclaimer />}
              </div>
            );
          })}

          {isBusy && (
            <div className="text-xs text-zinc-400">Agent 执行中…</div>
          )}
        </div>
      </div>

      {/* 回到底部按钮 */}
      {!isAtBottom && !isEmpty && (
        <div className="relative">
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="回到底部"
            className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-md hover:bg-zinc-50"
          >
            ↓ 回到底部
          </button>
        </div>
      )}

      {/* 输入框：不再 fixed，吸附在 ChatArea 底部 */}
      <ChatInput
        status={chatStatus}
        onSubmit={handleSend}
        stop={stop}
        disabled={!canSend}
        placeholder={inputPlaceholder}
      />
    </div>
  );
}
