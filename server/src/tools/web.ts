import type { ApprovalRequest } from '../types.js';

export const WEB_TOOLS = [
  {
    name: 'web_search',
    description: 'Search the web for current information. Returns titles, URLs, and snippets. Use this whenever the task needs live data, facts, prices, news, documentation, or anything that requires internet access.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The search query' },
        num_results: { type: 'number', description: 'Number of results to return (default 5, max 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch the content of a web page or URL and return its text. Use after web_search to read the full content of a specific page.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'The URL to fetch (http or https)' },
      },
      required: ['url'],
    },
  },
];

// ─── Return type ──────────────────────────────────────────────────────────────

export interface PageImageInfo {
  url: string;
  alt?: string;   // alt text from the img tag or og:image:alt
  isOg: boolean;  // true if this is the og:image or twitter:image — page's representative image
}

export interface WebToolResult {
  text: string;
  pageImages?: PageImageInfo[];   // populated only for fetch_url on HTML pages
}

// ─── Image extraction from raw HTML (before stripping) ───────────────────────

function extractPageImages(html: string, baseUrl: string): PageImageInfo[] {
  const seen = new Set<string>();
  const results: PageImageInfo[] = [];

  const tryAdd = (src: string | undefined, alt: string | undefined, isOg: boolean) => {
    if (!src || src.startsWith('data:')) return;
    try {
      const abs = new URL(src.trim(), baseUrl).href;
      if (!abs.startsWith('http') || seen.has(abs)) return;
      const path = new URL(abs).pathname.toLowerCase();
      // Must be a raster image (SVG excluded — usually UI/icons)
      if (!/\.(jpe?g|png|webp)(\?|$)/i.test(abs) && !/\.(jpe?g|png|webp)/i.test(path)) return;
      // Skip obvious non-content images by path keywords
      if (/\b(?:icon|logo|sprite|pixel|track|1x1|blank|button|arrow|badge|loading|spinner|avatar|gravatar|favicon|placeholder|spacer|separator|divider)\b/i.test(path)) return;
      seen.add(abs);
      results.push({ url: abs, alt: alt?.trim() || undefined, isOg });
    } catch { /* skip malformed */ }
  };

  // Open Graph image — page author explicitly set as the representative image
  const ogSrc = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
             ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  const ogAlt = html.match(/<meta[^>]+property=["']og:image:alt["'][^>]+content=["']([^"']+)["']/i)
             ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:alt["']/i);
  if (ogSrc) tryAdd(ogSrc[1], ogAlt?.[1], true);

  // Twitter card image (also considered a representative OG-style image)
  const twSrc = html.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i)
             ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i);
  const twAlt = html.match(/<meta[^>]+name=["']twitter:image:alt["'][^>]+content=["']([^"']+)["']/i);
  if (twSrc) tryAdd(twSrc[1], twAlt?.[1], true);

  // <img> tags — capture src AND alt together
  const imgRe = /<img(?:\s[^>]*)?\s(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const tag = m[0];
    const altM = tag.match(/\balt=["']([^"']*?)["']/i);
    tryAdd(m[1], altM?.[1], false);
  }

  // <source srcset="..."> — first entry (usually highest-res)
  const srcsetRe = /<source[^>]+\bsrcset=["']([^"']+)["']/gi;
  while ((m = srcsetRe.exec(html)) !== null) {
    const first = m[1].split(',')[0].trim().split(/\s+/)[0];
    tryAdd(first, undefined, false);
  }

  return results.slice(0, 15);
}

// ─── Search implementations ───────────────────────────────────────────────────

interface DDGTopic { Text?: string; FirstURL?: string; Name?: string; Topics?: DDGTopic[] }
interface DDGResponse {
  Answer?: string;
  AbstractText?: string;
  AbstractURL?: string;
  RelatedTopics?: DDGTopic[];
  Results?: Array<{ Text: string; FirstURL: string }>;
}

async function ddgSearch(query: string, num: number): Promise<string> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=nexus-agent`;
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Nexus/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`DDG returned ${resp.status}`);
  const data = await resp.json() as DDGResponse;

  const parts: string[] = [`Search results for: "${query}"\n`];

  if (data.Answer) parts.push(`Direct answer: ${data.Answer}\n`);

  if (data.AbstractText) {
    parts.push(`Summary: ${data.AbstractText}`);
    if (data.AbstractURL) parts.push(`Source: ${data.AbstractURL}\n`);
  }

  const flatTopics: { text: string; url: string }[] = [];
  function flattenTopics(topics: DDGTopic[]) {
    for (const t of topics) {
      if (t.Text && t.FirstURL) flatTopics.push({ text: t.Text, url: t.FirstURL });
      if (t.Topics) flattenTopics(t.Topics);
    }
  }
  flattenTopics(data.RelatedTopics ?? []);

  const results = flatTopics.slice(0, num);
  if (results.length > 0) {
    parts.push('Results:');
    results.forEach((r, i) => parts.push(`${i + 1}. ${r.text}\n   ${r.url}`));
  }

  if (parts.length <= 1) {
    return `No instant results found for "${query}". Try fetch_url with a specific URL, or rephrase the query.`;
  }
  return parts.join('\n');
}

async function braveSearch(query: string, apiKey: string, num: number): Promise<string> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(num, 10)}`;
  const resp = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`Brave Search returned ${resp.status}`);
  const data = await resp.json() as { web?: { results: Array<{ title: string; url: string; description: string }> } };
  const results = data.web?.results ?? [];
  if (results.length === 0) return `No results found for "${query}"`;
  const parts = [`Search results for: "${query}"\n`];
  results.forEach((r, i) => parts.push(`${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`));
  return parts.join('\n');
}

// ─── Fetch URL implementation ─────────────────────────────────────────────────

async function doFetchUrl(url: string): Promise<WebToolResult> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { text: `ERROR: URL must start with http:// or https://` };
  }
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(12000),
    redirect: 'follow',
  });
  if (!resp.ok) return { text: `ERROR: HTTP ${resp.status} fetching ${url}` };

  const contentType = resp.headers.get('content-type') ?? '';
  const raw = await resp.text();

  if (contentType.includes('application/json')) {
    return { text: `Content from ${url}:\n\n${raw.slice(0, 15000)}` };
  }

  // Extract images from raw HTML before stripping tags
  const pageImages = contentType.includes('text/html') ? extractPageImages(raw, url) : [];

  // Strip HTML
  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 15000);

  return { text: `Content from ${url}:\n\n${text}`, pageImages };
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function executeWebTool(
  name: string,
  input: Record<string, unknown>,
  searchApiKey?: string,
): Promise<WebToolResult> {
  try {
    if (name === 'web_search') {
      const query = (input.query as string ?? '').trim();
      if (!query) return { text: 'ERROR: query is required' };
      const num = Math.min(Number(input.num_results ?? 5), 10);
      const text = searchApiKey
        ? await braveSearch(query, searchApiKey, num)
        : await ddgSearch(query, num);
      return { text };
    }

    if (name === 'fetch_url') {
      const url = (input.url as string ?? '').trim();
      if (!url) return { text: 'ERROR: url is required' };
      return await doFetchUrl(url);
    }

    return { text: `ERROR: Unknown web tool: ${name}` };
  } catch (err) {
    return { text: `ERROR: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// keep old export for any unused import path
export type { ApprovalRequest };
