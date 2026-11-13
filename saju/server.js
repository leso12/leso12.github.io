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
const { startReading,readingStatus,getClaudeKey,markRunningJobsLost } = await import("./lib/reading.js");
const { createExport, getExport, disposition, MAX_UPLOAD } = await import("./lib/export.js");
// 배포·재시작 때 Render가 보내는 종료 신호: 진행 중 해석을 '중단됨'으로 기록하고 끝낸다
for (const sig of ["SIGTERM","SIGINT"]) process.once(sig, async () => {
  const n = await markRunningJobsLost().catch(() => 0);
  if (n) console.warn(`[shutdown] 진행 중 해석 ${n}건을 중단으로 기록`);
  process.exit(0);
});

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const PORT = Number(process.env.PORT || 3000);
// Read-only, non-billable authentication probe; secret and personal data are never logged.
async function verifyClaudeCredentials(){
  const key=getClaudeKey();
  if(!key){console.warn("[claude-auth] API key missing");return;}
  const looksLikeKey=key.startsWith("sk-ant-");
  console.log("[claude-auth] key loaded; expected prefix:",looksLikeKey,"contains whitespace:",/\s/.test(key));
  if(!looksLikeKey){console.error("[claude-auth] INVALID KEY FORMAT. Check Render ANTHROPIC_API_KEY VALUE; must start sk-ant-.");return;}
  try{
    const res=await fetch("https://api.anthropic.com/v1/models?limit=1",{
      headers:{"authorization":`Bearer ${key}`,"anthropic-version":"2026-10-21"},
      signal:AbortSignal.timeout(15000)
    });
    const data=await res.json().catch(()=>null);
    const message=String(data?.error?.message||"").replace(/sk-ant-[^\s"']+/gi,"[redacted]").slice(0,160);
    console.log("[claude-auth] check",JSON.stringify({status:res.status,type:String(data?.error?.type||""),message,requestId:String(res.headers.get("request-id")||"").slice(0,90)}));
  }catch(e){console.error("[claude-auth] connectivity check failed",e?.name||"unknown");}
}

const ALLOWED_ORIGINS = new Set(["https://leso12.github.io", "https://saju-claude-api.onrender.com", "http://localhost:3000"]);

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }).end(JSON.stringify({ ok: true, service: "saju-api" }));
    return;
  }
  // 결과 파일(긴 JPG·PDF): POST로 이미지 조각을 올리면 실제 다운로드 주소를 돌려준다
  if (url.pathname === "/api/export" || url.pathname.startsWith("/api/export/")) {
    const origin = req.headers.origin;
    const allowed = !origin || ALLOWED_ORIGINS.has(origin) || (() => { try { return new URL(origin).host === req.headers.host; } catch { return false; } })();
    if (origin && allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
    const json = (status, obj) => res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }).end(JSON.stringify(obj));
    if (req.method === "GET") {
      const f = getExport(url.pathname.split("/")[3]);
      if (!f) { json(404, { error: "파일이 만료됐어요(15분). 화면에서 저장 버튼을 다시 눌러 주세요." }); return; }
      res.writeHead(200, { "content-type": f.mime, "content-length": f.buf.length, "cache-control": "private, max-age=900",
        "content-disposition": disposition(f.name, url.searchParams.get("view") === "1") }).end(f.buf);
      return;
    }
    if (req.method !== "POST" || url.pathname !== "/api/export") { res.writeHead(405).end(); return; }
    if (!allowed) { json(403, { error: "허용되지 않은 요청 출처입니다." }); return; }
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_UPLOAD) { json(413, { error: "이미지가 너무 커요." }); return; }
      chunks.push(chunk);
    }
    try {
      const out = await createExport(Buffer.concat(chunks), Object.fromEntries(url.searchParams));
      json(200, { url: `/api/export/${out.id}`, name: out.name, bytes: out.bytes });
    } catch (e) {
      console.error("[export]", e.message);
      json(e.status || 500, { error: e.status ? e.message : "파일을 만들지 못했어요. 다시 시도해 주세요." });
    }
    return;
  }
  if (url.pathname === "/api/reading") {
    const origin = req.headers.origin;
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      res.writeHead(403, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: "허용되지 않은 요청 출처입니다." }));
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
    const send=(out)=>{
      const headers={ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
      if(out.json?.retryAfterSeconds>0)headers["retry-after"]=String(Math.floor(out.json.retryAfterSeconds));
      res.writeHead(out.status, headers).end(JSON.stringify(out.json));
    };
    // 진행 상황 확인: GET /api/reading?job=<작업 번호>
    if (req.method === "GET") { send(await readingStatus(url.searchParams.get("job"))); return; }
    if (req.method !== "POST") { res.writeHead(405).end(); return; }
    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    if (!contentType.includes("application/json")) {
      res.writeHead(415, { "content-type": "application/json" }).end(JSON.stringify({ error: "JSON 요청만 허용됩니다." }));
      return;
    }
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 50_000) {
        res.writeHead(413, { "content-type": "application/json" }).end(JSON.stringify({ error: "요청 데이터가 너무 큽니다." }));
        return;
      }
    }
    let body = null; try { body = JSON.parse(raw); } catch {}
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",");
    const ip = forwarded.length > 1 ? forwarded[forwarded.length - 1].trim() : (forwarded[0].trim() || req.socket.remoteAddress);
    // 생성은 서버에서 계속 진행하고, 화면은 작업 번호로 결과를 확인한다.
    send(await startReading(body, ip || "unknown"));
    return;
  }
  // Serve the same vendored export library for local development and GitHub Pages.
  if(url.pathname==="/vendor/html2pdf.bundle.min.js"){
    try{
      const code=await readFile(join(root,"vendor","html2pdf.bundle.min.js"));
      res.writeHead(200,{"content-type":"text/javascript; charset=utf-8","cache-control":"public, max-age=3600"}).end(code);
    }catch{res.writeHead(404).end("Library missing");}
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
  void verifyClaudeCredentials();
});
