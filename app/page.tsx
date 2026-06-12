'use client';

import { useChat } from '@ai-sdk/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ChatInput from '@/component/chat-input';
import TrendingView from '@/component/trending-view';
import type { TrendingAgentUIMessage } from '@/agent/trending-agent';

const SUGGESTIONS = [
  '最近 24 小时最火的 AI 项目，用中文总结',
  '本周 TypeScript 趋势仓库，挑 5 个深度点评',
  '这个月 Rust 生态有什么值得关注的新项目？',
  '今天 Python 趋势里，哪些和大模型 Agent 相关？',
];

export default function Page() {
  const { status, sendMessage, messages, stop } =
    useChat<TrendingAgentUIMessage>();

  const isBusy = status === 'streaming' || status === 'submitted';
  const isEmpty = messages.length === 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-32 pt-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          GitTrendInsight Agent
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          用一句话告诉我你想了解什么，我会抓取 GitHub Trending 并生成中文洞察报告。
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

      <div className="flex flex-col gap-6">
        {messages.map(message => (
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
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
              }
            })}
          </div>
        ))}

        {isBusy && (
          <div className="text-xs text-zinc-400">Agent 思考中…</div>
        )}
      </div>

      <ChatInput
        status={status}
        onSubmit={text => sendMessage({ text })}
        stop={stop}
      />
    </main>
  );
}
