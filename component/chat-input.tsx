import { useState } from 'react';

export default function ChatInput({
  status,
  onSubmit,
  stop,
  disabled = false,
  placeholder = '例如：最近 24 小时最火的 AI 项目，用中文总结',
}: {
  status: string;
  onSubmit: (text: string) => void;
  stop?: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const isBusy = status === 'streaming' || status === 'submitted';
  const isDisabled = disabled || isBusy;

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (text.trim() === '' || isDisabled) return;
        onSubmit(text);
        setText('');
      }}
      className="border-t border-zinc-200 bg-white px-4 py-4"
    >
      <div className="flex w-full items-center gap-2">
        <input
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-500 disabled:bg-zinc-100"
          placeholder={placeholder}
          disabled={isDisabled}
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
            disabled={disabled || text.trim() === ''}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            发送
          </button>
        )}
      </div>
    </form>
  );
}
