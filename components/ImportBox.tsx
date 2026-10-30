"use client";

import { useState } from "react";

export function ImportBox({
  kind,
  hint,
  sample,
}: {
  kind: string;
  hint: string;
  sample: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/imports/${kind}`, { method: "POST", body: form });
    const body = (await response.json()) as { ok: boolean; reason?: string; rowCount?: number };
    setPending(false);
    if (!body.ok) {
      setError(body.reason ?? "가져오기에 실패했습니다.");
      return;
    }
    setMessage(`${body.rowCount}행을 반영했습니다. 페이지를 새로고침하면 보입니다.`);
    event.currentTarget.reset();
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-dashed border-white/15 p-4">
      <p className="text-sm text-zinc-400">{hint}</p>
      <pre className="mt-2 overflow-x-auto text-xs text-zinc-500">{sample}</pre>
      <input name="file" type="file" accept=".csv,.json,text/csv,application/json" className="mt-3 block text-sm" />
      <textarea name="text" rows={4} placeholder="또는 여기에 붙여넣기" className="mt-3 w-full rounded-md border border-white/10 bg-black/30 p-2 text-sm" />
      <button type="submit" disabled={pending} className="mt-3 rounded-md bg-white/10 px-3 py-1.5 text-sm">
        {pending ? "확인 중" : "가져오기"}
      </button>
      {message ? <p className="mt-2 text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
    </form>
  );
}
