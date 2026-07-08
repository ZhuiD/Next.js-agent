'use client';

import { signIn, signOut, useSession } from 'next-auth/react';

export default function UserAuth() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <div className="text-sm text-zinc-400">加载登录状态…</div>;
  }

  if (!session?.user) {
    return (
      <button
        type="button"
        onClick={() => signIn('github')}
        className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
      >
        使用 GitHub 登录
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {session.user.image && (
        <img
          src={session.user.image}
          alt={session.user.name ?? '用户头像'}
          className="h-8 w-8 rounded-full"
        />
      )}
      <span className="max-w-36 truncate text-sm text-zinc-700">
        {session.user.name ?? session.user.email ?? '已登录'}
      </span>
      <button
        type="button"
        onClick={() => signOut()}
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100"
      >
        登出
      </button>
    </div>
  );
}
