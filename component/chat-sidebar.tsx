'use client';

import { useEffect, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';

interface Conversation {
  id: string;
  title: string | null;
  updatedAt: string;
}

interface ChatSidebarProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  // 外部可调用 refresh 触发重新拉取列表（如发了第一条消息后）
  refreshTrigger?: number;
}

export default function ChatSidebar({
  selectedId,
  onSelect,
  onNewChat,
  refreshTrigger,
}: ChatSidebarProps) {
  const { data: session, status } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // 拉取历史对话列表
  async function fetchConversations() {
    const res = await fetch('/api/conversations');
    if (res.ok) {
      const data = await res.json();
      setConversations(data);
    }
  }

  // 登录后 或 refreshTrigger 变化时重新拉取
  useEffect(() => {
    if (session?.user) {
      fetchConversations();
    } else {
      setConversations([]);
    }
  }, [session?.user, refreshTrigger]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    // 阻止事件冒泡，避免同时触发 onSelect
    e.stopPropagation();

    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });

    // 如果删的是当前打开的对话，切回新对话
    if (id === selectedId) {
      onNewChat();
    }

    // 刷新列表
    fetchConversations();
  }

  return (
    <aside className="flex w-60 flex-shrink-0 flex-col border-r border-zinc-200 bg-zinc-50">
      {/* 顶部：新建对话按钮 */}
      <div className="p-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-200"
        >
          <span className="text-base leading-none">+</span>
          新对话
        </button>
      </div>

      <div className="mx-3 border-t border-zinc-200" />

      {/* 中间：对话列表 */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {status === 'loading' && (
          <p className="px-3 py-2 text-xs text-zinc-400">加载中…</p>
        )}

        {status === 'unauthenticated' && (
          <p className="px-3 py-4 text-center text-xs text-zinc-400">
            登录后查看历史对话
          </p>
        )}

        {status === 'authenticated' && conversations.length === 0 && (
          <p className="px-3 py-2 text-xs text-zinc-400">暂无历史对话</p>
        )}

        {conversations.map(conv => (
          <div
            key={conv.id}
            className="group relative"
            onMouseEnter={() => setHoveredId(conv.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <button
              type="button"
              onClick={() => onSelect(conv.id)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                selectedId === conv.id
                  ? 'bg-zinc-200 font-medium text-zinc-900'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <span className="block truncate pr-5">
                {conv.title ?? '未命名对话'}
              </span>
            </button>

            {/* 删除按钮：hover 时显示 */}
            {hoveredId === conv.id && (
              <button
                type="button"
                onClick={e => handleDelete(e, conv.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 transition hover:bg-red-100 hover:text-red-500"
                aria-label="删除对话"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </nav>

      <div className="mx-3 border-t border-zinc-200" />

      {/* 底部：用户信息 */}
      <div className="p-3">
        {status === 'unauthenticated' && (
          <button
            type="button"
            onClick={() => signIn('github')}
            className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            使用 GitHub 登录
          </button>
        )}

        {status === 'authenticated' && session?.user && (
          <div className="flex items-center gap-2">
            {session.user.image && (
              <img
                src={session.user.image}
                alt={session.user.name ?? '用户头像'}
                className="h-7 w-7 flex-shrink-0 rounded-full"
              />
            )}
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-600">
              {session.user.name ?? session.user.email ?? '已登录'}
            </span>
            <button
              type="button"
              onClick={() => signOut()}
              className="flex-shrink-0 rounded px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-200"
              aria-label="登出"
            >
              登出
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
