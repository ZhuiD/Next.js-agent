import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';
import { fetchGithubTrending } from '@/lib/github-trending';
import { server } from '../../mocks/server';
import { expectUrl } from '../../utils/assertions';

const trendingHtml = `
  <article class="Box-row">
    <h2>
      <a href="/openai/codex"> openai / codex </a>
    </h2>
    <p>Agentic coding in your terminal.</p>
    <span class="repo-language-color" style="background-color: #3178c6;"></span>
    <span itemprop="programmingLanguage">TypeScript</span>
    <a href="/openai/codex/stargazers"> 12,345 </a>
    <a href="/openai/codex/forks"> 678 </a>
    <span class="d-inline-block float-sm-right">1,234 stars this week</span>
  </article>
`;

describe('fetchGithubTrending', () => {
  test('parses GitHub Trending HTML into normalized repo data', async () => {
    let requestedUrl: URL | null = null;

    server.use(
      http.get('https://github.com/trending/typescript', ({ request }) => {
        requestedUrl = new URL(request.url);
        return HttpResponse.text(trendingHtml, {
          headers: { 'Content-Type': 'text/html' },
        });
      }),
    );

    const repos = await fetchGithubTrending('weekly', 'TypeScript', 5);
    const url = expectUrl(requestedUrl);

    expect(url.searchParams.get('since')).toBe('weekly');
    expect(repos).toEqual([
      {
        fullName: 'openai/codex',
        owner: 'openai',
        repo: 'codex',
        url: 'https://github.com/openai/codex',
        description: 'Agentic coding in your terminal.',
        language: 'TypeScript',
        languageColor: '#3178c6',
        stars: 12345,
        forks: 678,
        starsInRange: 1234,
        rangeLabel: 'this week',
      },
    ]);
  });

  test('throws a helpful error when GitHub rejects the request', async () => {
    server.use(
      http.get('https://github.com/trending', () =>
        HttpResponse.text('rate limited', { status: 429, statusText: 'Too Many Requests' }),
      ),
    );

    await expect(fetchGithubTrending('daily')).rejects.toThrow(
      'Failed to fetch GitHub Trending: 429 Too Many Requests',
    );
  });
});
