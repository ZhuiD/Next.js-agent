'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * "Stick to bottom" 页面级滚动行为（ChatGPT / Claude / Cursor 都是这套）：
 *
 * - 内容增高时，**只要用户当前在底部附近**（< thresholdPx），自动滚到最底
 * - 用户主动往上滚 → `isAtBottom` 变 false，停止强制滚动，避免打扰阅读
 * - 用户手动滚回底部附近 → 自动跟随恢复
 *
 * 适用于"页面整体滚动 + 底部 fixed 输入框"的布局（本项目即是）。
 * 监听 `window` 的滚动状态 + 给定容器 ref 的 DOM/尺寸变化。
 *
 * 用法：
 *   const { contentRef, isAtBottom, scrollToBottom } = useStickToBottom();
 *   <main>
 *     <div ref={contentRef}>{messages...}</div>
 *   </main>
 */
export function useStickToBottom<T extends HTMLElement = HTMLDivElement>(
  options: { thresholdPx?: number } = {},
): {
  // 用 React 18 兼容的 non-nullable 形式，避免赋给 <div ref=...> 时类型不兼容
  contentRef: RefObject<T>;
  isAtBottom: boolean;
  scrollToBottom: () => void;
} {
  const threshold = options.thresholdPx ?? 120;
  const contentRef = useRef<T>(null as unknown as T);
  const [isAtBottom, setIsAtBottom] = useState(true);
  // ref 镜像，避免 observer 回调读到陈旧 state
  const isAtBottomRef = useRef(true);

  const computeAtBottom = () => {
    const root = document.documentElement;
    const distance = root.scrollHeight - root.scrollTop - window.innerHeight;
    return distance <= threshold;
  };

  const scrollToBottom = () => {
    window.scrollTo({ top: document.documentElement.scrollHeight });
    isAtBottomRef.current = true;
    setIsAtBottom(true);
  };

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const onScroll = () => {
      const atBottom = computeAtBottom();
      if (atBottom !== isAtBottomRef.current) {
        isAtBottomRef.current = atBottom;
        setIsAtBottom(atBottom);
      }
    };

    // 内容增高时，若用户在底部就跟随。用 instant（不 smooth）避免和流式追加打架抖动
    const followIfNeeded = () => {
      if (isAtBottomRef.current) {
        window.scrollTo({ top: document.documentElement.scrollHeight });
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    // 内容区 DOM 子树变化（新消息、新工具卡片、流式追加的文本节点）
    const mo = new MutationObserver(followIfNeeded);
    mo.observe(el, { childList: true, subtree: true, characterData: true });

    // 内容区尺寸变化（图片加载完成、markdown 渲染完成等）
    const ro = new ResizeObserver(followIfNeeded);
    ro.observe(el);

    // 初始锚定到底（首次 mount 时已有消息的场景）
    followIfNeeded();
    onScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      mo.disconnect();
      ro.disconnect();
    };
  }, [threshold]);

  return { contentRef, isAtBottom, scrollToBottom };
}
