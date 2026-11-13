// 결과 파일 만들기: 화면이 몇 덩어리로 그린 JPEG 조각을 받아
//  - jpg: 세로로 이어 붙인 긴 이미지 1장
//  - pdf: 조각마다 한 쪽씩 담은 PDF 1개
// 로 합친 뒤, 진짜 주소(https://…/api/export/<id>)로 내려준다.
// 카카오톡 등 앱 안 브라우저는 페이지가 만든 blob 파일을 제대로 받지 못하므로 서버 주소가 필요하다.
// 파일은 서버 메모리에만 15분 보관하고 지운다.
import { randomUUID } from "node:crypto";

const KEEP_MS = 15 * 60 * 1000;
const MAX_PARTS = 12;
export const MAX_UPLOAD = 40 * 1024 * 1024;
const MAX_HEIGHT = 65000;            // JPEG 한 장의 최대 높이(규격 한도 65535)
const files = new Map();             // id → {buf, mime, name, until}
let storedBytes = 0;

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function prune() {
  const now = Date.now();
  for (const [id, f] of files) if (f.until <= now) { storedBytes -= f.buf.length; files.delete(id); }
  // 메모리 보호: 총 200MB를 넘으면 오래된 것부터 지운다
  for (const [id, f] of files) { if (storedBytes <= 200 * 1024 * 1024) break; storedBytes -= f.buf.length; files.delete(id); }
}

/** JPEG의 SOF 표식에서 가로·세로 크기를 읽는다 (외부 라이브러리 없이 PDF를 만들 때 사용). */
export function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw fail("JPEG 이미지가 아니에요.");
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), components: buf[i + 9] };
    }
    i += 2 + len;
  }
  throw fail("이미지 크기를 읽지 못했어요.");
}

/** JPEG 조각마다 한 쪽씩, 가로 595pt(A4 폭)에 맞춘 PDF를 만든다. */
export function buildPdf(parts) {
  const chunks = [], offsets = [];
  let size = 0;
  const push = (b) => { const buf = Buffer.isBuffer(b) ? b : Buffer.from(b, "latin1"); chunks.push(buf); size += buf.length; };
  const obj = (n, body) => { offsets[n] = size; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push("\nendobj\n"); };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const pageW = 595.28;
  const kids = parts.map((_, k) => `${3 + k * 3} 0 R`).join(" ");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${parts.length} >>`);
  parts.forEach((jpg, k) => {
    const { width, height, components } = jpegSize(jpg);
    const pageH = Math.min(14400, +(pageW * height / width).toFixed(2)); // PDF 쪽 높이 한도 14400pt
    const pageN = 3 + k * 3, contN = pageN + 1, imgN = pageN + 2;
    const cs = components === 1 ? "/DeviceGray" : components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
    obj(pageN, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im${k} ${imgN} 0 R >> >> /Contents ${contN} 0 R >>`);
    const draw = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im${k} Do Q`;
    obj(contN, [`<< /Length ${draw.length} >>\nstream\n`, draw, "\nendstream"]);
    obj(imgN, [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, jpg, "\nendstream"]);
  });
  const xref = size, count = 3 + parts.length * 3;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(String(offsets[n]).padStart(10, "0") + " 00000 n \n");
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

/** JPEG 조각들을 세로로 이어 긴 JPEG 1장으로 만든다. */
export async function stitchJpeg(parts) {
  if (parts.length === 1) return parts[0];
  const { default: sharp } = await import("sharp");
  const sizes = parts.map(jpegSize);
  const width = Math.max(...sizes.map(s => s.width));
  const height = sizes.reduce((a, s) => a + s.height, 0);
  if (height > MAX_HEIGHT) throw fail("이미지가 너무 길어요. PDF로 저장해 주세요.", 413);
  let top = 0;
  const composite = parts.map((input, k) => { const c = { input, top, left: 0 }; top += sizes[k].height; return c; });
  return sharp({ create: { width, height, channels: 3, background: "#F6F0E2" }, limitInputPixels: false })
    .composite(composite).jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toBuffer();
}

const safeName = (s) => String(s || "").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 40) || "saju";

/** body: 이어 붙인 JPEG 바이트, sizes: 각 조각 바이트 수 */
export async function createExport(body, { kind, sizes, name }) {
  prune();
  if (kind !== "jpg" && kind !== "pdf") throw fail("파일 종류를 확인해 주세요.");
  const lens = String(sizes || "").split(",").map(Number);
  if (!lens.length || lens.length > MAX_PARTS || lens.some(n => !Number.isInteger(n) || n <= 0)) throw fail("이미지 조각 정보가 올바르지 않아요.");
  if (lens.reduce((a, b) => a + b, 0) !== body.length) throw fail("이미지 데이터가 다 오지 않았어요. 다시 시도해 주세요.");
  const parts = []; let at = 0;
  for (const n of lens) { parts.push(body.subarray(at, at + n)); at += n; }
  parts.forEach(jpegSize);   // 모두 JPEG인지 확인
  const buf = kind === "pdf" ? buildPdf(parts) : await stitchJpeg(parts);
  const id = randomUUID();
  const file = { buf, mime: kind === "pdf" ? "application/pdf" : "image/jpeg", name: `${safeName(name)}.${kind}`, until: Date.now() + KEEP_MS };
  files.set(id, file); storedBytes += buf.length;
  return { id, name: file.name, bytes: buf.length };
}

export function getExport(id) {
  prune();
  return typeof id === "string" && /^[0-9a-f-]{36}$/.test(id) ? files.get(id) || null : null;
}

/** 한글 파일 이름을 안전하게 담은 Content-Disposition 값 */
export function disposition(name, inline = false) {
  // 한글을 못 읽는 다운로드 프로그램용 이름: '나의사주_2000-01-19.jpg' → 'saju_2000-01-19.jpg'
  const ascii = ("saju_" + name.replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "").replace(/^_+/, "")).replace(/_+/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
