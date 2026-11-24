"use client"

import { useEffect, useState } from "react"
import Mascote from "@/components/ui/Mascote"

// ═══════════════════════════════════════════════════════════════════════════
// Aviso de novidades — aparece UMA vez por pessoa (por navegador) a cada
// versão nova, e pode ser reaberto pelo botão "Novidades" no menu.
//
// Pra anunciar uma leva nova: troque VERSAO_NOVIDADES e o conteúdo de PASSOS.
// Quem já tinha visto a versão anterior vê de novo automaticamente.
//
// LEITURA OBRIGATÓRIA (pedido da FRT, 31/10/2026): quando abre sozinho (versão
// nova), não dá pra fechar nem pular — sem X, sem Esc, sem clicar fora. Cada
// tela libera o "Próximo" só depois de alguns segundos, e no fim a pessoa
// marca "Li e entendi" pra liberar o sistema. Aberto pelo menu (releitura),
// fecha normalmente.
// As imagens ficam em public/novidades/ (capturas reais das telas, com dados
// de exemplo — nunca use print com cliente de verdade).
// ═══════════════════════════════════════════════════════════════════════════

export const VERSAO_NOVIDADES = "2026-11-24"
const CHAVE = "whatsfrt.novidades.visto"
export const EVENTO_ABRIR_NOVIDADES = "whatsfrt:abrir-novidades"

interface Passo {
  titulo: string
  texto: string
  imagem?: { src: string; alt: string }
  itens?: { icone: string; texto: string }[]
  // Desenho de exemplo (dados fictícios) de como a janela aparece na tela.
  exemplo?: "tarefa"
}

const PASSOS: Passo[] = [
  {
    titulo: "📝 Novo menu: Tarefas",
    texto:
      "Agora o administrador pode passar tarefas para você pelo próprio WhatsFRT, sempre com um prazo para resolver. " +
      "Quando uma tarefa for enviada, ela aparece NA HORA no meio da sua tela, como no exemplo abaixo, e você também recebe uma notificação e uma mensagem no chat interno. " +
      "Todas as suas tarefas ficam no menu “📝 Tarefas”.",
    exemplo: "tarefa",
  },
  {
    titulo: "⏰ Quando a janela da tarefa aparecer",
    texto: "Leia o prazo em destaque e escolha uma das opções:",
    itens: [
      { icone: "✅", texto: "“Aceito o prazo”: você confirma que viu a tarefa e que consegue fazer até aquele horário." },
      { icone: "🗓️", texto: "“Não consigo nesse prazo”: você propõe outro prazo, em horas ou até dias depois (há atalhos de +2 h, +4 h, +1 dia e +2 dias) e escreve o motivo. O administrador aprova ou mantém o prazo original e você é avisado da decisão." },
      { icone: "⏸️", texto: "Enquanto o seu pedido de novo prazo espera a decisão, você não é cobrado por essa tarefa." },
      { icone: "🕒", texto: "“Responder depois”: a janela some por 10 minutos e volta a perguntar. Ela não trava o seu atendimento." },
    ],
  },
  {
    titulo: "✍️ Terminou? Conclua com feedback",
    texto: "Ao terminar, abra o menu “📝 Tarefas”, toque em “Concluir” e escreva o feedback: o que foi feito e qual foi o resultado. Sem o feedback, a tarefa não fecha — assim o administrador sabe que foi resolvida, sem precisar perguntar.",
    itens: [
      { icone: "⏰", texto: "Se o prazo passar sem o feedback, o Gerente virtual manda um lembrete e, depois de mais 5 minutos, informa o administrador. Ele não envia nada a clientes." },
      { icone: "🚪", texto: "Quem está com o botão “Ausente” ligado não é cobrado." },
      { icone: "🗂️", texto: "Os feedbacks das tarefas concluídas são apagados automaticamente depois de 90 dias." },
    ],
  },
]

// Exemplo (dados fictícios) da janela que aparece quando chega uma tarefa.
function ExemploTarefa() {
  return (
    <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-100 p-3" aria-label="Exemplo da janela de tarefa">
      <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Exemplo de como aparece na sua tela</p>
      <div className="mx-auto max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">📝 Nova tarefa de Fábio</p>
        <p className="mt-1 text-[15px] font-bold text-zinc-800">Enviar proposta para o cliente Exemplo Ltda</p>
        <div className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-2.5">
          <p className="text-[11px] font-semibold text-amber-800">⏰ PRAZO PARA RESOLVER</p>
          <p className="text-[16px] font-bold text-amber-900">sex., 27/11, 15:30</p>
          <p className="text-[12px] text-amber-800">daqui a 2 h 10 min</p>
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="rounded-lg bg-emerald-600 py-2 text-center text-[13px] font-semibold text-white">✅ Aceito o prazo</div>
          <div className="rounded-lg border border-zinc-300 py-2 text-center text-[12px] font-medium text-zinc-700">Não consigo nesse prazo — propor outro</div>
        </div>
      </div>
    </div>
  )
}

// Segundos mínimos em cada tela antes de liberar o "Próximo" (leitura
// obrigatória). Texto maior pede mais tempo.
function segundosDoPasso(p: Passo): number {
  const palavras = `${p.texto} ${(p.itens ?? []).map((i) => i.texto).join(" ")}`.split(/\s+/).length
  return Math.min(15, Math.max(6, Math.round(palavras / 6)))
}

// Sem localStorage (modo privado): guarda na memória da aba, pra não pedir
// de novo a cada troca de tela — mas pede de novo se abrir outra aba.
let vistoNaMemoria = false

function jaViu(): boolean {
  if (vistoNaMemoria) return true
  try {
    return localStorage.getItem(CHAVE) === VERSAO_NOVIDADES
  } catch {
    return false
  }
}

function marcarVisto(): void {
  vistoNaMemoria = true
  try { localStorage.setItem(CHAVE, VERSAO_NOVIDADES) } catch { /* ok */ }
}

export default function Novidades() {
  const [aberto, setAberto] = useState(false)
  const [passo, setPasso] = useState(0)
  // true = abriu sozinho por ser versão nova: leitura obrigatória.
  const [obrigatorio, setObrigatorio] = useState(false)
  // Passo mais adiantado já aberto (não dá pra pular além dele).
  const [alcancado, setAlcancado] = useState(0)
  // Quando o passo mais adiantado libera o "Próximo" (timestamp).
  const [liberaEm, setLiberaEm] = useState(0)
  const [agora, setAgora] = useState(0)
  const [confirmou, setConfirmou] = useState(false)

  // Segundos que faltam no passo atual (só o passo novo tem espera).
  const espera = obrigatorio && passo === alcancado ? Math.max(0, Math.ceil((liberaEm - agora) / 1000)) : 0

  const irPara = (i: number) => {
    if (i < 0 || i >= PASSOS.length) return
    if (obrigatorio && i > alcancado) {
      // Só avança um passo por vez, e só depois do tempo de leitura.
      if (i !== alcancado + 1 || espera > 0) return
      const t = Date.now()
      setAlcancado(i)
      setLiberaEm(t + segundosDoPasso(PASSOS[i]) * 1000)
      setAgora(t)
    }
    setPasso(i)
  }

  const fechar = () => {
    if (obrigatorio && (passo < PASSOS.length - 1 || espera > 0 || !confirmou)) return
    marcarVisto()
    setAberto(false)
    setObrigatorio(false)
  }

  // Relógio da contagem (só na leitura obrigatória).
  useEffect(() => {
    if (!aberto || !obrigatorio) return
    const t = setInterval(() => setAgora(Date.now()), 500)
    return () => clearInterval(t)
  }, [aberto, obrigatorio])

  useEffect(() => {
    // Pequena espera pra não aparecer por cima da tela ainda carregando.
    const t = setTimeout(() => {
      if (!jaViu()) {
        const inicio = Date.now()
        setPasso(0); setAlcancado(0); setConfirmou(false)
        setLiberaEm(inicio + segundosDoPasso(PASSOS[0]) * 1000)
        setAgora(inicio)
        setObrigatorio(true)
        setAberto(true)
      }
    }, 800)
    const abrir = () => { setPasso(0); setAberto(true) }
    window.addEventListener(EVENTO_ABRIR_NOVIDADES, abrir)
    return () => { clearTimeout(t); window.removeEventListener(EVENTO_ABRIR_NOVIDADES, abrir) }
  }, [])

  // Setas do teclado: mesmas regras dos botões (não pula a leitura).
  // Sem lista de dependências: re-registra a cada render com o passo atual.
  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !obrigatorio) { marcarVisto(); setAberto(false) }
      if (e.key === "ArrowRight") irPara(passo + 1)
      if (e.key === "ArrowLeft") irPara(passo - 1)
    }
    window.addEventListener("keydown", tecla)
    return () => window.removeEventListener("keydown", tecla)
  })

  if (!aberto) return null
  const p = PASSOS[passo]
  const ultimo = passo === PASSOS.length - 1
  const aguardando = espera > 0
  const podeAvancar = !aguardando && (!ultimo || !obrigatorio || confirmou)

  return (
    <div className={`fixed inset-0 z-[100] flex items-end justify-center p-0 backdrop-blur-sm sm:items-center sm:p-4 ${obrigatorio ? "bg-black/70" : "bg-black/40"}`} role="dialog" aria-modal="true" aria-labelledby="novidades-titulo">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
          <span className="flex items-center gap-2">
            <Mascote className="h-8 w-8 rounded-lg" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            Novidades no WhatsFRT{obrigatorio ? ` · leitura obrigatória · ${passo + 1} de ${PASSOS.length}` : ""}
          </p>
          </span>
          {!obrigatorio && (
            <button type="button" onClick={fechar} aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h2 id="novidades-titulo" className="text-[17px] font-semibold text-zinc-900">{p.titulo}</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-600">{p.texto}</p>
          {p.exemplo === "tarefa" && <ExemploTarefa />}
          {p.imagem && (
            <div className="mt-4 max-h-[46vh] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagem estática pequena, sem ganho com next/image */}
              <img src={p.imagem.src} alt={p.imagem.alt} className="w-full object-cover object-top" />
            </div>
          )}
          {p.itens && (
            <ul className="mt-4 space-y-3">
              {p.itens.map((it) => (
                <li key={it.texto} className="flex gap-3 rounded-xl bg-zinc-50 px-3.5 py-3">
                  <span className="text-[18px] leading-none">{it.icone}</span>
                  <span className="text-[13px] leading-relaxed text-zinc-700">{it.texto}</span>
                </li>
              ))}
            </ul>
          )}
          {obrigatorio && ultimo && (
            <label className={`mt-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 ${aguardando ? "cursor-not-allowed border-zinc-200 bg-zinc-50 opacity-60" : "cursor-pointer border-emerald-200 bg-emerald-50"}`}>
              <input
                type="checkbox"
                checked={confirmou}
                disabled={aguardando}
                onChange={(e) => setConfirmou(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
              />
              <span className="text-[13px] font-medium leading-relaxed text-zinc-800">
                Li e entendi todas as mudanças.
              </span>
            </label>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-5 py-3">
          <div className="flex gap-1.5" aria-label={`Passo ${passo + 1} de ${PASSOS.length}`}>
            {PASSOS.map((x, i) => {
              const bloqueado = obrigatorio && i > alcancado
              return (
                <button
                  key={x.titulo}
                  type="button"
                  onClick={() => irPara(i)}
                  disabled={bloqueado}
                  aria-label={`Ir para o passo ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${i === passo ? "w-5 bg-zinc-900" : bloqueado ? "w-2 cursor-not-allowed bg-zinc-200" : "w-2 bg-zinc-300 hover:bg-zinc-400"}`}
                />
              )
            })}
          </div>
          <div className="flex gap-2">
            {passo > 0 && (
              <button type="button" onClick={() => irPara(passo - 1)} className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-zinc-600 hover:bg-zinc-100">
                Voltar
              </button>
            )}
            <button
              type="button"
              onClick={() => { if (!podeAvancar) return; if (ultimo) fechar(); else irPara(passo + 1) }}
              disabled={!podeAvancar}
              className="min-w-[7.5rem] rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {aguardando
                ? `Leia… ${espera}s`
                : ultimo
                  ? (obrigatorio ? "Começar a usar" : "Entendi")
                  : "Próximo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
