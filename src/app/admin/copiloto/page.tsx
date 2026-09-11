"use client"

import { useCallback, useEffect, useState } from "react"

// ─── Copiloto — Base de Conhecimento (admin) ─────────────────────────────────
// Texto livre que alimenta a IA nas sugestões de resposta. Escreva como se
// estivesse treinando uma vendedora nova: produtos, políticas, tom de voz.

const MODELO_INICIAL = `# SOBRE A FRT
[PREENCHER: tempo de mercado, porte, clientes típicos — ex.: bancos, cooperativas, varejo]

# PRODUTOS E DIFERENCIAIS
- Contadoras de cédulas e moedas: [modelos e diferenciais]
- Fragmentadoras: [modelos e diferenciais]
- [outras linhas...]

# ASSISTÊNCIA TÉCNICA
- Autorizadas trabalham com troca de peças. Equipamento fora de linha (ex.: HT8000) não tem peça na autorizada.
- O laboratório da fábrica repara em nível de componente na placa, sem depender de peça de reposição — serviço exclusivo da FRT.
- Envio pra fábrica: frete de ida e volta por conta da FRT. Diagnóstico por escrito antes de aprovar qualquer serviço.

# POLÍTICAS
- Garantia: [PREENCHER]
- Frete: [PREENCHER]
- Formas de pagamento: [PREENCHER — ex.: 3% off no PIX]

# TOM DE VOZ
Direto e humano. Técnico quando o cliente pedir. Sempre a favor da FRT, sem mentir e sem atacar autorizadas ou concorrentes. Nunca prometer prazo sem confirmar.`

export default function CopilotoPage() {
  const [content, setContent] = useState("")
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [updatedBy, setUpdatedBy] = useState<string | null>(null)
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [okMsg, setOkMsg] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/copiloto")
    if (res.ok) {
      const data = await res.json() as { content: string; updatedAt: string | null; updatedBy: string | null; configured: boolean }
      setContent(data.content)
      setUpdatedAt(data.updatedAt)
      setUpdatedBy(data.updatedBy)
      setConfigured(data.configured)
    }
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (saving) return
    setSaving(true)
    setOkMsg(false)
    try {
      const res = await fetch("/api/admin/copiloto", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      if (res.ok) {
        const data = await res.json() as { updatedAt: string }
        setUpdatedAt(data.updatedAt)
        setOkMsg(true)
        setTimeout(() => setOkMsg(false), 3000)
      } else {
        alert("Não foi possível salvar")
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-full bg-zinc-50 font-sans">
      <header className="border-b border-zinc-200 bg-white px-4 py-5 md:px-8">
        <h1 className="text-xl font-semibold text-zinc-900 md:text-2xl">🧠 Copiloto — Base de Conhecimento</h1>
        <p className="mt-0.5 max-w-2xl text-[12.5px] text-zinc-500">
          Tudo que a IA sabe sobre a FRT vem daqui. Escreva como se estivesse treinando uma vendedora nova —
          quanto melhor o conteúdo, melhores as sugestões de resposta no chat.
        </p>
        {!configured && (
          <p className="mt-2 inline-block rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] font-medium text-amber-800">
            ⚠️ A chave da IA (ANTHROPIC_API_KEY) ainda não está configurada no servidor — o botão ✨ do chat não funciona até configurar.
          </p>
        )}
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
        {loading ? (
          <p className="py-8 text-center text-[13px] text-zinc-400">Carregando…</p>
        ) : (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            {content.trim() === "" && (
              <div className="mb-3 flex items-center justify-between rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3">
                <p className="text-[12.5px] text-zinc-600">Base vazia. Quer começar com um modelo pronto pra preencher?</p>
                <button
                  type="button"
                  onClick={() => setContent(MODELO_INICIAL)}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-zinc-700"
                >
                  Usar modelo
                </button>
              </div>
            )}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={22}
              placeholder="Ex.: produtos e diferenciais, políticas de garantia e frete, como funciona a assistência, tom de voz…"
              className="w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-zinc-800 outline-none focus:border-zinc-400 focus:bg-white"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-zinc-400">
                {updatedAt ? `Última atualização: ${new Date(updatedAt).toLocaleString("pt-BR")}${updatedBy ? ` · ${updatedBy}` : ""}` : "Nunca salva"}
              </p>
              <div className="flex items-center gap-3">
                {okMsg && <span className="text-[12px] font-medium text-emerald-700">✅ Salvo!</span>}
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="rounded-xl bg-emerald-500 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {saving ? "Salvando…" : "Salvar base de conhecimento"}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
