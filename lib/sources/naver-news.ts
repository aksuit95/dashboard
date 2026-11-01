import { loadChatbotEnv, cleanEnv } from "@/lib/env/chatbot";
import { empty, ok, stale, type SourceResult } from "@/lib/sources/types";

const NAVER_NEWS_URL = "https://naverapihub.apigw.ntruss.com/search/v1/news";
const FETCH_COUNT = 30;
const NEWS_LIMIT = 5;

export type NewsItem = {
  title: string;
  link: string;
};

export function cleanNewsTitle(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

export function parseNaverNews(payload: unknown, limit = NEWS_LIMIT): NewsItem[] | null {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { items?: unknown }).items)) return null;
  const items: NewsItem[] = [];
  const seen = new Set<string>();
  for (const raw of (payload as { items: unknown[] }).items) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const title = cleanNewsTitle(String(row.title ?? ""));
    const link = String(row.originallink || row.link || "").trim();
    if (!title || !link || seen.has(link)) continue;
    seen.add(link);
    items.push({ title, link });
    if (items.length >= limit) break;
  }
  return items;
}

export async function fetchNaverNews(query = "증시"): Promise<SourceResult<NewsItem[]>> {
  loadChatbotEnv();
  const keyword = query.trim();
  if (!keyword) return empty("뉴스 검색어가 비어 있습니다.");
  const clientId = cleanEnv("NAVER_CLIENT_ID");
  const clientSecret = cleanEnv("NAVER_CLIENT_SECRET");
  if (!clientId || !clientSecret) return stale("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 이 없습니다.");

  const params = new URLSearchParams({ query: keyword, display: String(FETCH_COUNT), sort: "date", format: "json" });
  try {
    const response = await fetch(`${NAVER_NEWS_URL}?${params}`, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": clientId,
        "X-NCP-APIGW-API-KEY": clientSecret,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return stale(`네이버 뉴스 인증 또는 조회에 실패했습니다. HTTP ${response.status}`);
    const items = parseNaverNews(await response.json(), NEWS_LIMIT);
    if (!items) return stale("네이버 뉴스 응답 형식이 바뀌었습니다.");
    if (!items.length) return empty("새 뉴스가 없습니다.");
    return ok(items);
  } catch {
    return stale("네이버 뉴스를 가져오지 못했습니다.");
  }
}
