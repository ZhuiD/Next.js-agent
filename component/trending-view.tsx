import type { TrendingUIToolInvocation } from '@/tool/trending-tool';

function Stars({ count, label }: { count: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-amber-600">
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
      </svg>
      <span className="tabular-nums">{count.toLocaleString()}</span>
      {label ? <span className="text-zinc-500 text-xs">{label}</span> : null}
    </span>
  );
}

export default function TrendingView({
  invocation,
}: {
  invocation: TrendingUIToolInvocation;
}) {
  switch (invocation.state) {
    case 'input-streaming':
      return (
        <div className="my-2 rounded-md border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500">
          准备调用 GitHub Trending 工具…
        </div>
      );

    case 'input-available': {
      const { since, language, limit } = invocation.input;
      return (
        <div className="my-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          正在抓取 GitHub Trending（
          <code>since={since}</code>
          {language ? <code className="ml-1">language={language}</code> : null}
          {limit ? <code className="ml-1">limit={limit}</code> : null}
          ）…
        </div>
      );
    }

    case 'output-available': {
      const output = invocation.output;
      if (output.state === 'loading') {
        return (
          <div className="my-2 text-xs text-zinc-500">正在抓取数据…</div>
        );
      }
      if (output.state === 'error') {
        return (
          <div className="my-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            抓取失败：{output.message}
          </div>
        );
      }
      return (
        <div className="my-3">
          <div className="mb-2 text-xs text-zinc-500">
            共 <strong>{output.count}</strong> 个仓库
            {output.language ? `（语言：${output.language}）` : ''}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {output.repos.map(r => (
              <a
                key={r.fullName}
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-zinc-200 bg-white p-3 transition hover:border-zinc-400 hover:shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="truncate font-mono text-sm font-semibold text-blue-700">
                    {r.fullName}
                  </div>
                  {r.starsInRange > 0 && (
                    <Stars count={r.starsInRange} label={r.rangeLabel} />
                  )}
                </div>
                {r.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-600">
                    {r.description}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                  {r.language && (
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: r.languageColor ?? '#888',
                        }}
                      />
                      {r.language}
                    </span>
                  )}
                  <Stars count={r.stars} />
                  <span>fork {r.forks.toLocaleString()}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      );
    }

    case 'output-error':
      return (
        <div className="my-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          工具调用出错：{invocation.errorText}
        </div>
      );
  }
}
