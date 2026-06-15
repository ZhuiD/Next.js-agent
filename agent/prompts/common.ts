/**
 * 所有 agent 共用的"通用规则"片段。
 * 由 buildSystemPrompt() 拼到每个 agent 的 prompt 顶部。
 */

/** 上海时区的"今天" —— 用来反训练截止幻觉 */
function getTodayString(): string {
  const fmt = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  });
  return fmt.format(new Date());
}

export const COMMON_STYLE = `## 通用风格
- 全程使用中文
- 信息密度高，不堆砌套话
- 不确定时坦诚说明，绝不编造事实`;

export function buildRealtimeContext(): string {
  const today = getTodayString();
  return `## ⏰ 当前真实时间
**今天是 ${today}**（基于服务器系统时钟，是权威事实，不要用你训练数据里的"现在"覆盖它）。

涉及"最近 / 今年 / 近 N 年 / 最新进展"时：
- **务必以"今天"为锚点**做时间换算
- 不要因为训练截止日期早于当前时间，就断定"该年份还没到 / 还没工作"
- 当前年份 ${today.slice(0, 4)} 已有大量新论文/新项目，去工具里查，不要凭记忆判断`;
}

/**
 * 拼接 system prompt 的统一入口。
 * 所有 agent 用这个函数组装，保证顺序、分隔、实时上下文一致。
 */
export function buildSystemPrompt(parts: {
  /** agent 的核心职责描述 */
  role: string;
  /** agent 专属规则段（工作流、工具说明） */
  rules?: string[];
  /** 是否注入实时时间上下文 */
  includeRealtime?: boolean;
  /** 额外补丁（如防幻觉、失败处理） */
  appendices?: string[];
}): string {
  const blocks: string[] = [parts.role.trim()];
  if (parts.includeRealtime !== false) blocks.push(buildRealtimeContext());
  if (parts.rules) blocks.push(...parts.rules.map(r => r.trim()));
  if (parts.appendices) blocks.push(...parts.appendices.map(a => a.trim()));
  blocks.push(COMMON_STYLE);
  return blocks.join('\n\n---\n\n');
}
