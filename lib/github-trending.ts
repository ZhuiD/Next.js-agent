import * as cheerio from 'cheerio';

export type TrendingSince = 'daily' | 'weekly' | 'monthly';

export interface TrendingRepo {
  /** owner/repo */
  fullName: string;
  owner: string;
  repo: string;
  url: string;
  description: string;
  language: string | null;
  languageColor: string | null;
  stars: number;
  forks: number;
  /** stars gained in the selected time range (today/this week/this month) */
  starsInRange: number;
  rangeLabel: string;
}

const RANGE_LABEL: Record<TrendingSince, string> = {
  daily: 'today',
  weekly: 'this week',
  monthly: 'this month',
};

function toNumber(text: string | undefined): number {
  if (!text) return 0;
  return Number(text.replace(/[^\d]/g, '')) || 0;
}

/**
 * Scrape https://github.com/trending — GitHub provides no official API for trending.
 * @param since   time window (daily | weekly | monthly)
 * @param language e.g. "typescript", "python". Pass empty/undefined for all languages.
 * @param limit   max repos to return (default 15, max 25 per page)
 */
export async function fetchGithubTrending(
  since: TrendingSince = 'daily',
  language?: string,
  limit = 15,
): Promise<TrendingRepo[]> {
  const url = new URL('https://github.com/trending');
  url.searchParams.set('since', since);
  if (language && language.trim()) {
    // 路径形式: /trending/typescript?since=daily
    url.pathname = `/trending/${encodeURIComponent(language.trim().toLowerCase())}`;
  }

  const res = await fetch(url.toString(), {
    headers: {
      // 模拟普通浏览器，减少被拦截概率
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    // 服务端 fetch 缓存 10 分钟，避免频繁抓取
    next: { revalidate: 600 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch GitHub Trending: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const repos: TrendingRepo[] = [];

  $('article.Box-row').each((_, el) => {
    if (repos.length >= limit) return false;

    const $el = $(el);
    const titleLink = $el.find('h2 a').first();
    const href = (titleLink.attr('href') ?? '').trim();
    if (!href) return;

    const fullName = href.replace(/^\//, '').replace(/\s+/g, '');
    const [owner, repo] = fullName.split('/');
    if (!owner || !repo) return;

    const description = $el.find('p').first().text().trim();

    const languageEl = $el.find('[itemprop="programmingLanguage"]').first();
    const language = languageEl.text().trim() || null;
    const languageColor =
      $el
        .find('span.repo-language-color')
        .first()
        .attr('style')
        ?.match(/background-color:\s*([^;]+)/)?.[1]
        ?.trim() ?? null;

    const stars = toNumber($el.find('a[href$="/stargazers"]').first().text());
    const forks = toNumber($el.find('a[href$="/forks"]').first().text());

    // "★ 1,234 stars today" 之类
    const rangeText = $el.find('span.d-inline-block.float-sm-right').first().text();
    const starsInRange = toNumber(rangeText);

    repos.push({
      fullName,
      owner,
      repo,
      url: `https://github.com${href}`,
      description,
      language,
      languageColor,
      stars,
      forks,
      starsInRange,
      rangeLabel: RANGE_LABEL[since],
    });
  });

  return repos;
}
