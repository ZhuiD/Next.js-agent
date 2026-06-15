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

export default function Page() {
  const { status, sendMessage, messages, stop } =
    useChat<AppUIMessage>();
  const { contentRef, isAtBottom, scrollToBottom } =
    useStickToBottom<HTMLDivElement>();

  const isBusy = status === 'streaming' || status === 'submitted';
  const isEmpty = messages.length === 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-32 pt-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          GitTrendInsight & Research Agent
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          一句话告诉我：你想看 GitHub 趋势，还是想做某个方向的文献调研。
        </p>
      </header>

      {isEmpty && (
        <div className="mb-6 grid gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => sendMessage({ text: s })}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div ref={contentRef} className="flex flex-col gap-6">
        {messages.map((message, msgIdx) => {
          const isLastMessage = msgIdx === messages.length - 1;
          // 只在"已经成功展示了 paper_search 结果"的 assistant 消息末尾追加调研须知。
          // 工具仍在 loading / 报错 / 用户消息 都不显示。
          // 且：如果这是最后一条消息且 agent 还在流式输出，等输出完再显示，避免观感跳跃。
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

      <ChatInput
        status={status}
        onSubmit={text => sendMessage({ text })}
        stop={stop}
      />

      {/* 用户脱离底部时显示"回到底部"浮动按钮；位置悬浮在输入框正上方 */}
      {!isAtBottom && !isEmpty && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="回到底部"
          className="fixed bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-md hover:bg-zinc-50"
        >
          ↓ 回到底部
        </button>
      )}
    </main>
  );
}
