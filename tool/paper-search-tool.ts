import { tool, type UIToolInvocation } from 'ai';
import { z } from 'zod';
import { searchArxiv, type ArxivPaper } from '@/lib/arxiv';

/** 工具输出 / UI 共用的论文条目（arXiv 字段） */
export interface UnifiedPaper {
  id: string;
  title: string;
  authors: string[];
  /** 发表/挂出年份 */
  year: number | null;
  /** arXiv 主分类，如 cs.CV */
  category: string | null;
  /** ISO 时间，便于"近 N 个月"过滤 */
  published: string;
  updated: string;
  /** 截断后的摘要（120-240 字符） */
  tldr: string | null;
  abstract: string;
  url: string;
  pdfUrl: string;
  arxivId: string;
}

function titleKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function arxivToUnified(p: ArxivPaper): UnifiedPaper {
  const year = p.published ? Number(p.published.slice(0, 4)) : null;
  return {
    id: `arxiv:${p.arxivId}`,
    title: p.title,
    authors: p.authors,
    year: Number.isFinite(year) ? year : null,
    category: p.primaryCategory ?? null,
    published: p.published,
    updated: p.updated,
    tldr: p.abstract ? p.abstract.slice(0, 240) : null,
    abstract: p.abstract,
    url: p.url,
    pdfUrl: p.pdfUrl,
    arxivId: p.arxivId,
  };
}

export const paperSearchTool = tool({
  description:
    '基于 arXiv 检索学术论文（计算机方向预印本与已发表论文）。' +
    '适用于：用户想做某个方向的文献调研、找最近 N 年/月的相关工作、跟踪某话题的最新进展。' +
    'arXiv 是国内可直接访问的学术预印本平台，覆盖 cs.* 全方向，是计算机研究生做文献调研的核心入口。',
  inputSchema: z.object({
    query: z
      .string()
      .min(2)
      .describe(
        '英文检索关键词。中文话题需先翻译/扩展为 1-3 个英文关键词组合，例如 "diffusion model video generation"。',
      ),
    category: z
      .string()
      .optional()
      .describe(
        '可选 arXiv 分类过滤，例如 "cs.CV"（视觉）/ "cs.CL"（NLP）/ "cs.LG"（机器学习）/ "cs.AI"。不传则覆盖全 arXiv。',
      ),
    sortBy: z
      .enum(['relevance', 'submittedDate', 'lastUpdatedDate'])
      .default('relevance')
      .describe(
        'relevance=相关度（默认）；submittedDate=按首次提交时间倒序（找最新预印本）；lastUpdatedDate=按最近更新时间倒序。',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .default(15)
      .describe('返回数量上限，默认 15。'),
  }),
  async *execute({ query, category, sortBy, limit }) {
    yield { state: 'loading' as const, query, category, sortBy, limit };

    try {
      const raw = await searchArxiv({ query, category, sortBy, limit });

      // 标题归一化去重
      const seen = new Set<string>();
      const papers: UnifiedPaper[] = [];
      for (const p of raw.map(arxivToUnified)) {
        const k = titleKey(p.title);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        papers.push(p);
      }

      yield {
        state: 'ready' as const,
        query,
        category: category ?? null,
        sortBy,
        count: papers.length,
        papers,
      };
    } catch (err) {
      yield {
        state: 'error' as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

export type PaperSearchUIToolInvocation = UIToolInvocation<typeof paperSearchTool>;
