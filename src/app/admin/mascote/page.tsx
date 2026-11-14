"use client"

import { useEffect, useState } from "react"

// ─── Treinar o mascote (admin) ───────────────────────────────────────────────
// Texto livre que o mascote lê antes de conversar com a equipe. Escreva como se
// estivesse orientando um colega novo: tom, assuntos, campanhas do mês, o que
// cobrar, o que evitar. As regras de segurança do mascote não mudam.

const EXEMPLO = `# TOM
Carinhoso e brincalhão, mas sem exagero. Chame todo mundo pelo primeiro nome.

# FOCO DA SEMANA
- Retornos agendados são prioridade: cliente esperando esfria rápido.
- Campanha do mês: [PREENCHER]

# COMO MOTIVAR
Reconheça quem atendeu rápido. Em dia puxado, sugira uma pausa curta.

# NUNCA
- Falar de salário, demissão ou avaliação de colegas.
- Prometer prazo ou desconto.`

export default function MascoteTreinoPage() {
  const [content, setContent] = useState("")
  const [max, setMax] = useState(6000)
  const [atualizado, setAtualizado] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    let vivo = true
    fetch("/api/admin/mascote-treino", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error()
        const d = (await r.json()) as { content: string; updatedAt: string | null; max: number }
        if (!vivo) return
        setContent(d.content); setAtualizado(d.updatedAt); setMax(d.max)
      })
      .catch(() => { if (vivo) setMsg({ ok: false, texto: "Não consegui carregar o treinamento. Tente recarregar a página." }) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [])

  async function salvar() {
    setSalvando(true); setMsg(null)
    try {
      const r = await fetch("/api/admin/mascote-treino", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }),
      })
      const d = (await r.json().catch(() => ({}))) as { erro?: string }
      if (!r.ok) throw new Error(d.erro ?? "Erro ao salvar.")
      setMsg({ ok: true, texto: "Salvo! O mascote já usa o novo treinamento na próxima conversa." })
      setAtualizado(new Date().toISOString())
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : "Erro ao salvar." })
    } finally { setSalvando(false) }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="text-xl font-bold text-zinc-900">🤖 Treinar o mascote</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Escreva o que o mascote deve saber e como deve conversar com a equipe: tom, campanhas, o que cobrar, o que evitar.
        Ele já cobra os retornos, ajuda a relaxar e motiva sozinho — aqui você ajusta o jeito dele.
      </p>

      {carregando ? (
        <p className="mt-6 text-sm text-zinc-500">Carregando…</p>
      ) : (
        <>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, max))}
            rows={16}
            placeholder={EXEMPLO}
            className="mt-4 w-full rounded-xl border border-zinc-300 p-3 text-sm leading-relaxed text-zinc-800 outline-none focus:border-[#0b3f8a]"
          />
          <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
            <span>{content.length}/{max} caracteres</span>
            {atualizado && <span>Última atualização: {new Date(atualizado).toLocaleString("pt-BR")}</span>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button" onClick={salvar} disabled={salvando}
              className="rounded-lg bg-[#002d6b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b3f8a] disabled:opacity-50"
            >
              {salvando ? "Salvando…" : "Salvar treinamento"}
            </button>
            {!content && (
              <button type="button" onClick={() => setContent(EXEMPLO)} className="text-sm font-semibold text-emerald-700 hover:underline">
                Começar com um modelo
              </button>
            )}
            {msg && <span role="status" className={`text-sm font-medium ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.texto}</span>}
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            Segurança: o mascote nunca inventa preço/prazo, não fala de dados de clientes além do nome nos retornos e não envia nada a clientes.
            Para ver o efeito, clique em &quot;▶ Chamar agora&quot; no menu (só administradores).
          </p>
        </>
      )}
    </div>
  )
}
