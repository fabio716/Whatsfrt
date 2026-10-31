"use client"

import { useEffect, useState } from "react"

// ═══════════════════════════════════════════════════════════════════════════
// Aviso de novidades — aparece UMA vez por pessoa (por navegador) a cada
// versão nova, e pode ser reaberto pelo botão "Novidades" no menu.
//
// Pra anunciar uma leva nova: troque VERSAO_NOVIDADES e o conteúdo de PASSOS.
// Quem já tinha visto a versão anterior vê de novo automaticamente.
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

function jaViu(): boolean {
  try {
    return localStorage.getItem(CHAVE) === VERSAO_NOVIDADES
  } catch {
    // Sem localStorage (modo privado): não insiste em mostrar toda hora.
    return true
  }
}

function marcarVisto(): void {
  try { localStorage.setItem(CHAVE, VERSAO_NOVIDADES) } catch { /* ok */ }
}

export default function Novidades() {
  const [aberto, setAberto] = useState(false)
  const [passo, setPasso] = useState(0)

  const fechar = () => {
    marcarVisto()
    setAberto(false)
  }

  useEffect(() => {
    // Pequena espera pra não aparecer por cima da tela ainda carregando.
    const t = setTimeout(() => { if (!jaViu()) setAberto(true) }, 800)
    const abrir = () => { setPasso(0); setAberto(true) }
    window.addEventListener(EVENTO_ABRIR_NOVIDADES, abrir)
    return () => { clearTimeout(t); window.removeEventListener(EVENTO_ABRIR_NOVIDADES, abrir) }
  }, [])

  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar()
      if (e.key === "ArrowRight") setPasso((p) => Math.min(p + 1, PASSOS.length - 1))
      if (e.key === "ArrowLeft") setPasso((p) => Math.max(p - 1, 0))
    }
    window.addEventListener("keydown", tecla)
    return () => window.removeEventListener("keydown", tecla)
  }, [aberto])

  if (!aberto) return null
  const p = PASSOS[passo]
  const ultimo = passo === PASSOS.length - 1

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="novidades-titulo">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Novidades no WhatsFRT</p>
          <button type="button" onClick={fechar} aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
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
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-5 py-3">
          <div className="flex gap-1.5" aria-label={`Passo ${passo + 1} de ${PASSOS.length}`}>
            {PASSOS.map((x, i) => (
              <button
                key={x.titulo}
                type="button"
                onClick={() => setPasso(i)}
                aria-label={`Ir para o passo ${i + 1}`}
                className={`h-2 rounded-full transition-all ${i === passo ? "w-5 bg-zinc-900" : "w-2 bg-zinc-300 hover:bg-zinc-400"}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {passo > 0 && (
              <button type="button" onClick={() => setPasso(passo - 1)} className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-zinc-600 hover:bg-zinc-100">
                Voltar
              </button>
            )}
            <button
              type="button"
              onClick={() => (ultimo ? fechar() : setPasso(passo + 1))}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-zinc-700"
            >
              {ultimo ? "Entendi" : "Próximo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
