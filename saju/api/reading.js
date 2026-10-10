// Vercel 서버 함수: POST /api/reading
import { handle } from "../lib/reading.js";

// maxDuration은 vercel.json에 설정 (Node 함수 형식에 맞춰 적용).

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 지원합니다." }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress;
  const out = await handle(body, ip);
  res.status(out.status).json(out.json);
}
