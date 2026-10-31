"use client"

import { useEffect, useState } from "react"

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

export const VERSAO_NOVIDADES = "2026-10-31"
const CHAVE = "whatsfrt.novidades.visto"
export const EVENTO_ABRIR_NOVIDADES = "whatsfrt:abrir-novidades"

interface Passo {
  titulo: string
  texto: string
  imagem?: { src: string; alt: string }
  itens?: { icone: string; texto: string }[]
}

const PASSOS: Passo[] = [
  {
    titulo: "⏳ Veja quem está esperando resposta",
    texto:
      "Na lista de Chats, cada cliente que mandou a última mensagem mostra há quanto tempo está esperando: cinza, amarelo depois de 15 min, vermelho depois de 1 hora. " +
      "Os botões no topo filtram: ⏳ Esperando (quem espera há mais tempo aparece primeiro), ⏰ Retornos e 🔥 Quentes. Não some mais com F5.",
    imagem: { src: "/novidades/meu-dia.webp", alt: "Lista de Chats com os filtros Esperando, Retornos e Quentes e o tempo de espera de cada cliente" },
  },
  {
    titulo: "⏰ Lembrete de retorno",
    texto:
      "Prometeu retornar amanhã? Na conversa, toque em ⏰ Retorno, escolha quando (amanhã 9h, em 3 dias, segunda…) e escreva o que fazer. " +
      "No horário, o sistema avisa só você, na tela e no celular. Nada é enviado ao cliente: quem escreve é sempre você.",
    imagem: { src: "/novidades/lembrete.webp", alt: "Janela Lembrar de retornar com atalhos de data e a nota Mandar orçamento" },
  },
  {
    titulo: "⏰ Seus retornos do dia",
    texto:
      "O botão ⏰ Retornos mostra o que vence hoje e o que está atrasado. Toque no nome para abrir a conversa, em ✓ Feito quando resolver, ou adie para amanhã. " +
      "Funciona até para cliente com atendimento já encerrado.",
    imagem: { src: "/novidades/retornos.webp", alt: "Lista de retornos de hoje com botões Feito e Adiar" },
  },
  {
    titulo: "⚡ Respostas rápidas com a barra /",
    texto:
      "No campo de mensagem, digite / e o começo do nome da resposta (ex.: /preço). Use as setas e Enter. " +
      "O texto entra no campo já com o nome do cliente no lugar de {nome}, para você revisar antes de enviar. Mensagem personalizada também ajuda a não cair como spam.",
    imagem: { src: "/novidades/respostas-barra.webp", alt: "Lista de respostas rápidas aberta ao digitar a barra no campo de mensagem" },
  },
  {
    titulo: "🛡️ Proteção do número",
    texto: "Para o WhatsApp não bloquear o nosso número de novo:",
    itens: [
      { icone: "🚫", texto: "Cliente que responder \"SAIR\", \"parar\" ou \"não quero receber\" sai sozinho das transmissões. A conversa normal continua. Aparece \"Sem ofertas\" ao lado do nome." },
      { icone: "🏷️", texto: "Na Ficha do cliente dá para marcar ou desmarcar \"Não recebe ofertas\" à mão (por exemplo, se ele pediu por telefone)." },
      { icone: "📣", texto: "Transmissões: até 50 pessoas por vez e 100 por dia, só para quem conversou nos últimos 30 dias, com intervalo entre os envios." },
      { icone: "✨", texto: "O Copiloto agora também sugere o 🧭 próximo passo da venda, com um botão para criar o lembrete de retorno." },
    ],
  },
]

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
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            Novidades no WhatsFRT{obrigatorio ? ` · leitura obrigatória · ${passo + 1} de ${PASSOS.length}` : ""}
          </p>
          {!obrigatorio && (
            <button type="button" onClick={fechar} aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h2 id="novidades-titulo" className="text-[17px] font-semibold text-zinc-900">{p.titulo}</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-600">{p.texto}</p>
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
