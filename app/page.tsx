'use client';

import { useState } from 'react';
import ChatSidebar from '@/component/chat-sidebar';
import ChatArea from '@/component/chat-area';
import type { AppUIMessage } from '@/agent/ui-messages';

export default function Page() {
  // 当前对话的 ID，初始生成一个新的 UUID 用于新对话
  const [chatId, setChatId] = useState(() => crypto.randomUUID());

  // 切换对话时加载进来的历史消息
  const [initialMessages, setInitialMessages] = useState<AppUIMessage[]>([]);

  // chatKey 变化会强制 ChatArea 重新挂载，从而让 useChat 用新的 id + initialMessages 初始化
  const [chatKey, setChatKey] = useState(0);

  // 两类刷新分开：会话列表不需要每次请求结束都重拉，额度则需要。
  const [conversationRefresh, setConversationRefresh] = useState(0);
  const [quotaRefresh, setQuotaRefresh] = useState(0);

  // 点击侧边栏历史对话
  async function handleSelectChat(id: string) {
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return;

    const data = await res.json();

    // data.messages 是后端返回的 { id, role, parts, content, createdAt }[]
    // useChat 的 initialMessages 需要 AppUIMessage 格式：{ id, role, parts }
    const messages: AppUIMessage[] = data.messages.map(
      (m: { id: string; role: string; parts: AppUIMessage['parts'] }) => ({
        id: m.id,
        role: m.role as AppUIMessage['role'],
        parts: m.parts,
      }),
    );

    setInitialMessages(messages);
    setChatId(id);
    setChatKey(k => k + 1); // 强制重新挂载 ChatArea
  }

  // 点击"新对话"
  function handleNewChat() {
    setInitialMessages([]);
    setChatId(crypto.randomUUID());
    setChatKey(k => k + 1);
  }

  // ChatArea 发出第一条消息后通知侧边栏刷新
  function handleFirstMessage() {
    setConversationRefresh(n => n + 1);
  }

  function handleRequestSettled() {
    setQuotaRefresh(n => n + 1);
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <ChatSidebar
        selectedId={chatId}
        onSelect={handleSelectChat}
        onNewChat={handleNewChat}
        conversationRefreshTrigger={conversationRefresh}
        quotaRefreshTrigger={quotaRefresh}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* 顶部标题栏 */}
        <header className="flex-shrink-0 border-b border-zinc-200 bg-white px-6 py-4">
          <h1 className="text-base font-semibold tracking-tight">
            GitTrendInsight & Research Agent
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            一句话告诉我：你想看 GitHub 趋势，还是想做某个方向的文献调研。
          </p>
        </header>

        {/* 对话区域：key 变化时强制重新挂载 */}
        <ChatArea
          key={chatKey}
          chatId={chatId}
          initialMessages={initialMessages}
          onFirstMessage={handleFirstMessage}
          onRequestSettled={handleRequestSettled}
        />
      </main>
    </div>
  );
}
