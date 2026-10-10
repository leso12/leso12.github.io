// 로컬 실행용 서버: node server.js → http://localhost:3000
// public/ 정적 파일 + POST /api/reading. 외부 패키지 없이 Node 18+ 만으로 동작.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

// .env 읽기 (dotenv 없이)
if (existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const { handle } = await import("./lib/reading.js");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const PORT = Number(process.env.PORT || 3000);

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/reading") {
    if (req.method !== "POST") { res.writeHead(405).end(); return; }
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > 50_000) { res.writeHead(413).end(); return; } }
    let body = null; try { body = JSON.parse(raw); } catch {}
    const out = await handle(body, req.socket.remoteAddress);
    res.writeHead(out.status, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(out.json));
    return;
  }
  const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
  const file = join(root, "public", rel);
  if (!file.startsWith(join(root, "public"))) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(data);
  } catch { res.writeHead(404).end("Not found"); }
}).listen(PORT, () => {
  console.log(`사주 웹앱: http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn("⚠ ANTHROPIC_API_KEY가 없습니다. .env 파일을 만들어 주세요.");
});
