"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"

// ─── Types ────────────────────────────────────────────────────────────────────

type ConnectionStatus = "loading" | "qr" | "connecting" | "connected" | "error"

// Evolution devolve `code` (texto do QR); Z-API devolve `base64` (imagem
// pronta). Antes a tela só aceitava `code`, então com a Z-API caía direto em
// "QR code não disponível".
interface QRResponse {
  code?: string | null
  base64?: string
  connected?: boolean
  error?: string
}

const CHAVE_TELEFONE = "whatsfrt.connect.telefone"

interface StatusResponse {
  instance?: { state: "open" | "close" | "connecting" | "qrcode" }
  error?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_POLL_MS = 3_000
const QR_REFRESH_MS = 20_000

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; dotClass: string; pulse: boolean }
> = {
  loading:    { label: "Carregando código...",     dotClass: "bg-zinc-400",    pulse: true  },
  qr:         { label: "Escaneie o QR code",      dotClass: "bg-blue-500",    pulse: true  },
  connecting: { label: "Autenticando...",          dotClass: "bg-amber-500",   pulse: true  },
  connected:  { label: "Conectado!",            dotClass: "bg-emerald-500", pulse: false },
  error:      { label: "Erro de conexão",       dotClass: "bg-red-500",     pulse: false },
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="h-10 w-10 animate-spin text-zinc-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConnectPage() {
  const router = useRouter()
  const [status, setStatus] = useState<ConnectionStatus>("loading")
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Código de telefone (alternativa ao QR, Z-API)
  const [telefone, setTelefone] = useState("")
  const [codigo, setCodigo] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [erroCodigo, setErroCodigo] = useState<string | null>(null)

  // Lê no efeito (e não no useState inicial) porque no servidor não existe
  // localStorage — ler no estado inicial dava diferença servidor/navegador.
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_TELEFONE)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com armazenamento externo uma vez ao montar
      if (salvo) setTelefone(salvo)
    } catch { /* sem localStorage: só não lembra o número */ }
  }, [])

  const gerarCodigo = async () => {
    setGerando(true)
    setErroCodigo(null)
    setCodigo(null)
    try {
      const res = await fetch("/api/whatsapp/phone-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: telefone }),
      })
      const data = (await res.json()) as { code?: string; error?: string }
      if (!res.ok || !data.code) throw new Error(data.error ?? "Não foi possível gerar o código")
      // Gerar QR novo pode invalidar o código — para de renovar o QR enquanto
      // o código está na tela. A checagem de status continua rodando.
      if (qrTimerRef.current) clearInterval(qrTimerRef.current)
      qrTimerRef.current = null
      setCodigo(data.code)
      try { localStorage.setItem(CHAVE_TELEFONE, telefone) } catch { /* ok */ }
    } catch (e) {
      setErroCodigo(e instanceof Error ? e.message : "Erro desconhecido")
    } finally {
      setGerando(false)
    }
  }

  const mountedRef = useRef(true)
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cfg = STATUS_CONFIG[status]

  useEffect(() => {
    mountedRef.current = true

    const doFetchQR = async () => {
      if (!mountedRef.current) return
      setStatus("loading")
      setError(null)
      try {
        const res = await fetch("/api/whatsapp/qrcode")
        const data: QRResponse = await res.json()
        if (!mountedRef.current) return
        if (res.ok && data.connected) {
          if (statusTimerRef.current) clearInterval(statusTimerRef.current)
          if (qrTimerRef.current) clearInterval(qrTimerRef.current)
          setStatus("connected")
          setTimeout(() => router.push("/admin/dashboard"), 1_200)
          return
        }
        if (res.ok && data.base64) { setQrImage(data.base64); setQrCode(null); setStatus("qr"); return }
        if (res.ok && data.code) { setQrCode(data.code); setQrImage(null); setStatus("qr"); return }
        throw new Error(data.error ?? "QR code não disponível")
      } catch (e) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : "Erro desconhecido")
          setStatus("error")
        }
      }
    }

    const doCheckStatus = async () => {
      if (!mountedRef.current) return
      try {
        const res = await fetch("/api/whatsapp/status")
        const data: StatusResponse = await res.json()
        if (!mountedRef.current) return
        const state = data.instance?.state
        if (state === "open") {
          if (statusTimerRef.current) clearInterval(statusTimerRef.current)
          if (qrTimerRef.current) clearInterval(qrTimerRef.current)
          setStatus("connected")
          setTimeout(() => router.push("/admin/dashboard"), 1_200)
        }
        // Don't overwrite 'qr' with 'connecting': the API returns 'connecting'
        // both while waiting for scan AND while authenticating post-scan.
        // Only show 'connecting' (blurred QR) when we have no QR code to display.
      } catch { /* silently ignore polling errors */ }
    }

    void doFetchQR().then(() => {
      if (!mountedRef.current) return
      statusTimerRef.current = setInterval(() => void doCheckStatus(), STATUS_POLL_MS)
      qrTimerRef.current = setInterval(() => void doFetchQR(), QR_REFRESH_MS)
    })

    return () => {
      mountedRef.current = false
      if (statusTimerRef.current) clearInterval(statusTimerRef.current)
      if (qrTimerRef.current) clearInterval(qrTimerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="min-h-screen bg-[#f7f8fa] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] space-y-5">

        {/* ── Card ── */}
        <div className="overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-xl shadow-zinc-200/50">

          {/* Top accent stripe */}
          <div className="h-[3px] bg-gradient-to-r from-emerald-500 to-emerald-700" />

          <div className="space-y-7 p-8">

            {/* ── Header ── */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <WhatsAppIcon />
                </span>
                <div>
                  <h1 className="text-[17px] font-semibold tracking-tight text-zinc-900">
                    Conectar WhatsApp
                  </h1>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Número da empresa no sistema
                  </p>
                </div>
              </div>

              {/* Status badge */}
              <div className="flex w-fit items-center gap-2 rounded-full border border-zinc-100 bg-zinc-50 px-3.5 py-1.5">
                <span className="relative flex h-2 w-2">
                  {cfg.pulse && (
                    <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${cfg.dotClass}`} />
                  )}
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${cfg.dotClass}`} />
                </span>
                <span className="text-xs font-medium text-zinc-600">{cfg.label}</span>
              </div>
            </div>

            {/* ── QR Code area ── */}
            <div className="flex h-[264px] w-full items-center justify-center rounded-2xl border-2 border-dashed border-zinc-100 bg-[#fafafa]">

              {status === "loading" && <Spinner />}

              {status === "connected" && (
                <div className="flex flex-col items-center gap-3">
                  <CheckCircleIcon />
                  <p className="text-sm font-medium text-emerald-600">Redirecionando...</p>
                </div>
              )}

              {status === "error" && (
                <div className="flex flex-col items-center gap-4 px-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                    <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <p className="text-sm leading-relaxed text-zinc-500">{error}</p>
                  <button
                    onClick={() => globalThis.location.reload()}
                    className="rounded-xl bg-zinc-900 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-700 active:scale-95"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {(status === "qr" || status === "connecting") && qrImage && (
                // eslint-disable-next-line @next/next/no-img-element -- data: URL, next/image não otimiza
                <img src={qrImage} alt="QR code para conectar o WhatsApp" className="h-[216px] w-[216px] rounded-xl" />
              )}

              {(status === "qr" || status === "connecting") && !qrImage && qrCode && (
                <div className="rounded-xl p-3 opacity-100 blur-0 scale-100 transition-all duration-500">
                  <QRCodeSVG
                    value={qrCode}
                    size={216}
                    bgColor="#fafafa"
                    fgColor="#0f172a"
                    level="M"
                    marginSize={1}
                  />
                </div>
              )}
            </div>

            {/* ── Footer instructions ── */}
            <ol className="space-y-2.5">
              {[
                "Abra o WhatsApp no seu celular",
                'Toque em "Dispositivos conectados"',
                "Escaneie o código QR acima",
              ].map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-500">
                    {i + 1}
                  </span>
                  <span className="text-xs leading-relaxed text-zinc-500">{step}</span>
                </li>
              ))}
            </ol>

            {/* ── Alternativa: código de telefone ── */}
            {status !== "connected" && (
              <div className="space-y-3 rounded-2xl border border-zinc-100 bg-zinc-50/70 p-4">
                <div>
                  <p className="text-[13px] font-semibold text-zinc-800">Sem câmera? Conecte com código</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-500">
                    Serve pra conectar de longe, usando um app de acesso remoto (AnyDesk, TeamViewer) no celular da empresa.
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    placeholder="Número da empresa: 5543999998888"
                    className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] text-zinc-900 outline-none focus:border-zinc-400"
                  />
                  <button
                    type="button"
                    onClick={() => void gerarCodigo()}
                    disabled={gerando || telefone.replace(/\D/g, "").length < 12}
                    className="flex-shrink-0 rounded-xl bg-zinc-900 px-4 py-2 text-[12px] font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
                  >
                    {gerando ? "Gerando…" : "Gerar código"}
                  </button>
                </div>
                {erroCodigo && <p className="text-[12px] text-red-600">{erroCodigo}</p>}
                {codigo && (
                  <div className="space-y-2">
                    <p className="select-all rounded-xl bg-white py-3 text-center font-mono text-[22px] font-bold tracking-[0.25em] text-zinc-900">
                      {codigo}
                    </p>
                    <p className="text-[11.5px] leading-relaxed text-zinc-500">
                      No celular: WhatsApp → <b>Dispositivos conectados</b> → <b>Conectar dispositivo</b> →{" "}
                      <b>Conectar com número de telefone</b> → digite o código. Ele vale por pouco tempo; se expirar, gere outro.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card footer */}
          <div className="border-t border-zinc-50 bg-zinc-50/60 px-8 py-3">
            <p className="text-center text-[11px] text-zinc-400">
              Código atualizado automaticamente a cada 20 segundos
            </p>
          </div>
        </div>

        {/* System label */}
        <p className="text-center text-[11px] text-zinc-400">
          WhatsFRT · Sistema Interno de Mensageria
        </p>
      </div>
    </main>
  )
}
