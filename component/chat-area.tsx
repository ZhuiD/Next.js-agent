'use client';

import { useChat } from '@ai-sdk/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ChatInput from '@/component/chat-input';
import TrendingView from '@/component/trending-view';
import PaperView from '@/component/paper-view';
import ResearchDisclaimer from '@/component/research-disclaimer';
import { useStickToBottom } from '@/lib/use-stick-to-bottom';
import type { AppUIMessage } from '@/agent/ui-messages';

const SUGGESTIONS = [
  '最近 24 小时最火的 AI 项目，用中文总结',
  '本周 TypeScript 趋势仓库，挑 5 个深度点评',
  '帮我调研近 1 年视频生成扩散模型方向的 arXiv 论文',
  '最新的 3D 高斯泼溅（Gaussian Splatting）有哪些新工作？',
];

interface ChatAreaProps {
  chatId: string;
  initialMessages: AppUIMessage[];
  // 第一条消息发出后回调，通知侧边栏刷新列表
  onFirstMessage?: () => void;
}

export default function ChatArea({
  chatId,
  initialMessages,
  onFirstMessage,
}: ChatAreaProps) {
  const { status, sendMessage, messages, stop } = useChat<AppUIMessage>({
    id: chatId,
    messages: initialMessages,
    // AI SDK 会把 id 放进 POST body，后端 route.ts 里的 const { messages, id } = await request.json() 能读到
  });
  const { contentRef, isAtBottom, scrollToBottom } =
    useStickToBottom<HTMLDivElement>();

  const isBusy = status === 'streaming' || status === 'submitted';
  const isEmpty = messages.length === 0;

  function handleSend(text: string) {
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
          {isEmpty && (
            <div className="mb-6 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSend(s)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
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
                  }
                })}

                {showResearchDisclaimer && <ResearchDisclaimer />}
              </div>
            );
          })}

          {isBusy && (
            <div className="text-xs text-zinc-400">Agent 思考中…</div>
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
      <ChatInput status={status} onSubmit={handleSend} stop={stop} />
    </div>
  );
}
