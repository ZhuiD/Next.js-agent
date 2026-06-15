/**
 * arXiv API 封装 —— 仅用于补"最新预印本"。
 * 文档: https://info.arxiv.org/help/api/user-manual.html
 * 返回 Atom XML，这里用极简正则解析，避免引入 xml 解析依赖。
 *
 * 限速说明：官方手册原话 "incorporate a 3 second delay in your code"。
 * 短时间连击会被回 400/403，所以做进程内 3s 串行节流 + 一次失败重试。
 */

import { createMinIntervalLimiter } from './rate-limit';

const BASE_URL = 'https://export.arxiv.org/api/query';

// 贴官方建议：相邻请求之间至少 3 秒
const arxivLimiter = createMinIntervalLimiter(3000);

export interface ArxivPaper {
  /** 例如 "2403.12345v1" */
  arxivId: string;
  title: string;
  abstract: string;
  authors: string[];
  /** ISO 字符串 */
  published: string;
  updated: string;
  /** abstract 页 URL */
  url: string;
  /** PDF URL */
  pdfUrl: string;
  /** 主分类，例如 cs.CV */
  primaryCategory: string | null;
  source: 'arxiv';
}

export interface ArxivSearchOptions {
  query: string;
  /** arXiv 分类前缀过滤（如 cs.CV），不传则全分类 */
  category?: string;
  limit?: number;
  /** relevance | submittedDate | lastUpdatedDate */
  sortBy?: 'relevance' | 'submittedDate' | 'lastUpdatedDate';
}

/**
 * 把模型传入的 query 转成 arXiv 合法的 search_query。
 *
 * 设计原则：
 * - 模型传的是"已经想清楚的检索词"，我们不强行包引号
 * - 如果 query 里已经出现了 arXiv 字段前缀（all:/ti:/abs:/cat:）或布尔符（AND/OR/NOT/括号），
 *   认定它是"模型自己写的表达式"，原样传递（最多裹一层 all: 不是必要的）
 * - 否则视作朴素短语：若包含空格则裹成 all:"phrase"，无空格直接 all:term
 *
 * 关键：**绝不**用 JSON.stringify 包外层引号——那会把布尔表达式破坏成字面量。
 */
function buildSearchQuery(rawQuery: string, category?: string): string {
  // 去掉模型可能自己加的外层引号
  let q = rawQuery.trim();
  if (
    (q.startsWith('"') && q.endsWith('"')) ||
    (q.startsWith("'") && q.endsWith("'"))
  ) {
    q = q.slice(1, -1).trim();
  }

  const looksLikeExpression =
    /\b(AND|OR|ANDNOT|NOT)\b/.test(q) ||
    /[()]/.test(q) ||
    /\b(all|ti|abs|au|cat|jr|co|rn|id):/i.test(q);

  let main: string;
  if (looksLikeExpression) {
    // 模型自己写了表达式 → 原样使用
    main = q;
  } else if (/\s/.test(q)) {
    // 朴素多词短语 → 裹一对引号作为精确短语
    main = `all:"${q}"`;
  } else {
    // 单个词 → 直接 all:
    main = `all:${q}`;
  }

  if (category && category.trim()) {
    return `${main} AND cat:${category.trim()}`;
  }
  return main;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function pickAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function pickOne(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = re.exec(xml);
  return m ? m[1] : null;
}

function pickAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]*\\b${attr}="([^"]*)"`);
  const m = re.exec(xml);
  return m ? m[1] : null;
}

function parseEntry(entry: string): ArxivPaper | null {
  const idUrl = pickOne(entry, 'id')?.trim();
  if (!idUrl) return null;
  // id 形如 http://arxiv.org/abs/2403.12345v1
  const arxivId = idUrl.replace(/^https?:\/\/arxiv\.org\/abs\//, '');
  const title = decodeXmlEntities((pickOne(entry, 'title') ?? '').replace(/\s+/g, ' ').trim());
  const abstract = decodeXmlEntities((pickOne(entry, 'summary') ?? '').replace(/\s+/g, ' ').trim());
  const published = pickOne(entry, 'published')?.trim() ?? '';
  const updated = pickOne(entry, 'updated')?.trim() ?? '';
  const authors = pickAll(entry, 'author')
    .map(a => decodeXmlEntities((pickOne(a, 'name') ?? '').trim()))
    .filter(Boolean);

  const primaryCategory = pickAttr(entry, 'arxiv:primary_category', 'term');

  // PDF link
  const pdfMatch = /<link[^>]*title="pdf"[^>]*href="([^"]+)"/.exec(entry);
  const pdfUrl = pdfMatch ? pdfMatch[1] : `https://arxiv.org/pdf/${arxivId}.pdf`;

  return {
    arxivId,
    title,
    abstract,
    authors,
    published,
    updated,
    url: idUrl,
    pdfUrl,
    primaryCategory,
    source: 'arxiv',
  };
}

export async function searchArxiv(opts: ArxivSearchOptions): Promise<ArxivPaper[]> {
  const { query, category, limit = 10, sortBy = 'relevance' } = opts;
  if (!query.trim()) return [];

  const searchQuery = buildSearchQuery(query, category);

  const url = new URL(BASE_URL);
  url.searchParams.set('search_query', searchQuery);
  url.searchParams.set('start', '0');
  url.searchParams.set('max_results', String(Math.min(Math.max(limit, 1), 30)));
  url.searchParams.set('sortBy', sortBy);
  url.searchParams.set('sortOrder', 'descending');

  return arxivLimiter(async () => {
    // 首次 + 1 次重试（间隔 3s），覆盖偶发 400/429
    const attempts = [0, 3000];
    let lastErr: unknown;
    for (let i = 0; i < attempts.length; i++) {
      if (attempts[i] > 0) {
        await new Promise(r => setTimeout(r, attempts[i]));
      }
      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/atom+xml' },
        next: { revalidate: 3600 },
      });
      if (res.ok) {
        const xml = await res.text();
        const entries = pickAll(xml, 'entry');
        return entries.map(parseEntry).filter((p): p is ArxivPaper => p !== null);
      }
      lastErr = new Error(
        `arXiv ${res.status} ${res.statusText} (search_query="${searchQuery}")`,
      );
      // 4xx 中只对 429 重试；400/403/404 直接抛
      if (res.status !== 429 && res.status < 500) break;
    }
    throw lastErr ?? new Error('arXiv request failed');
  });
}
