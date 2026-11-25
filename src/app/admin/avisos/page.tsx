"use client"

import { useCallback, useEffect, useState } from "react"

// ─── Avisos com ciência ─────────────────────────────────────────────────────
// Administrador escolhe uma ou várias pessoas, escreve o aviso e acompanha
// quem já deu ciência. Cada pessoa vê os seus avisos e a data da ciência.

interface Aviso {
  id: string; titulo: string; texto: string; imagemUrl: string | null; criadoEm: string; deNome: string; minhaCiencia: string | null
  destinatarios?: { id: string; nome: string; cienteAt: string | null }[]
}
interface Pessoa { id: string; name: string }

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

export default function AvisosPage() {
  const [ehAdmin, setEhAdmin] = useState<boolean | null>(null)
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set())
  const [titulo, setTitulo] = useState("")
  const [texto, setTexto] = useState("")
  const [imagem, setImagem] = useState<string | null>(null)
  const [subindo, setSubindo] = useState(false)
  const [erro, setErro] = useState("")
  const [ok, setOk] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async (admin: boolean) => {
    try {
      const r = await fetch(`/api/avisos${admin ? "?todos=1" : ""}`, { cache: "no-store" })
      if (!r.ok) throw new Error()
      setAvisos(((await r.json()) as { avisos: Aviso[] }).avisos); setErro("")
    } catch { setErro("Não consegui carregar os avisos. Tente de novo.") }
    finally { setCarregando(false) }
  }, [])

  useEffect(() => {
    void (async () => {
      let admin = false
      try {
        const me = await fetch("/api/me", { cache: "no-store" })
        if (me.ok) admin = ((await me.json()) as { role?: string }).role === "ADMIN"
      } catch { /* cai para a visão de agente */ }
      setEhAdmin(admin)
      await carregar(admin)
      if (admin) { try { setPessoas((await (await fetch("/api/internal/users")).json()) as Pessoa[]) } catch { /* lista vazia */ } }
    })()
  }, [carregar])

  const alternar = (id: string) => setEscolhidos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const todosMarcados = pessoas.length > 0 && escolhidos.size === pessoas.length

  // Cola (Ctrl+V) ou escolhe uma imagem: envia na hora e mostra a prévia.
  async function subirImagem(arquivo: File) {
    setErro(""); setOk(""); setSubindo(true)
    try {
      const f = new FormData(); f.append("file", arquivo, arquivo.name || "imagem.png")
      const r = await fetch("/api/avisos/imagem", { method: "POST", body: f })
      const d = (await r.json().catch(() => ({}))) as { erro?: string; mediaUrl?: string }
      if (!r.ok || !d.mediaUrl) { setErro(d.erro ?? "Não foi possível enviar a imagem."); return }
      setImagem(d.mediaUrl)
    } catch { setErro("Falha de conexão ao enviar a imagem.") }
    finally { setSubindo(false) }
  }
  function aoColar(e: React.ClipboardEvent) {
    const item = [...e.clipboardData.items].find((i) => i.kind === "file" && i.type.startsWith("image/"))
    const arq = item?.getAsFile()
    if (arq) { e.preventDefault(); void subirImagem(arq) }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(""); setOk("")
    if (escolhidos.size === 0) { setErro("Escolha pelo menos uma pessoa para receber o aviso."); return }
    setEnviando(true)
    try {
      const r = await fetch("/api/avisos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo, texto, userIds: [...escolhidos], imagemUrl: imagem }) })
      const d = (await r.json().catch(() => ({}))) as { erro?: string; destinatarios?: number }
      if (!r.ok) { setErro(d.erro ?? "Não foi possível enviar o aviso."); return }
      setOk(`Aviso enviado para ${d.destinatarios} pessoa(s). Ele aparece na tela de cada uma.`)
      setTitulo(""); setTexto(""); setImagem(null); setEscolhidos(new Set())
      await carregar(true)
    } catch { setErro("Falha de conexão. O aviso não foi enviado.") }
    finally { setEnviando(false) }
  }

  async function lembrar(id: string) {
    setErro(""); setOk("")
    const r = await fetch(`/api/avisos/${id}/lembrar`, { method: "POST" })
    const d = (await r.json().catch(() => ({}))) as { erro?: string; lembrados?: number }
    if (!r.ok) { setErro(d.erro ?? "Não foi possível enviar o lembrete."); return }
    setOk(`Lembrete enviado para ${d.lembrados} pessoa(s) que ainda não deram ciência.`)
  }

  async function apagar(id: string) {
    if (!window.confirm("Apagar este aviso? Ele some da tela de quem ainda não deu ciência.")) return
    const r = await fetch(`/api/avisos/${id}`, { method: "DELETE" })
    if (r.ok) await carregar(true); else setErro("Não foi possível apagar.")
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-800">📢 {ehAdmin ? "Avisos para a equipe" : "Meus avisos"}</h1>
        <p className="text-[13px] text-zinc-500">{ehAdmin ? "O aviso aparece grande na tela de cada pessoa escolhida, e fica registrado quem deu ciência." : "Avisos enviados para você e a data em que deu ciência."}</p>
      </div>
      {erro && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{erro}</p>}
      {ok && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">{ok}</p>}

      {ehAdmin && (
        <form onSubmit={enviar} onPaste={aoColar} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-[14px] font-semibold text-zinc-700">Novo aviso</h2>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} placeholder="Título do aviso" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-[14px]" />
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1500} rows={4} placeholder="Escreva o aviso" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-[14px]" />
          <div>
            {imagem ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element -- prévia da imagem anexada */}
                <img src={imagem} alt="Imagem do aviso" className="max-h-48 rounded-xl border border-zinc-200" />
                <button type="button" onClick={() => setImagem(null)} className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-[12px] font-semibold text-white">Remover</button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-3 py-2.5 text-[13px] text-zinc-500 hover:bg-zinc-50">
                <span aria-hidden>🖼️</span>
                <span>{subindo ? "Enviando imagem…" : "Anexar imagem (opcional): clique para escolher ou cole com Ctrl+V"}</span>
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" disabled={subindo}
                  onChange={(e) => { const a = e.target.files?.[0]; if (a) void subirImagem(a); e.target.value = "" }} />
              </label>
            )}
          </div>
          <fieldset>
            <legend className="mb-1.5 flex w-full items-center justify-between text-[13px] font-medium text-zinc-700">
              <span>Quem vai receber? ({escolhidos.size} escolhida{escolhidos.size === 1 ? "" : "s"})</span>
              <button type="button" onClick={() => setEscolhidos(todosMarcados ? new Set() : new Set(pessoas.map((p) => p.id)))} className="text-[12px] text-emerald-700 underline">{todosMarcados ? "Limpar seleção" : "Selecionar todos"}</button>
            </legend>
            <div className="grid max-h-52 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-zinc-200 p-2 sm:grid-cols-2">
              {pessoas.map((p) => (
                <label key={p.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] ${escolhidos.has(p.id) ? "bg-sky-50 text-sky-900" : "hover:bg-zinc-50"}`}>
                  <input type="checkbox" checked={escolhidos.has(p.id)} onChange={() => alternar(p.id)} className="h-4 w-4 accent-sky-600" />{p.name}
                </label>
              ))}
              {pessoas.length === 0 && <p className="p-2 text-[12px] text-zinc-400">Nenhuma pessoa encontrada.</p>}
            </div>
          </fieldset>
          <button disabled={enviando} className="rounded-lg bg-sky-600 px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-60">{enviando ? "Enviando…" : "Enviar aviso"}</button>
        </form>
      )}

      {carregando ? <p className="text-[13px] text-zinc-400">Carregando…</p> : (
        <section className="space-y-3">
          <h2 className="text-[14px] font-semibold text-zinc-700">{ehAdmin ? "Avisos enviados" : "Histórico"} ({avisos.length})</h2>
          {avisos.length === 0 && <p className="rounded-xl bg-zinc-50 px-3 py-4 text-center text-[13px] text-zinc-400">Nenhum aviso por enquanto.</p>}
          {avisos.map((a) => {
            const total = a.destinatarios?.length ?? 0
            const cientes = a.destinatarios?.filter((d) => d.cienteAt).length ?? 0
            return (
              <div key={a.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-semibold text-zinc-800">{a.titulo}</p>
                    <p className="text-[12px] text-zinc-500">{ehAdmin ? "" : `De ${a.deNome} · `}{quando(a.criadoEm)}{!ehAdmin && (a.minhaCiencia ? ` · ciente em ${quando(a.minhaCiencia)} ✓` : " · aguardando a sua ciência")}</p>
                  </div>
                  {ehAdmin && (
                    <div className="flex items-center gap-3">
                      {cientes < total && <button onClick={() => void lembrar(a.id)} className="text-[12px] font-medium text-sky-700 underline">Lembrar quem falta</button>}
                      <button onClick={() => void apagar(a.id)} className="text-[12px] text-zinc-400 hover:text-red-600">Apagar</button>
                    </div>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[13px] text-zinc-600">{a.texto}</p>
                {a.imagemUrl && (
                  <a href={a.imagemUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- miniatura da imagem do aviso */}
                    <img src={a.imagemUrl} alt="Imagem do aviso" className="max-h-40 rounded-lg border border-zinc-200" />
                  </a>
                )}
                {ehAdmin && a.destinatarios && (
                  <div className="mt-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-zinc-200"><div className="h-full bg-emerald-500" style={{ width: `${total ? (cientes / total) * 100 : 0}%` }} /></div>
                      <span className="text-[12px] font-medium text-zinc-600">{cientes} de {total} deram ciência</span>
                    </div>
                    <ul className="flex flex-wrap gap-1.5">
                      {a.destinatarios.map((d) => (
                        <li key={d.id} className={`rounded-full px-2.5 py-1 text-[12px] ${d.cienteAt ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                          {d.cienteAt ? "✅" : "⏳"} {d.nome}{d.cienteAt ? ` · ${quando(d.cienteAt)}` : " · falta"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
