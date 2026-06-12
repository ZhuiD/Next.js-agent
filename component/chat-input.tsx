import { useState } from 'react';

export default function ChatInput({
  status,
  onSubmit,
  stop,
}: {
  status: string;
  onSubmit: (text: string) => void;
  stop?: () => void;
}) {
  const [text, setText] = useState('');
  const isBusy = status === 'streaming' || status === 'submitted';

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (text.trim() === '' || isBusy) return;
        onSubmit(text);
        setText('');
      }}
      className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/90 px-4 py-4 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
        <input
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-500 disabled:bg-zinc-100"
          placeholder="例如：最近 24 小时最火的 AI 项目，用中文总结"
          disabled={isBusy}
          value={text}
          onChange={e => setText(e.target.value)}
        />
        {isBusy && stop ? (
          <button
            type="button"
            onClick={stop}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            停止
          </button>
        ) : (
          <button
            type="submit"
            disabled={text.trim() === ''}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            发送
          </button>
        )}
      </div>
    </form>
  );
}
