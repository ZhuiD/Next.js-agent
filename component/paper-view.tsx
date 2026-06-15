import type {
  PaperSearchUIToolInvocation,
  UnifiedPaper,
} from '@/tool/paper-search-tool';

function PaperCard({ paper }: { paper: UnifiedPaper }) {
  const venueLine = [paper.category, paper.year].filter(Boolean).join(' · ');
  const authorLine =
    paper.authors.length > 4
      ? `${paper.authors.slice(0, 4).join(', ')} 等 ${paper.authors.length} 人`
      : paper.authors.join(', ');

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 transition hover:border-zinc-400 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <a
          href={paper.url}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          {paper.title}
        </a>
        <span className="inline-flex shrink-0 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-700">
          arXiv
        </span>
      </div>

      {authorLine && (
        <div className="mt-1 text-xs text-zinc-500">{authorLine}</div>
      )}

      {paper.tldr && (
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-zinc-600">
          {paper.tldr}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        {venueLine && <span className="text-zinc-600">{venueLine}</span>}
        {paper.pdfUrl && (
          <a
            href={paper.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline"
          >
            PDF
          </a>
        )}
        <a
          href={`https://arxiv.org/abs/${paper.arxivId}`}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline"
        >
          arXiv:{paper.arxivId}
        </a>
      </div>
    </div>
  );
}

function LoadingHint({ text }: { text: string }) {
  return (
    <div className="my-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
      {text}
    </div>
  );
}

function ErrorHint({ text }: { text: string }) {
  return (
    <div className="my-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
      {text}
    </div>
  );
}

export default function PaperView({
  invocation,
}: {
  invocation: PaperSearchUIToolInvocation;
}) {
  switch (invocation.state) {
    case 'input-streaming':
      return <LoadingHint text="准备调用 arXiv 检索…" />;

    case 'input-available': {
      const { query, category, sortBy, limit } = invocation.input;
      const summary = [
        `query="${query}"`,
        category ? `category=${category}` : null,
        sortBy ? `sort=${sortBy}` : null,
        limit ? `limit=${limit}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return <LoadingHint text={`正在检索 arXiv：${summary}`} />;
    }

    case 'output-available': {
      const output = invocation.output;
      if (output.state === 'loading') {
        return <LoadingHint text="正在检索 arXiv…" />;
      }
      if (output.state === 'error') {
        return <ErrorHint text={`检索失败：${output.message}`} />;
      }
      const { query, category, sortBy, count, papers } = output;
      return (
        <div className="my-3">
          <div className="mb-2 text-xs text-zinc-500">
            关键词 <code className="text-zinc-700">{query}</code>
            {category ? ` · ${category}` : ''}
            {' · '}
            <code className="text-zinc-700">{sortBy}</code>
            {' · '}
            <strong>{count}</strong> 篇
          </div>
          {papers.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-zinc-500">
              没有命中任何论文，可换关键词或去掉 category 再试。
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {papers.map(p => (
                <PaperCard key={p.id} paper={p} />
              ))}
            </div>
          )}
        </div>
      );
    }

    case 'output-error':
      return <ErrorHint text={`工具调用出错：${invocation.errorText}`} />;
  }
}
