"use client"

// ═══════════════════════════════════════════════════════════════════════════
// Lembretes de retorno — modal "Lembrar de retornar" e painel "Retornos".
// O sistema só AVISA a vendedora no horário; nada é enviado ao cliente
// automaticamente (regra contra bloqueio do número).
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react"

export interface Lembrete {
  id: string
  dueAt: string
  note: string
  contact: { id: string; name: string; empresa: string | null; assignedUserId: string | null }
}

const FUSO = "America/Sao_Paulo"

function diaBr(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: FUSO })
}

function horaBr(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" })
}

// "hoje 09:00", "amanhã 14:30", "ter 03/11 09:00"
export function quandoTexto(iso: string, agora: number): string {
  const d = new Date(iso)
  const hoje = diaBr(new Date(agora))
  const amanha = diaBr(new Date(agora + 86_400_000))
  const ontem = diaBr(new Date(agora - 86_400_000))
  const dia = diaBr(d)
  const hora = horaBr(d)
  if (dia === hoje) return `hoje ${hora}`
  if (dia === amanha) return `amanhã ${hora}`
  if (dia === ontem) return `ontem ${hora}`
  const semana = d.toLocaleDateString("pt-BR", { timeZone: FUSO, weekday: "short" }).replace(".", "")
  const data = d.toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" })
  return `${semana} ${data} ${hora}`
}

// Vence hoje ou já venceu (conta pra "Retornos de hoje").
export function venceAteHoje(iso: string, agora: number): boolean {
  return diaBr(new Date(iso)) <= diaBr(new Date(agora))
}

// Data às HH:MM no horário de Brasília, N dias à frente.
function diaAs(dias: number, hora: number, minuto = 0): Date {
  const alvo = diaBr(new Date(Date.now() + dias * 86_400_000))
  const hh = String(hora).padStart(2, "0")
  const mm = String(minuto).padStart(2, "0")
  return new Date(`${alvo}T${hh}:${mm}:00-03:00`)
}

function proximaSegunda(): Date {
  const semana = new Date().toLocaleDateString("en-US", { timeZone: FUSO, weekday: "short" })
  const ordem = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(semana)
  const faltam = ((8 - ordem) % 7) || 7
  return diaAs(faltam, 9)
}

// Valor pro <input type="datetime-local"> no horário de Brasília.
function paraInput(d: Date): string {
  const dia = diaBr(d)
  const hora = d.toLocaleTimeString("en-GB", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" })
  return `${dia}T${hora}`
}

export function atalhosRetorno(): { rotulo: string; quando: Date }[] {
  const agora = Date.now()
  const lista: { rotulo: string; quando: Date }[] = [
    { rotulo: "Daqui 1 hora", quando: new Date(agora + 60 * 60_000) },
  ]
  const hoje17 = diaAs(0, 17)
  if (hoje17.getTime() - agora > 30 * 60_000) lista.push({ rotulo: "Hoje 17h", quando: hoje17 })
  lista.push(
    { rotulo: "Amanhã 9h", quando: diaAs(1, 9) },
    { rotulo: "Em 3 dias", quando: diaAs(3, 9) },
    { rotulo: "Segunda 9h", quando: proximaSegunda() },
    { rotulo: "Em 15 dias", quando: diaAs(15, 9) },
  )
  return lista
}

export function LembreteModal({
  contactName, notaInicial, diasInicial, doContato, agora, salvando, erro,
  onSalvar, onConcluir, onApagar, onClose,
}: Readonly<{
  contactName: string
  notaInicial?: string
  diasInicial?: number | null
  doContato: Lembrete[]
  agora: number
  salvando: boolean
  erro: string | null
  onSalvar: (quando: Date, nota: string) => void
  onConcluir: (id: string) => void
  onApagar: (id: string) => void
  onClose: () => void
}>) {
  // Sugestão inicial: amanhã 9h, ou o prazo que o Copiloto indicou.
  const [quando, setQuando] = useState<string>(() => paraInput(
    diasInicial === null || diasInicial === undefined
      ? diaAs(1, 9)
      : diasInicial === 0 ? new Date(Date.now() + 60 * 60_000) : diaAs(diasInicial, 9),
  ))
  const [nota, setNota] = useState(notaInicial ?? "")

  const salvar = () => {
    if (!quando) return
    onSalvar(new Date(`${quando}:00-03:00`), nota)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="lembrete-titulo">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h2 id="lembrete-titulo" className="text-[15px] font-semibold text-zinc-900">⏰ Lembrar de retornar</h2>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          Para <strong className="text-zinc-700">{contactName}</strong>. No horário, o sistema avisa só você — nada é enviado ao cliente.
        </p>

        <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Quando</p>
        <div className="flex flex-wrap gap-1.5">
          {atalhosRetorno().map((a) => {
            const valor = paraInput(a.quando)
            const ativo = valor === quando
            return (
              <button
                key={a.rotulo}
                type="button"
                onClick={() => setQuando(valor)}
                className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${ativo ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"}`}
              >
                {a.rotulo}
              </button>
            )
          })}
        </div>
        <input
          type="datetime-local"
          value={quando}
          onChange={(e) => setQuando(e.target.value)}
          aria-label="Data e hora do retorno"
          className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] outline-none focus:border-zinc-300 focus:bg-white"
        />

        <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">O que fazer (opcional)</p>
        <input
          type="text"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          maxLength={300}
          placeholder="Ex.: mandar orçamento da HT 880 com frete"
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] outline-none focus:border-zinc-300 focus:bg-white"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvar() } }}
        />

        {erro && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[12px] font-medium text-red-600">{erro}</p>}

        {doContato.length > 0 && (
          <>
            <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Já marcados para este cliente</p>
            <ul className="space-y-1">
              {doContato.map((l) => (
                <li key={l.id} className="flex items-center gap-2 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-1.5 text-[12px]">
                  <span className={`shrink-0 font-semibold ${new Date(l.dueAt).getTime() <= agora ? "text-red-600" : "text-zinc-700"}`}>{quandoTexto(l.dueAt, agora)}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-500">{l.note || "—"}</span>
                  <button type="button" onClick={() => onConcluir(l.id)} className="shrink-0 rounded-md px-2 py-0.5 font-semibold text-emerald-700 hover:bg-emerald-50">✓ Feito</button>
                  <button type="button" onClick={() => onApagar(l.id)} aria-label="Apagar lembrete" className="shrink-0 rounded-md px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600">✕</button>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-[13px] font-medium text-zinc-600 hover:bg-zinc-100">Fechar</button>
          <button
            type="button"
            onClick={salvar}
            disabled={salvando || !quando}
            className="rounded-xl bg-zinc-900 px-5 py-2 text-[13px] font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {salvando ? "Salvando…" : "Salvar lembrete"}
          </button>
        </div>
      </div>
    </div>
  )
}

// Lista "Retornos": atrasados e de hoje em cima, próximos embaixo.
export function PainelRetornos({
  lembretes, agora, onAbrir, onConcluir, onAdiar,
}: Readonly<{
  lembretes: Lembrete[]
  agora: number
  onAbrir: (contactId: string) => void
  onConcluir: (id: string) => void
  onAdiar: (id: string) => void
}>) {
  const deHoje = lembretes.filter((l) => venceAteHoje(l.dueAt, agora))
  const proximos = lembretes.filter((l) => !venceAteHoje(l.dueAt, agora))

  const item = (l: Lembrete) => {
    const atrasado = new Date(l.dueAt).getTime() <= agora
    return (
      <li key={l.id} className="border-b border-zinc-50 px-4 py-2.5">
        <button type="button" onClick={() => onAbrir(l.contact.id)} className="block w-full text-left">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[13px] font-medium text-zinc-800">{l.contact.name}</span>
            <span className={`shrink-0 text-[10.5px] font-semibold ${atrasado ? "text-red-600" : "text-zinc-400"}`}>
              {atrasado ? "⏰ " : ""}{quandoTexto(l.dueAt, agora)}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-zinc-500">
            {l.note || (l.contact.empresa ?? "Retornar contato")}
          </span>
        </button>
        <span className="mt-1.5 flex gap-1.5">
          <button type="button" onClick={() => onConcluir(l.id)} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">✓ Feito</button>
          <button type="button" onClick={() => onAdiar(l.id)} className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50">Adiar p/ amanhã</button>
        </span>
      </li>
    )
  }

  if (lembretes.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-[13px] font-medium text-zinc-600">Nenhum retorno marcado</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-400">
          Na conversa, toque em ⏰ para ser lembrada de falar com o cliente no dia certo.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="border-b border-zinc-100 bg-zinc-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Hoje e atrasados ({deHoje.length})
      </p>
      {deHoje.length === 0
        ? <p className="px-4 py-3 text-[12px] text-zinc-400">Nada para hoje. 🎉</p>
        : <ul>{deHoje.map(item)}</ul>}
      {proximos.length > 0 && (
        <>
          <p className="border-y border-zinc-100 bg-zinc-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Próximos ({proximos.length})
          </p>
          <ul>{proximos.map(item)}</ul>
        </>
      )}
    </div>
  )
}

export function adiarParaAmanha(): Date {
  return diaAs(1, 9)
}
