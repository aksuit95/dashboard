import { getDb } from "@/lib/db/client";
import { importBreadth, importConcalls, importFlow, importHoldings, importMonthly, importOverseas } from "@/lib/imports/load";
import type { ImportResult } from "@/lib/imports/load";

export const runtime = "nodejs";

async function readText(request: Request): Promise<string> {
  const form = await request.formData();
  const file = form.get("file");
  if (file instanceof File && file.size > 0) return file.text();
  return String(form.get("text") ?? "");
}

export async function POST(request: Request, context: { params: Promise<{ kind: string }> }): Promise<Response> {
  const { kind } = await context.params;
  const text = await readText(request);
  const db = getDb();
  let result: ImportResult;
  if (kind === "breadth") result = importBreadth(db, text);
  else if (kind === "flow") result = importFlow(db, text);
  else if (kind === "holdings") result = importHoldings(db, text);
  else if (kind === "overseas") result = importOverseas(db, text);
  else if (kind === "concall") result = importConcalls(db, text);
  else if (kind === "trade") result = importMonthly(db, "trade", text);
  else if (kind === "taiwan") result = importMonthly(db, "taiwan", text);
  else result = { ok: false, reason: "알 수 없는 가져오기입니다." };
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
