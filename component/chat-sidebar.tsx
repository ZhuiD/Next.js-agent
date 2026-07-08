'use client';

import { useEffect, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';

interface Conversation {
  id: string;
  title: string | null;
  updatedAt: string;
}

interface MeResponse {
  user: {
    plan: string;
  };
  quota: {
    limit: number | null;
    remaining: number | null;
    unlimited: boolean;
    resetAt: string | null;
  };
  model: string | null;
  message?: string;
}

interface ChatSidebarProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  // 新对话第一次发送后刷新历史列表。
  conversationRefreshTrigger?: number;
  // 聊天请求结束后刷新剩余额度。
  quotaRefreshTrigger?: number;
}

export default function ChatSidebar({
  selectedId,
  onSelect,
  onNewChat,
  conversationRefreshTrigger,
  quotaRefreshTrigger,
}: ChatSidebarProps) {
  const { data: session, status } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [upgradeCode, setUpgradeCode] = useState('');
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeStatus, setUpgradeStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // 拉取历史对话列表
  async function fetchConversations() {
    const res = await fetch('/api/conversations');
    if (res.ok) {
      const data = await res.json();
      setConversations(data);
    }
  }

  // 拉取当前用户信息和额度。这个接口只读额度，不会消耗请求次数。
  async function fetchMe() {
    const res = await fetch('/api/me');
    if (res.ok) {
      const data = await res.json();
      setMe(data);
    }
  }

  function formatResetAt(value: string | null) {
    if (!value) return '发送后开始计时';

    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  function renderQuotaText() {
    if (!me) return '额度加载中';
    if (me.quota.unlimited) return '不限额度';
    return `剩余 ${me.quota.remaining ?? 0}/${me.quota.limit ?? 0} 次`;
  }

  async function handleUpgrade(e: React.FormEvent) {
    e.preventDefault();

    const code = upgradeCode.trim();
    if (!code || isUpgrading) return;

    setIsUpgrading(true);
    setUpgradeStatus(null);

    try {
      const res = await fetch('/api/account/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok) {
        setMe(data);
        setUpgradeCode('');
        setUpgradeStatus({ type: 'success', text: data?.message ?? '升级成功' });
      } else {
        setUpgradeStatus({ type: 'error', text: data?.error ?? '升级失败' });
      }
    } catch {
      setUpgradeStatus({ type: 'error', text: '网络异常，请稍后再试' });
    } finally {
      setIsUpgrading(false);
    }
  }

  // 登录后，或新对话创建后，重新拉取历史列表。
  useEffect(() => {
    if (session?.user) {
      fetchConversations();
    } else {
      setConversations([]);
      setUpgradeCode('');
      setUpgradeStatus(null);
    }
  }, [session?.user, conversationRefreshTrigger]);

  // 登录后，或一次聊天请求结束后，重新拉取额度。
  useEffect(() => {
    if (session?.user) {
      fetchMe();
    } else {
      setMe(null);
      setUpgradeCode('');
      setUpgradeStatus(null);
    }
  }, [session?.user, quotaRefreshTrigger]);

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
          <div className="space-y-2">
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-zinc-700">
                  {me?.user.plan ?? 'free'}
                </span>
                <span className="text-zinc-500">{renderQuotaText()}</span>
              </div>
              {!me?.quota.unlimited && (
                <div className="mt-1 text-[11px] text-zinc-400">
                  重置：{formatResetAt(me?.quota.resetAt ?? null)}
                </div>
              )}
              {me?.model && (
                <div className="mt-1 truncate text-[11px] text-zinc-400">
                  模型：{me.model}
                </div>
              )}

              {me && me.user.plan !== 'admin' && (
                <form onSubmit={handleUpgrade} className="mt-2 flex gap-1.5">
                  <input
                    value={upgradeCode}
                    onChange={e => setUpgradeCode(e.target.value)}
                    placeholder="升级码"
                    disabled={isUpgrading}
                    className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1 text-xs outline-none focus:border-zinc-400 disabled:bg-zinc-100"
                  />
                  <button
                    type="submit"
                    disabled={upgradeCode.trim() === '' || isUpgrading}
                    className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
                  >
                    升级
                  </button>
                </form>
              )}

              {upgradeStatus && (
                <div
                  className={`mt-1 text-[11px] ${
                    upgradeStatus.type === 'success'
                      ? 'text-emerald-600'
                      : 'text-red-500'
                  }`}
                >
                  {upgradeStatus.text}
                </div>
              )}
            </div>

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
          </div>
        )}
      </div>
    </aside>
  );
}
