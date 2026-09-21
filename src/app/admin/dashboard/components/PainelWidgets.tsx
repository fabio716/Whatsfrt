"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import DraggableWidgetGrid, { type WidgetItem } from "@/components/ui/draggable-widget-grid"

// ═══════════════════════════════════════════════════════════════════════════
// Painel de cartões arrastáveis.
//
// Cada pessoa vê SÓ os dados dela — o recorte é feito no servidor
// (/api/dashboard), nunca aqui. A vendedora não recebe o número das outras
// nem escondido no JSON.
//
// A ordem dos cartões é dela também: arrastou, salvou no banco, segue pro
// celular. Admin tem cartões a mais (fila, por vendedora, equipe).
// ═══════════════════════════════════════════════════════════════════════════

interface Painel {
  escopo: "AGENT" | "ADMIN"
  nome: string
  atualizadoEm: string
  emAtendimento: number
  atendimentosHoje: number
  csat: { media: number | null; respostas: number }
  mensagens: { enviadas: number; recebidas: number; total: number; porHora: number[] }
  carteira: { quente: number; morno: number; frio: number; semMarcacao: number; total: number }
  semResposta: number
  filaGeral: number
  porVendedora: Array<{ id: string; name: string; atendimentos: number }>
  equipe: Array<{ id: string; name: string; status: "ATTENDING" | "ONLINE" | "OFFLINE"; atendendo: number }>
}

const PADRAO_AGENTE: WidgetItem[] = [
  { id: "mensagens", size: "wide", label: "Minhas mensagens de hoje" },
  { id: "atendimentos", size: "sm", label: "Meus atendimentos hoje" },
  { id: "em-atendimento", size: "sm", label: "Em atendimento agora" },
  { id: "sem-resposta", size: "sm", label: "Clientes esperando resposta" },
  { id: "avaliacao", size: "sm", label: "Minha avaliação" },
  { id: "carteira", size: "wide", label: "Minha carteira" },
]

const PADRAO_ADMIN: WidgetItem[] = [
  { id: "mensagens", size: "wide", label: "Mensagens de hoje" },
  { id: "fila", size: "sm", label: "Fila de espera" },
  { id: "em-atendimento", size: "sm", label: "Em atendimento agora" },
  { id: "por-vendedora", size: "wide", label: "Atendimentos por vendedora" },
  { id: "avaliacao", size: "sm", label: "Avaliação do cliente" },
  { id: "sem-resposta", size: "sm", label: "Clientes esperando resposta" },
  { id: "carteira", size: "wide", label: "Carteira por temperatura" },
  { id: "equipe", size: "wide", label: "Equipe agora" },
]

// ─── Peças visuais ───────────────────────────────────────────────────────────

function Cartao({ titulo, canto, children }: Readonly<{ titulo: string; canto?: ReactNode; children: ReactNode }>) {
  return (
    <section className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">{titulo}</h2>
        {canto}
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}

function Numerao({ children, unidade }: Readonly<{ children: ReactNode; unidade?: string }>) {
  return (
    <p className="text-[32px] font-medium leading-none tracking-tight text-zinc-900 tabular-nums">
      {children}
      {unidade && <span className="text-[14px] font-normal tracking-normal text-zinc-400"> {unidade}</span>}
    </p>
  )
}

function Barra({ pct, forte }: Readonly<{ pct: number; forte?: boolean }>) {
  return (
    <span aria-hidden="true" className="block h-1.5 w-full rounded-full bg-zinc-100">
      <span
        className={`block h-full rounded-full ${forte ? "bg-emerald-500" : "bg-zinc-400"}`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </span>
  )
}

function Bolinha({ cor }: Readonly<{ cor: string }>) {
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${cor}`} />
}

// Vazio honesto: melhor dizer "ainda não houve" do que mostrar zero sem contexto.
function Vazio({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="m-auto text-center text-[12px] text-zinc-400">{children}</p>
}

// ─── Os cartões ──────────────────────────────────────────────────────────────

function CartaoMensagens({ d }: Readonly<{ d: Painel }>) {
  const meu = d.escopo === "AGENT"
  const max = Math.max(1, ...d.mensagens.porHora)
  const pctEnviadas = d.mensagens.total > 0 ? (d.mensagens.enviadas / d.mensagens.total) * 100 : 0
  return (
    <Cartao titulo={meu ? "Minhas mensagens hoje" : "Mensagens hoje"}>
      <Numerao>{d.mensagens.total.toLocaleString("pt-BR")}</Numerao>
      <dl className="mt-4 space-y-2.5 text-[12.5px]">
        <div className="flex items-center gap-3">
          <dt className="w-[74px] text-zinc-700">Enviadas</dt>
          <dd className="flex-1"><Barra pct={pctEnviadas} forte /></dd>
          <dd className="w-11 text-right tabular-nums text-zinc-500">{d.mensagens.enviadas}</dd>
        </div>
        <div className="flex items-center gap-3">
          <dt className="w-[74px] text-zinc-700">Recebidas</dt>
          <dd className="flex-1"><Barra pct={100 - pctEnviadas} /></dd>
          <dd className="w-11 text-right tabular-nums text-zinc-500">{d.mensagens.recebidas}</dd>
        </div>
      </dl>
      <div
        role="img"
        aria-label={`Mensagens por hora hoje. ${d.mensagens.total} no total.`}
        className="mt-auto flex h-12 items-end gap-[3px]"
      >
        {d.mensagens.porHora.map((v, h) => (
          <span
            key={h}
            title={`${String(h).padStart(2, "0")}h — ${v}`}
            className={`flex-1 rounded-sm ${v > 0 ? "bg-emerald-200" : "bg-zinc-100"}`}
            style={{ height: `${Math.max(v > 0 ? 8 : 4, (v / max) * 100)}%` }}
          />
        ))}
      </div>
      <div aria-hidden="true" className="mt-1.5 flex justify-between text-[9.5px] tabular-nums text-zinc-300">
        <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
    </Cartao>
  )
}

function CartaoAtendimentos({ d }: Readonly<{ d: Painel }>) {
  const meu = d.escopo === "AGENT"
  return (
    <Cartao titulo={meu ? "Meus atendimentos" : "Atendimentos"} canto={<span className="text-[11.5px] text-zinc-400">hoje</span>}>
      <Numerao>{d.atendimentosHoje}</Numerao>
      <p className="mt-auto text-[12px] text-zinc-500">
        {d.atendimentosHoje === 0
          ? "Nenhum atendimento aberto hoje ainda."
          : meu ? "conversas que você assumiu hoje" : "conversas assumidas hoje"}
      </p>
    </Cartao>
  )
}

function CartaoEmAtendimento({ d }: Readonly<{ d: Painel }>) {
  return (
    <Cartao titulo="Em atendimento">
      <Numerao>{d.emAtendimento}</Numerao>
      <p className="mt-2 flex items-center gap-2 text-[12.5px] text-zinc-500">
        <Bolinha cor={d.emAtendimento > 0 ? "bg-emerald-500" : "bg-zinc-300"} />
        {d.emAtendimento > 0 ? "abertos agora" : "nenhum aberto"}
      </p>
    </Cartao>
  )
}

function CartaoSemResposta({ d }: Readonly<{ d: Painel }>) {
  return (
    <Cartao titulo="Esperando resposta">
      <Numerao>{d.semResposta}</Numerao>
      <p className="mt-auto text-[12px] leading-relaxed text-zinc-500">
        {d.semResposta === 0
          ? "Ninguém esperando. Tudo respondido 👌"
          : "a última mensagem foi do cliente"}
      </p>
    </Cartao>
  )
}

function CartaoAvaliacao({ d }: Readonly<{ d: Painel }>) {
  if (d.csat.respostas === 0) {
    return (
      <Cartao titulo="Avaliação">
        <Vazio>Nenhuma nota nos últimos 7 dias.</Vazio>
      </Cartao>
    )
  }
  return (
    <Cartao titulo="Avaliação">
      <Numerao unidade="/ 5">{(d.csat.media ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</Numerao>
      <p className="mt-auto text-[12px] text-zinc-500">
        {d.csat.respostas} {d.csat.respostas === 1 ? "resposta" : "respostas"} nos últimos 7 dias
      </p>
    </Cartao>
  )
}

function CartaoFila({ d }: Readonly<{ d: Painel }>) {
  return (
    <Cartao titulo="Fila de espera">
      <Numerao>{d.filaGeral}</Numerao>
      <p className="mt-2 flex items-center gap-2 text-[12.5px]">
        <Bolinha cor={d.filaGeral > 0 ? "bg-amber-500" : "bg-emerald-500"} />
        <span className={d.filaGeral > 0 ? "text-amber-700" : "text-zinc-500"}>
          {d.filaGeral > 0 ? "aguardando vendedora" : "ninguém esperando"}
        </span>
      </p>
    </Cartao>
  )
}

function CartaoCarteira({ d }: Readonly<{ d: Painel }>) {
  const meu = d.escopo === "AGENT"
  const c = d.carteira
  if (c.total === 0) {
    return (
      <Cartao titulo={meu ? "Minha carteira" : "Carteira"}>
        <Vazio>Nenhum cliente na carteira ainda.</Vazio>
      </Cartao>
    )
  }
  const marcados = c.quente + c.morno + c.frio
  const pct = (n: number) => (marcados > 0 ? (n / marcados) * 100 : 0)
  return (
    <Cartao titulo={meu ? "Minha carteira" : "Carteira"} canto={<span className="text-[11.5px] text-zinc-400">{c.total} clientes</span>}>
      <dl className="grid grid-cols-3 gap-3">
        {[
          { rotulo: "Quente", n: c.quente, cor: "bg-red-500" },
          { rotulo: "Morno", n: c.morno, cor: "bg-amber-500" },
          { rotulo: "Frio", n: c.frio, cor: "bg-sky-400" },
        ].map((t) => (
          <div key={t.rotulo} className="flex flex-col gap-1">
            <dt className="flex items-center gap-1.5 text-[12px] text-zinc-600">
              <Bolinha cor={t.cor} />
              {t.rotulo}
            </dt>
            <dd className="text-[22px] font-medium leading-none text-zinc-900 tabular-nums">{t.n}</dd>
          </div>
        ))}
      </dl>
      {marcados > 0 && (
        <div
          role="img"
          aria-label={`Carteira marcada: ${c.quente} quente, ${c.morno} morno, ${c.frio} frio.`}
          className="mt-auto flex h-2 gap-1"
        >
          <span className="rounded-full bg-red-500" style={{ width: `${pct(c.quente)}%` }} />
          <span className="rounded-full bg-amber-500" style={{ width: `${pct(c.morno)}%` }} />
          <span className="rounded-full bg-sky-400" style={{ width: `${pct(c.frio)}%` }} />
        </div>
      )}
      {c.semMarcacao > 0 && (
        <p className="mt-2.5 text-[11.5px] text-zinc-400">
          {c.semMarcacao} {c.semMarcacao === 1 ? "cliente ainda sem" : "clientes ainda sem"} termômetro.
        </p>
      )}
    </Cartao>
  )
}

function CartaoPorVendedora({ d }: Readonly<{ d: Painel }>) {
  if (d.porVendedora.length === 0) {
    return (
      <Cartao titulo="Por vendedora">
        <Vazio>Nenhum atendimento aberto hoje ainda.</Vazio>
      </Cartao>
    )
  }
  const max = Math.max(1, ...d.porVendedora.map((v) => v.atendimentos))
  return (
    <Cartao titulo="Atendimentos por vendedora" canto={<span className="text-[11.5px] text-zinc-400">hoje</span>}>
      <table className="w-full table-fixed text-[12.5px]">
        <caption className="sr-only">Atendimentos por vendedora hoje</caption>
        <tbody>
          {d.porVendedora.slice(0, 6).map((v, i) => (
            <tr key={v.id}>
              <th scope="row" className={`w-[104px] truncate py-[5px] pr-3 text-left font-normal ${i === 0 ? "text-zinc-900" : "text-zinc-600"}`}>
                {v.name}
              </th>
              <td className="py-[5px]"><Barra pct={(v.atendimentos / max) * 100} forte={i === 0} /></td>
              <td className="w-10 py-[5px] text-right tabular-nums text-zinc-500">{v.atendimentos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Cartao>
  )
}

function CartaoEquipe({ d }: Readonly<{ d: Painel }>) {
  if (d.equipe.length === 0) {
    return (
      <Cartao titulo="Equipe">
        <Vazio>Nenhuma vendedora cadastrada.</Vazio>
      </Cartao>
    )
  }
  const presentes = d.equipe.filter((a) => a.status !== "OFFLINE").length

  // Quem está trabalhando vem PRIMEIRO, não em ordem alfabética.
  // Antes a lista era alfabética e cortada nos 10 primeiros: com 15 pessoas
  // cadastradas, a Priscila (11ª no alfabeto) estava online, entrava na
  // contagem do cabeçalho e não aparecia na tela. Quem olhava concluía, com
  // razão, que a presença estava errada.
  const PESO = { ATTENDING: 0, ONLINE: 1, OFFLINE: 2 } as const
  const ordenada = [...d.equipe].sort(
    (a, b) => PESO[a.status] - PESO[b.status] || a.name.localeCompare(b.name, "pt-BR"),
  )

  return (
    <Cartao
      titulo="Equipe agora"
      canto={
        <span className="text-[11.5px] text-zinc-400">
          {presentes === 0 ? "ninguém no sistema" : `${presentes} no sistema`}
        </span>
      }
    >
      {/* Ninguém é escondido: com muita gente cadastrada a lista rola. */}
      <ul className="grid min-h-0 flex-1 grid-cols-2 gap-x-5 gap-y-1.5 overflow-y-auto pr-1">
        {ordenada.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-[12.5px]">
            <Bolinha cor={a.status === "ATTENDING" ? "bg-emerald-500" : a.status === "ONLINE" ? "bg-emerald-300" : "bg-zinc-300"} />
            <span className={`min-w-0 flex-1 truncate ${a.status === "OFFLINE" ? "text-zinc-400" : "text-zinc-700"}`}>{a.name}</span>
            {a.atendendo > 0 && <span className="shrink-0 tabular-nums text-zinc-400">{a.atendendo}</span>}
          </li>
        ))}
      </ul>
    </Cartao>
  )
}

const CARTOES: Record<string, (p: { d: Painel }) => ReactNode> = {
  "mensagens": CartaoMensagens,
  "atendimentos": CartaoAtendimentos,
  "em-atendimento": CartaoEmAtendimento,
  "sem-resposta": CartaoSemResposta,
  "avaliacao": CartaoAvaliacao,
  "fila": CartaoFila,
  "carteira": CartaoCarteira,
  "por-vendedora": CartaoPorVendedora,
  "equipe": CartaoEquipe,
}

// ─── Tela ────────────────────────────────────────────────────────────────────

function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return "Bom dia"
  if (h < 18) return "Boa tarde"
  return "Boa noite"
}

// Aplica a ordem salva por cima do padrão: cartão que a pessoa nunca viu
// (recém-criado) entra no fim, cartão que deixou de existir some.
function aplicarOrdem(padrao: WidgetItem[], ordem: string[]): WidgetItem[] {
  if (ordem.length === 0) return padrao
  const porId = new Map(padrao.map((w) => [w.id, w]))
  const saida: WidgetItem[] = []
  for (const id of ordem) {
    const w = porId.get(id)
    if (w) {
      saida.push(w)
      porId.delete(id)
    }
  }
  for (const w of padrao) if (porId.has(w.id)) saida.push(w)
  return saida
}

export default function PainelWidgets({ nome, papel }: Readonly<{ nome: string; papel: "ADMIN" | "AGENT" }>) {
  const [dados, setDados] = useState<Painel | null>(null)
  const [itens, setItens] = useState<WidgetItem[] | null>(null)
  const [organizando, setOrganizando] = useState(false)
  const [erro, setErro] = useState(false)
  const salvouRef = useRef<string>("")

  const padrao = useMemo(() => (papel === "ADMIN" ? PADRAO_ADMIN : PADRAO_AGENTE), [papel])

  // Ordem salva — uma vez só, antes de montar a grade. A grade guarda a ordem
  // internamente depois de montada, então ela não pode nascer com a ordem errada.
  useEffect(() => {
    let vivo = true
    void (async () => {
      let ordem: string[] = []
      try {
        const res = await fetch("/api/dashboard/layout", { cache: "no-store" })
        if (res.ok) ordem = ((await res.json()) as { ordem: string[] }).ordem
      } catch {
        // Sem a ordem salva o painel abre no padrão — melhor que não abrir.
      }
      if (vivo) setItens(aplicarOrdem(padrao, ordem))
    })()
    return () => { vivo = false }
  }, [padrao])

  // Números: agora e de minuto em minuto. Em aba escondida não busca — é a
  // tela que mais gente deixa aberta o dia inteiro.
  useEffect(() => {
    let vivo = true
    const buscar = async () => {
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" })
        if (!vivo) return
        if (!res.ok) { setErro(true); return }
        const novo = (await res.json()) as Painel
        if (!vivo) return
        setDados(novo)
        setErro(false)
      } catch {
        if (vivo) setErro(true)
      }
    }
    void (async () => { await buscar() })()
    const t = setInterval(() => { if (!document.hidden) void buscar() }, 60_000)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  const salvarOrdem = useCallback(async (novos: WidgetItem[]) => {
    const ordem = novos.map((w) => w.id)
    const chave = ordem.join(",")
    if (chave === salvouRef.current) return
    salvouRef.current = chave
    try {
      await fetch("/api/dashboard/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordem }),
      })
    } catch {
      // Não vale interromper quem está organizando: a tela já mostra a ordem
      // nova e o próximo arrasto tenta salvar de novo.
    }
  }, [])

  const renderCartao = useCallback((item: WidgetItem) => {
    if (!dados) return null
    const Componente = CARTOES[item.id]
    return Componente ? <Componente d={dados} /> : null
  }, [dados])

  const pronto = dados !== null && itens !== null

  return (
    <main className="min-h-full bg-zinc-50 font-sans">
      <header className="flex flex-wrap items-end justify-between gap-4 px-4 py-5 md:px-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 md:text-2xl">
            {saudacao()}, {nome.split(" ")[0]}
          </h1>
          <p className="mt-0.5 text-[12.5px] text-zinc-500">
            {papel === "ADMIN"
              ? "Visão da empresa inteira."
              : "Seus números — só você vê esta tela do seu jeito."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOrganizando((v) => !v)}
          className={`min-h-9 rounded-xl px-4 py-2 text-[12.5px] font-semibold transition-colors ${
            organizando
              ? "bg-emerald-500 text-white hover:bg-emerald-600"
              : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          {organizando ? "Concluir" : "Organizar cartões"}
        </button>
      </header>

      <div className="px-4 pb-8 md:px-8">
        {organizando && (
          <p className="mb-3 flex items-center gap-2 text-[12px] text-zinc-600">
            <Bolinha cor="bg-emerald-500" />
            Arraste um cartão para onde ele deve ficar. No celular, segure um instante antes de arrastar.
          </p>
        )}

        {erro && (
          <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-800">
            Não foi possível atualizar os números agora. Tentando de novo em instantes.
          </p>
        )}

        {!pronto ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: padrao.length }, (_, i) => (
              <div key={i} className="h-[200px] animate-pulse rounded-3xl bg-zinc-100" />
            ))}
          </div>
        ) : (
          <DraggableWidgetGrid
            items={itens}
            editable={organizando}
            onChange={(novos) => void salvarOrdem(novos)}
            renderItem={renderCartao}
            maxColumns={4}
            cellSize={230}
            gap={12}
            radius={24}
          />
        )}

        {pronto && (
          <p className="mt-4 text-[11px] text-zinc-400">
            Atualizado às {new Date(dados.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · atualiza sozinho a cada minuto
          </p>
        )}
      </div>
    </main>
  )
}
