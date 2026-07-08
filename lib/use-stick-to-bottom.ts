'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * "Stick to bottom" 容器级滚动行为：
 *
 * - 内容增高时，**只要用户当前在底部附近**（< thresholdPx），自动滚到最底
 * - 用户主动往上滚 → `isAtBottom` 变 false，停止强制滚动，避免打扰阅读
 * - 用户手动滚回底部附近 → 自动跟随恢复
 *
 * 适用于当前这种 app 布局：
 * - body/page 固定高度并 overflow-hidden
 * - 消息列表 div 自己 `overflow-y-auto`
 *
 * 所以这里监听和滚动的对象是 `contentRef.current`，不是 window。
 *
 * 用法：
 *   const { contentRef, isAtBottom, scrollToBottom } = useStickToBottom();
 *   <div ref={contentRef} className="overflow-y-auto">{messages...}</div>
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

  const computeAtBottom = useCallback((el: T) => {
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distance <= threshold;
  }, [threshold]);

  const scrollToBottom = () => {
    const el = contentRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    isAtBottomRef.current = true;
    setIsAtBottom(true);
  };

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const onScroll = () => {
      const atBottom = computeAtBottom(el);
      if (atBottom !== isAtBottomRef.current) {
        isAtBottomRef.current = atBottom;
        setIsAtBottom(atBottom);
      }
    };

    // 内容增高时，若用户在底部就跟随。用 instant（不 smooth）避免和流式追加打架抖动
    const followIfNeeded = () => {
      if (isAtBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });

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
      el.removeEventListener('scroll', onScroll);
      mo.disconnect();
      ro.disconnect();
    };
  }, [computeAtBottom]);

  return { contentRef, isAtBottom, scrollToBottom };
}
