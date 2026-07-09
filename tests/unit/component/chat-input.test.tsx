import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import ChatInput from '@/component/chat-input';

describe('ChatInput', () => {
  test('submits the typed text and clears the input', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<ChatInput status="ready" onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText(/最近 24 小时/);
    await user.type(input, '帮我看 GitHub 趋势');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('帮我看 GitHub 趋势');
    expect(input).toHaveValue('');
  });

  test('does not submit blank text', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<ChatInput status="ready" onSubmit={onSubmit} />);

    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled();

    await user.type(screen.getByRole('textbox'), '   ');
    await user.keyboard('{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('shows a stop button while streaming', async () => {
    const user = userEvent.setup();
    const stop = vi.fn();

    render(<ChatInput status="streaming" onSubmit={vi.fn()} stop={stop} />);

    expect(screen.getByRole('textbox')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '停止' }));

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
