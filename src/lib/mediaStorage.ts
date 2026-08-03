import fs from "node:fs/promises"
import path from "node:path"
import { createHmac, timingSafeEqual } from "node:crypto"

// ─── Diretório privado de uploads ─────────────────────────────────────────────
// Fora de /public para que o Next.js NUNCA sirva esses arquivos diretamente.
// Em Docker, monte o volume em /app/private-uploads.
function getUploadsDir(): string {
  return process.env.UPLOADS_DIR ?? path.join(process.cwd(), "private-uploads")
}

// Compatibilidade com mídia salva pelo build anterior (em /public/uploads).
// Mantido apenas para LEITURA. Saídas novas vão para o dir privado.
function getLegacyUploadsDir(): string {
  return path.join(process.cwd(), "public", "uploads")
}

// ─── Sanitização de nome de arquivo ──────────────────────────────────────────
// Aceita só caracteres seguros. Reject path traversal, NTFS reserved, etc.
const SAFE_FILENAME = /^[a-zA-Z0-9._-]{1,200}$/

export function isSafeFilename(name: string): boolean {
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) return false
  return SAFE_FILENAME.test(name)
}

function buildSafeName(originalName: string | undefined, mimetype: string): string {
  const ext = (mimetype.split("/")[1] ?? "bin").split(";")[0].replace(/[^a-zA-Z0-9]/g, "") || "bin"
  if (originalName) {
    // Nome original pode ter ".." (dois pontos seguidos, digitação comum em
    // arquivos tipo "Nome..pdf") — isSafeFilename rejeita QUALQUER ".." como
    // proteção contra path traversal, então o arquivo salvo nunca pode ter
    // essa sequência ou o link de download quebra pro cliente pra sempre.
    const clean = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, ".")
    return `${Date.now()}-${clean}`.slice(0, 200)
  }
  return `${Date.now()}.${ext}`
}

// ─── Persistência ─────────────────────────────────────────────────────────────

export async function saveMediaBuffer(
  buffer: Buffer,
  mimetype: string,
  originalName?: string,
): Promise<{ filename: string; mediaUrl: string; mediaType: string }> {
  const dir = getUploadsDir()
  const filename = buildSafeName(originalName, mimetype)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, filename), buffer)
  return {
    filename,
    mediaUrl: `/api/media/${filename}`,
    mediaType: mimetype,
  }
}

// Lê o arquivo do dir privado; cai no legacy se não existir lá.
export async function readMediaFile(
  filename: string,
): Promise<{ data: Buffer; from: "primary" | "legacy" } | null> {
  if (!isSafeFilename(filename)) return null
  const dirs: Array<{ dir: string; from: "primary" | "legacy" }> = [
    { dir: getUploadsDir(), from: "primary" },
    { dir: getLegacyUploadsDir(), from: "legacy" },
  ]
  for (const { dir, from } of dirs) {
    try {
      const data = await fs.readFile(path.join(dir, filename))
      return { data, from }
    } catch {
      // tenta próximo
    }
  }
  return null
}

// ─── URLs assinadas (para a Evolution baixar mídia outbound) ──────────────────
// Reusa JWT_SECRET. Token = HMAC-SHA256(filename + "." + exp). Janela curta.

function getSigningSecret(): string {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET ausente em produção (signing media tokens).")
    }
    return "dev-secret-change-me-32chars!!"
  }
  return s
}

function sign(filename: string, exp: number): string {
  return createHmac("sha256", getSigningSecret())
    .update(`${filename}.${exp}`)
    .digest("hex")
}

export function signMediaUrl(
  filename: string,
  ttlSeconds: number = 300,
): { token: string; exp: number; queryString: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const token = sign(filename, exp)
  return { token, exp, queryString: `token=${token}&exp=${exp}` }
}

export function verifyMediaToken(
  filename: string,
  token: string | null,
  expStr: string | null,
): boolean {
  if (!token || !expStr) return false
  const exp = Number.parseInt(expStr, 10)
  if (!Number.isFinite(exp)) return false
  if (exp < Math.floor(Date.now() / 1000)) return false
  const expected = sign(filename, exp)
  const a = Buffer.from(token, "utf8")
  const b = Buffer.from(expected, "utf8")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ─── Validação MIME (compartilhada por send-media e broadcast/upload) ────────

const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/"]
const ALLOWED_MIME_EXACT = new Set([
  "application/pdf",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
])
// SVG é image/* mas pode conter scripts; HTML idem. Tudo servido por nós,
// então mantemos o XSS fora.
const BLOCKED_MIME = new Set(["image/svg+xml", "text/html", "application/xhtml+xml"])

// Teto do upload no backend. Damos folga (120 MB) acima do teto de front
// (~100 MB pra video/documento) pra absorver o overhead do multipart. O nginx
// (client_max_body_size=130M) fica acima disso. A Z-API aceita video ate 100 MB;
// se estourar o limite efetivo do WhatsApp, a Z-API devolve erro e marcamos FAILED.
export const MAX_UPLOAD_BYTES = 120 * 1024 * 1024

export function isMimeAllowed(mime: string): boolean {
  if (BLOCKED_MIME.has(mime)) return false
  if (ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))) return true
  return ALLOWED_MIME_EXACT.has(mime)
}
