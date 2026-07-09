import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';
import { searchArxiv } from '@/lib/arxiv';
import { server } from '../../mocks/server';
import { expectUrl } from '../../utils/assertions';

const arxivXml = `
  <feed xmlns:arxiv="http://arxiv.org/schemas/atom">
    <entry>
      <id>http://arxiv.org/abs/2401.00001v1</id>
      <updated>2024-01-02T00:00:00Z</updated>
      <published>2024-01-01T00:00:00Z</published>
      <title> Diffusion Models for Video Generation </title>
      <summary> A &amp; B video generation abstract. </summary>
      <author><name>Alice Zhang</name></author>
      <author><name>Bob Lee</name></author>
      <link title="pdf" href="https://arxiv.org/pdf/2401.00001v1" />
      <arxiv:primary_category term="cs.CV" />
    </entry>
  </feed>
`;

describe('searchArxiv', () => {
  test('builds the arXiv query and parses Atom XML results', async () => {
    let requestedUrl: URL | null = null;

    server.use(
      http.get('https://export.arxiv.org/api/query', ({ request }) => {
        requestedUrl = new URL(request.url);
        return HttpResponse.text(arxivXml, {
          headers: { 'Content-Type': 'application/atom+xml' },
        });
      }),
    );

    const papers = await searchArxiv({
      query: 'diffusion model',
      category: 'cs.CV',
      limit: 5,
      sortBy: 'submittedDate',
    });

    const url = expectUrl(requestedUrl);

    expect(url.searchParams.get('search_query')).toBe(
      'all:"diffusion model" AND cat:cs.CV',
    );
    expect(url.searchParams.get('max_results')).toBe('5');
    expect(url.searchParams.get('sortBy')).toBe('submittedDate');
    expect(papers).toEqual([
      {
        arxivId: '2401.00001v1',
        title: 'Diffusion Models for Video Generation',
        abstract: 'A & B video generation abstract.',
        authors: ['Alice Zhang', 'Bob Lee'],
        published: '2024-01-01T00:00:00Z',
        updated: '2024-01-02T00:00:00Z',
        url: 'http://arxiv.org/abs/2401.00001v1',
        pdfUrl: 'https://arxiv.org/pdf/2401.00001v1',
        primaryCategory: 'cs.CV',
        source: 'arxiv',
      },
    ]);
  });

  test('returns an empty list for a blank query without calling arXiv', async () => {
    const papers = await searchArxiv({ query: '   ' });

    expect(papers).toEqual([]);
  });
});
