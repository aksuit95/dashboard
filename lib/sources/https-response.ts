import { request } from "node:https";

/** Consume upstream responses on the server without passing headers or bodies to Next.js fetch tracing. */
export function readHttpsResponse<T>(url: string, init: RequestInit, read: (response: Response) => T | Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers = Object.fromEntries(new Headers(init.headers));
    headers["accept-encoding"] = "identity";
    const body = typeof init.body === "string" ? init.body : undefined;
    if (body) headers["content-length"] = String(Buffer.byteLength(body));
    const outgoing = request(url, { method: init.method, headers, signal: init.signal ?? undefined }, incoming => {
      const status = incoming.statusCode ?? 502;
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.once("error", reject);
      incoming.once("end", () => {
        try {
          const responseHeaders = new Headers();
          for (let i = 0; i < incoming.rawHeaders.length; i += 2) responseHeaders.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
          const response = new Response(chunks.length ? Buffer.concat(chunks) : null, { status, headers: responseHeaders });
          resolve(read(response));
        } catch (error) { reject(error); }
      });
    });
    outgoing.once("error", reject);
    outgoing.end(body);
  });
}
