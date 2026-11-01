import fs from "node:fs";

const CHATBOT_ENV = "C:\\chatbot\\.env";
const ALLOWED_PREFIXES = ["NAVER_", "GOOGLE_"];

let loaded = false;

/** 대시보드 .env 에 없는 뉴스·캘린더 키만 챗봇 .env 에서 프로세스 메모리로 읽는다. 값은 로그에 남기지 않는다. */
export function loadChatbotEnv(): void {
  if (loaded) return;
  loaded = true;
  if (!fs.existsSync(CHATBOT_ENV)) return;
  const text = fs.readFileSync(CHATBOT_ENV, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    if (process.env[key]?.trim()) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value) process.env[key] = value;
  }
}

export function cleanEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^["']|["']$/g, "");
}
