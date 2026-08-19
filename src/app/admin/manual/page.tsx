"use client"

import { useState } from "react"

type Section = {
  id: string
  title: string
  icon: React.ReactNode
  steps: Step[]
}

type Step = {
  title: string
  content: React.ReactNode
}

const SECTIONS: Section[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "primeiros-passos",
    title: "Primeiros Passos",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    steps: [
      {
        title: "O que é o WhatsFRT?",
        content: (
          <div className="space-y-2 text-zinc-600">
            <p>O <strong>WhatsFRT</strong> é o sistema de atendimento corporativo via WhatsApp da empresa. Centraliza todas as mensagens em um painel, distribui os clientes entre os agentes e mantém histórico completo.</p>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Funciona 100% no navegador. Não precisa instalar nada no celular do agente.
            </div>
          </div>
        ),
      },
      {
        title: "Tipos de usuário",
        content: (
          <div className="space-y-3 text-zinc-600">
            <div className="rounded-lg border border-zinc-200 p-3">
              <p className="font-semibold text-zinc-900">👤 Agente</p>
              <p className="text-sm mt-1">Atende clientes que estão atribuídos a ele. Vê apenas suas próprias conversas. Pode importar contatos pra sua carteira e mandar transmissões pra seus clientes.</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-3">
              <p className="font-semibold text-zinc-900">🛡️ Administrador</p>
              <p className="text-sm mt-1">Vê todas as conversas, gerencia equipe, configura URA, conecta WhatsApp, acompanha métricas e avaliações.</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3 text-amber-700 text-sm">
              ⚠️ Agente NUNCA vê conversa de outro agente. Isolamento é total.
            </div>
          </div>
        ),
      },
      {
        title: "Telas principais",
        content: (
          <div className="space-y-3 text-zinc-600">
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-zinc-700">Tela</th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-700">Pra que serve</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  <tr><td className="px-3 py-2 font-medium">Dashboard</td><td className="px-3 py-2 text-zinc-500">Visão geral das conversas dos últimos 7 dias</td></tr>
                  <tr><td className="px-3 py-2 font-medium">Chats</td><td className="px-3 py-2 text-zinc-500">Atender clientes EM ATENDIMENTO em tempo real</td></tr>
                  <tr><td className="px-3 py-2 font-medium">Equipe ao vivo</td><td className="px-3 py-2 text-zinc-500">Admin vê quem está atendendo quem, agora</td></tr>
                  <tr><td className="px-3 py-2 font-medium">Avaliações</td><td className="px-3 py-2 text-zinc-500">CSAT por agente, notas baixas, ranking</td></tr>
                  <tr><td className="px-3 py-2 font-medium">Métricas</td><td className="px-3 py-2 text-zinc-500">Volume de mensagens, contatos atendidos</td></tr>
                  <tr><td className="px-3 py-2 font-medium">Equipe</td><td className="px-3 py-2 text-zinc-500">Adicionar/desativar agentes, alterar permissões</td></tr>
                  <tr><td className="px-3 py-2 font-medium">Contatos</td><td className="px-3 py-2 text-zinc-500">Lista completa de contatos do sistema</td></tr>
                  <tr><td className="px-3 py-2 font-medium">URA</td><td className="px-3 py-2 text-zinc-500">Menu automático, horários, cooperativas, territórios</td></tr>
                  <tr><td className="px-3 py-2 font-medium">WhatsApp</td><td className="px-3 py-2 text-zinc-500">Conectar/desconectar número via QR code</td></tr>
                  <tr><td className="px-3 py-2 font-medium">Transmissão</td><td className="px-3 py-2 text-zinc-500">Disparo em massa pra lista de contatos</td></tr>
                  <tr><td className="px-3 py-2 font-medium">Adicionar Contato</td><td className="px-3 py-2 text-zinc-500">Cadastrar contato avulso</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        ),
      },
      {
        title: "O banner vermelho no topo — o que significa",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Em qualquer tela, pode aparecer uma faixa <strong className="text-red-600">vermelha</strong> ou <strong className="text-amber-600">laranja</strong> avisando sobre o status do WhatsApp:</p>
            <div className="space-y-2">
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-semibold text-red-700">🔴 "WhatsApp desconectado"</p>
                <p className="text-sm text-red-600 mt-1">Número WhatsApp caiu. Reescanear o QR code em <strong>WhatsApp → Conectar</strong>.</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-700">🟠 "Conectando..."</p>
                <p className="text-sm text-amber-600 mt-1">Em transição. Espera 30 segundos.</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-semibold text-red-700">🔴 "Aguardando QR code"</p>
                <p className="text-sm text-red-600 mt-1">Vá em <strong>WhatsApp</strong> e escaneie.</p>
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-3 text-green-700 text-sm">
              ✅ Quando estiver tudo OK, <strong>nenhum banner</strong> aparece. O sistema te avisa em &lt;30s se algo cair, então não precisa ficar checando.
            </div>
          </div>
        ),
      },
    ],
  },
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "atendimento",
    title: "Atender Clientes",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
    steps: [
      {
        title: "Como assumir um atendimento",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Quando um cliente envia mensagem e a URA encaminha pra fila, ele fica aguardando agente. Pra assumir:</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Vá em <strong>Chats</strong> no menu lateral</li>
              <li>Clique no contato que precisa de atendimento (geralmente aparece com etiqueta "Aguardando")</li>
              <li>Clique no botão <strong className="bg-zinc-900 text-white px-2 py-0.5 rounded">Assumir Atendimento</strong> no canto superior direito</li>
              <li>Pronto — o campo de mensagem destrava e você pode responder</li>
            </ol>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Enquanto não assumir, o painel mostra <strong>"Modo auditoria"</strong> embaixo — você lê as mensagens, mas não consegue enviar.
            </div>
          </div>
        ),
      },
      {
        title: "Enviar mensagem de texto",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-2 list-decimal list-inside">
              <li>Clique no campo <strong>"Digite uma mensagem..."</strong> no rodapé do chat</li>
              <li>Escreva normalmente</li>
              <li>Aperte <strong>Enter</strong> (ou clique no avião verde 🟢)</li>
            </ol>
            <p>A mensagem aparece <strong>imediatamente</strong> no chat (sem precisar atualizar a página) com o status dela ao lado do horário.</p>
            <div className="rounded-lg bg-amber-50 p-3 text-amber-700 text-sm">
              ⚠️ Se digitar e nada aparecer no chat, provavelmente o banner vermelho está ativo (WhatsApp desconectado). Olhe o topo da tela.
            </div>
          </div>
        ),
      },
      {
        title: "Entender os status (✓, ✓✓, azul) das mensagens enviadas",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Toda mensagem que VOCÊ envia mostra um indicador ao lado do horário (igual WhatsApp):</p>
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-zinc-700">Ícone</th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-700">Significado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  <tr><td className="px-3 py-2 text-center">🕐</td><td className="px-3 py-2">Mensagem sendo processada pelo sistema</td></tr>
                  <tr><td className="px-3 py-2 text-center">✓</td><td className="px-3 py-2">Saiu do sistema — entregue ao WhatsApp</td></tr>
                  <tr><td className="px-3 py-2 text-center">✓✓ cinza</td><td className="px-3 py-2">Entregue no celular do cliente</td></tr>
                  <tr><td className="px-3 py-2 text-center text-sky-500 font-bold">✓✓ azul</td><td className="px-3 py-2">Cliente leu a mensagem</td></tr>
                  <tr><td className="px-3 py-2 text-center">⚠️</td><td className="px-3 py-2">Falhou — clica em cima pra ver erro</td></tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Os ticks mudam automaticamente em tempo real conforme o cliente recebe e lê.
            </div>
            <div className="rounded-lg bg-amber-50 p-3 text-amber-700 text-sm">
              ⚠️ Se o cliente <strong>desligou confirmação de leitura</strong> no WhatsApp dele, fica eternamente em ✓✓ cinza (mesmo que tenha lido). É config dele, não bug nosso.
            </div>
          </div>
        ),
      },
      {
        title: "Usar emojis 😊",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-2 list-decimal list-inside">
              <li>Ao lado do campo de texto, clique no <strong>botão de carinha 😊</strong></li>
              <li>O painel de emojis abre acima do input com 4 categorias:
                <ul className="ml-6 mt-1 space-y-0.5 list-disc list-inside text-sm">
                  <li>😀 Emoções (felicidade, tristeza, raiva)</li>
                  <li>👍 Gestos (polegar, mão, palma)</li>
                  <li>❤️ Coração (todas as cores)</li>
                  <li>✅ Símbolos (check, fogo, festa, dinheiro)</li>
                </ul>
              </li>
              <li>Clique no emoji desejado — ele entra no campo de texto</li>
              <li>Pode clicar em vários seguidos</li>
              <li>Aperta Enter pra enviar quando terminar</li>
            </ol>
          </div>
        ),
      },
      {
        title: "Enviar foto, vídeo, documento ou áudio (📎 clipe)",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Ao lado do campo de texto tem o <strong>botão clipe 📎</strong>:</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Clica no <strong>clipe 📎</strong></li>
              <li>Escolhe o arquivo do seu computador</li>
              <li>(Opcional) Antes de clicar no clipe, escreva um texto no campo — ele vira <strong>legenda</strong> da foto/vídeo</li>
              <li>O upload começa automaticamente — spinner gira durante o envio</li>
              <li>Quando terminar, a mídia aparece no chat</li>
            </ol>
            <p className="font-semibold pt-2">Tipos aceitos e limite máximo:</p>
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-zinc-700">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-700">Limite</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  <tr><td className="px-3 py-2">🖼️ Imagem (JPG, PNG, WebP)</td><td className="px-3 py-2">16 MB</td></tr>
                  <tr><td className="px-3 py-2">🎥 Vídeo (MP4, MOV)</td><td className="px-3 py-2">16 MB</td></tr>
                  <tr><td className="px-3 py-2">🎵 Áudio (MP3, OGG)</td><td className="px-3 py-2">16 MB</td></tr>
                  <tr><td className="px-3 py-2">📄 PDF, Word, Excel, PowerPoint</td><td className="px-3 py-2"><strong>100 MB</strong></td></tr>
                  <tr><td className="px-3 py-2">🗜️ ZIP</td><td className="px-3 py-2">100 MB</td></tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-lg bg-amber-50 p-3 text-amber-700 text-sm">
              ⚠️ Se ultrapassar o limite, aparece mensagem clara avisando o limite do tipo.
            </div>
          </div>
        ),
      },
      {
        title: "Gravar e enviar áudio do navegador 🎤",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Você pode gravar áudio direto do navegador, igual WhatsApp:</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Com o campo de mensagem <strong>vazio</strong>, o botão verde do final mostra um <strong>microfone 🎤</strong></li>
              <li>Clique no microfone — primeira vez o navegador pede permissão pra usar o microfone, clique <strong>Permitir</strong></li>
              <li>O rodapé fica <strong>vermelho pulsante</strong> com um cronômetro: "Gravando... 00:23"</li>
              <li>Fale normalmente</li>
              <li>Quando terminar, clique no <strong>quadrado vermelho ⏹️</strong> pra parar</li>
              <li>Aparece um <strong>player de prévia</strong> — você pode ouvir o áudio antes de enviar (botão play)</li>
              <li>Se gostou, clica no <strong>avião verde</strong> pra enviar</li>
              <li>Se não gostou, clica em <strong>Descartar</strong> e grava de novo</li>
            </ol>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Pra cancelar antes de terminar de gravar: botão <strong>Cancelar</strong> à esquerda durante a gravação.
            </div>
            <div className="rounded-lg bg-amber-50 p-3 text-amber-700 text-sm">
              ⚠️ Se o microfone não funcionar: vá em <strong>Configurações do Chrome → Privacidade e segurança → Configurações do site → Microfone</strong> e libere o acesso pra <code>frtwhats.com</code>.
            </div>
          </div>
        ),
      },
      {
        title: "Encerrar atendimento e pedir nota ao cliente",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Depois de resolver o problema do cliente:</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Com a conversa aberta, clique no botão <strong className="border border-zinc-300 px-2 py-0.5 rounded text-zinc-700">Encerrar e pedir nota</strong> (canto superior direito)</li>
              <li>Confirme — o sistema envia automaticamente pro cliente:
                <div className="my-2 rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-sm text-zinc-600 italic">
                  🙏 Obrigado pelo contato! Antes de finalizar, gostaríamos da sua avaliação.<br/>
                  De 1 a 5, como foi o atendimento?<br/>
                  1 - Muito ruim · 2 - Ruim · 3 - Regular · 4 - Bom · 5 - Excelente
                </div>
              </li>
              <li>A conversa some da sua lista — você está livre pra outro cliente</li>
              <li>Quando o cliente responder <strong>"5"</strong> (ou qualquer número 1-5), o sistema captura a nota e agradece automaticamente</li>
              <li>Se o cliente respondeu <strong>"5 atendimento rápido"</strong>, o "atendimento rápido" vira <strong>comentário</strong> da avaliação</li>
              <li>Tudo aparece em <strong>Avaliações</strong> no menu</li>
            </ol>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Se o cliente nunca responder, o sistema <strong>fecha sozinho em 30 minutos</strong> e manda uma mensagem amigável avisando que o atendimento foi encerrado por inatividade.
            </div>
          </div>
        ),
      },
      {
        title: "Encerramento automático por inatividade",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Se você assumir um atendimento e <strong>esquecer dele</strong> (cliente parou de responder), o sistema fecha sozinho:</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>Atendimento <strong>EM ATENDIMENTO</strong> sem nenhuma troca de mensagem por 30 min → encerra como "auto"</li>
              <li>Cliente em <strong>AGUARDANDO NOTA</strong> sem responder por 30 min → libera o contato e manda mensagem amigável</li>
            </ul>
            <div className="rounded-lg bg-green-50 p-3 text-green-700 text-sm">
              ✅ Isso evita que conversas fiquem "pendurando" se você esquecer de encerrar. Aparece no histórico marcado como "auto".
            </div>
          </div>
        ),
      },
    ],
  },
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "equipe-live",
    title: "Equipe ao Vivo",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    steps: [
      {
        title: "O que é a tela Equipe ao Vivo (admin only)",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>É a tela onde o <strong>administrador</strong> vê tudo que está acontecendo na operação <strong>agora</strong>, em tempo real.</p>
            <p>Mostra 4 blocos:</p>
            <ul className="space-y-2 list-disc list-inside">
              <li><strong>🟢 Em atendimento agora</strong> — quem está conversando com qual cliente, há quanto tempo, e a média de notas dele hoje</li>
              <li><strong>🟠 Fila — aguardando agente</strong> — clientes que estão esperando alguém assumir. Destaque vermelho se passar de 10 min</li>
              <li><strong>⚪ Agentes livres</strong> — quem está disponível e quantos atendimentos já fez hoje</li>
              <li><strong>📜 Histórico — últimas 24h</strong> — todos os atendimentos encerrados nas últimas 24 horas com nota e comentário</li>
            </ul>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Atualiza sozinha a cada 5 segundos. Pode deixar aberta o dia inteiro num monitor extra.
            </div>
          </div>
        ),
      },
      {
        title: "Identificar agente atrasado",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Na seção <strong>Fila</strong>, clientes que estão esperando há <strong>mais de 10 minutos</strong> ficam destacados em <span className="text-red-600 font-medium">vermelho com etiqueta "⚠ Atrasado"</span>.</p>
            <p>Isso permite que o admin veja na hora quem precisa de ação:</p>
            <ul className="space-y-1 list-disc list-inside text-sm">
              <li>Realocar agentes livres</li>
              <li>Cobrar agentes que assumiram mas estão idle</li>
              <li>Identificar gargalos por departamento</li>
            </ul>
          </div>
        ),
      },
      {
        title: "Métricas de performance do agente",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Na linha de cada agente em atendimento, você vê:</p>
            <ul className="space-y-1 list-disc list-inside text-sm">
              <li><strong>Atendimentos 24h</strong> — quantos clientes resolveu hoje</li>
              <li><strong>Nota média hoje</strong> — média das avaliações que recebeu nas últimas 24h</li>
              <li><strong>Atendendo há</strong> — tempo decorrido no atendimento atual</li>
              <li><strong>Esperou</strong> — tempo que o cliente ficou na fila antes de ser assumido</li>
            </ul>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Use isso pra reconhecer top performers e identificar quem precisa de treinamento.
            </div>
          </div>
        ),
      },
    ],
  },
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "avaliacoes",
    title: "Avaliações (CSAT)",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
    steps: [
      {
        title: "Como o sistema coleta avaliações",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Sempre que um agente clicar em <strong>Encerrar e pedir nota</strong>, o sistema:</p>
            <ol className="space-y-1 list-decimal list-inside text-sm">
              <li>Envia uma mensagem automática pedindo nota 1-5</li>
              <li>Cliente responde (ex: "5 muito bom")</li>
              <li>Sistema captura a nota (5) e comentário ("muito bom")</li>
              <li>Tudo é registrado na tela <strong>Avaliações</strong></li>
            </ol>
            <div className="rounded-lg bg-amber-50 p-3 text-amber-700 text-sm">
              ⚠️ Se o cliente não responder em 30 min, o sistema desiste e libera o contato.
            </div>
          </div>
        ),
      },
      {
        title: "Painel de Avaliações — o que ele mostra (admin only)",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Na tela <strong>Avaliações</strong>, você tem 4 áreas:</p>
            <div className="space-y-2">
              <div className="rounded-lg border border-zinc-200 p-3">
                <p className="font-semibold text-zinc-900">📊 Cards no topo</p>
                <p className="text-sm">CSAT médio · Notas recebidas · Taxa de resposta · Total de detratores (1-2)</p>
              </div>
              <div className="rounded-lg border border-zinc-200 p-3">
                <p className="font-semibold text-zinc-900">📈 Distribuição em barras</p>
                <p className="text-sm">Quantas notas 1, 2, 3, 4, 5 foram recebidas no período</p>
              </div>
              <div className="rounded-lg border border-zinc-200 p-3">
                <p className="font-semibold text-zinc-900">🏆 Ranking por agente</p>
                <p className="text-sm">Quem teve melhor CSAT no período, ordenado do maior pro menor</p>
              </div>
              <div className="rounded-lg border border-zinc-200 p-3">
                <p className="font-semibold text-zinc-900">⚠️ Notas baixas (1-2) recentes</p>
                <p className="text-sm">Lista das últimas 20 avaliações ruins com o comentário do cliente — pra você revisar e treinar a equipe</p>
              </div>
            </div>
            <p className="text-sm pt-2">Filtros disponíveis: <strong>7 dias</strong>, <strong>30 dias</strong> ou <strong>90 dias</strong>.</p>
          </div>
        ),
      },
    ],
  },
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "whatsapp",
    title: "Conectar WhatsApp",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    steps: [
      {
        title: "Como conectar (escanear QR code)",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>O sistema usa <strong>Z-API</strong> como provedor profissional (gerencia risco de banimento). Pra conectar:</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>No menu lateral, clique em <strong>WhatsApp</strong></li>
              <li>O sistema mostra o <strong>QR Code</strong></li>
              <li>Pegue o celular do número que vai ser usado pra atendimento</li>
              <li>No WhatsApp do celular: <strong>3 pontos ⋮ → Aparelhos conectados → Conectar um aparelho</strong></li>
              <li>Aponte a câmera pro QR code</li>
              <li>Pronto — em até 30s o banner vermelho some sozinho</li>
            </ol>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Se o QR expirar (~20s), atualize a página e tente de novo.
            </div>
          </div>
        ),
      },
      {
        title: "Verificar se está conectado",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Tem 3 maneiras de checar:</p>
            <ul className="space-y-1 list-disc list-inside text-sm">
              <li><strong>Banner no topo</strong> da tela — se não aparecer banner vermelho, está OK</li>
              <li>Menu <strong>WhatsApp</strong> mostra status atualizado</li>
              <li>O sistema avisa em até 30s se cair (banner vermelho aparece sozinho)</li>
            </ul>
          </div>
        ),
      },
      {
        title: "O que fazer se o WhatsApp cair",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>De vez em quando a sessão expira (faz parte do funcionamento do WhatsApp Web). Quando isso acontecer:</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>O banner vermelho aparece no topo automaticamente</li>
              <li>Vai em <strong>WhatsApp</strong> no menu</li>
              <li>Repete o processo de escanear QR code</li>
              <li>Em 30s o banner some e tudo volta ao normal</li>
            </ol>
            <div className="rounded-lg bg-amber-50 p-3 text-amber-700 text-sm">
              ⚠️ <strong>NUNCA</strong> conecte o número em mais de 1 ferramenta ao mesmo tempo (ex: WhatsApp Web no navegador + WhatsFRT). O WhatsApp desconecta automaticamente uma das sessões.
            </div>
          </div>
        ),
      },
    ],
  },
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "importar",
    title: "Importar Contatos",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
    steps: [
      {
        title: "O que é a importação de contatos?",
        content: (
          <div className="space-y-2 text-zinc-600">
            <p>Importa vários contatos de uma vez a partir de um arquivo CSV (planilha). Útil pra puxar lista do Excel, Google Planilhas ou Google Contatos.</p>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Admin importa pra todo o sistema. Agente importa pra sua própria carteira.
            </div>
          </div>
        ),
      },
      {
        title: "Passo 1 — Preparar o arquivo CSV",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Seu CSV precisa ter pelo menos <strong>duas colunas obrigatórias</strong> e aceita até <strong>duas opcionais</strong>:</p>
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-zinc-700">Coluna</th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-700">Obrigatória?</th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-700">Nomes aceitos no cabeçalho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  <tr><td className="px-3 py-2 font-medium">Nome</td><td className="px-3 py-2 text-green-600">sim</td><td className="px-3 py-2 text-zinc-500">nome, name, contato, cliente</td></tr>
                  <tr><td className="px-3 py-2 font-medium">Telefone</td><td className="px-3 py-2 text-green-600">sim</td><td className="px-3 py-2 text-zinc-500">telefone, phone, celular, whatsapp, tel</td></tr>
                  <tr><td className="px-3 py-2 font-medium">Empresa</td><td className="px-3 py-2 text-zinc-400">opcional</td><td className="px-3 py-2 text-zinc-500">empresa, company, organizacao</td></tr>
                  <tr><td className="px-3 py-2 font-medium">Cidade</td><td className="px-3 py-2 text-zinc-400">opcional</td><td className="px-3 py-2 text-zinc-500">cidade, city, municipio</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm">Exemplo com empresa e cidade (ideal pra buscar depois):</p>
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-3 py-2 text-left">nome</th>
                    <th className="px-3 py-2 text-left">telefone</th>
                    <th className="px-3 py-2 text-left">empresa</th>
                    <th className="px-3 py-2 text-left">cidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  <tr><td className="px-3 py-2">João Silva</td><td className="px-3 py-2">11 99999-8888</td><td className="px-3 py-2">Sicredi Toledo</td><td className="px-3 py-2">Toledo - PR</td></tr>
                  <tr><td className="px-3 py-2">Maria Souza</td><td className="px-3 py-2">47 98765-4321</td><td className="px-3 py-2">Cresol</td><td className="px-3 py-2">Cascavel - PR</td></tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-lg bg-green-50 p-3 text-green-700 text-sm">
              ✅ Aceita números com ou sem DDI 55, com ou sem traços/parênteses. Empresa e Cidade preenchidas ajudam a buscar o cliente depois em <strong>Clientes Cadastrados</strong>.
            </div>
          </div>
        ),
      },
      {
        title: "Passo 2 — Exportar do Google Contatos",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-2 list-decimal list-inside">
              <li>Vá em <a href="https://contacts.google.com" target="_blank" rel="noopener" className="text-blue-600 underline">contacts.google.com</a></li>
              <li>Menu esquerdo → <strong>Exportar</strong></li>
              <li>Escolha "Google CSV"</li>
              <li>Salva o arquivo</li>
            </ol>
          </div>
        ),
      },
      {
        title: "Passo 3 — Fazer upload no sistema",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-2 list-decimal list-inside">
              <li>Menu → <strong>Adicionar Contato</strong></li>
              <li>Na seção <strong>"Importar vários por CSV"</strong>, clica em <strong>Escolher arquivo</strong></li>
              <li>Clica em <strong>🔍 Analisar e Limpar</strong> — mostra prévia + estatísticas</li>
              <li>Confere o número de duplicados / inválidos / prontos</li>
              <li>Clica em <strong>✅ Importar X Contatos</strong></li>
            </ol>
            <div className="rounded-lg bg-green-50 p-3 text-green-700 text-sm">
              ✅ Mostra quantos foram <strong>criados</strong>, <strong>atualizados</strong> (já existiam) e <strong>ignorados</strong> (telefone inválido).
            </div>
          </div>
        ),
      },
      {
        title: "Cadastrar UM contato avulso (sem CSV)",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Pra cadastrar apenas um cliente novo na hora:</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Menu → <strong>Adicionar Contato</strong></li>
              <li>Na seção <strong>"Adicionar contato avulso"</strong>, preenche:
                <ul className="ml-6 mt-1 list-disc list-inside text-sm">
                  <li><strong>Nome</strong> (obrigatório)</li>
                  <li><strong>Telefone</strong> com DDD (obrigatório)</li>
                  <li><strong>Empresa</strong> (opcional, mas ajuda a buscar depois)</li>
                  <li><strong>Cidade</strong> (opcional)</li>
                </ul>
              </li>
              <li>Clica em <strong>Adicionar contato</strong></li>
              <li>Aparece um <strong>card verde de confirmação</strong> com 2 botões:
                <ul className="ml-6 mt-1 list-disc list-inside text-sm">
                  <li><strong>💬 Iniciar conversa</strong> — abre a conversa daquele cliente direto na tela de Chats</li>
                  <li><strong>Cadastrar outro</strong> — limpa o card pra continuar cadastrando</li>
                </ul>
              </li>
            </ol>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Use isso quando um cliente entrar em contato por outro canal (ligação, e-mail) e você quiser começar uma conversa no WhatsApp.
            </div>
            <div className="rounded-lg bg-amber-50 p-3 text-amber-700 text-sm">
              ⚠️ Se o número já estiver cadastrado pra OUTRO agente, o sistema avisa e não rouba o contato — você precisa pedir transferência.
            </div>
          </div>
        ),
      },
    ],
  },
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "clientes",
    title: "Clientes Cadastrados",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    steps: [
      {
        title: "Pra que serve essa tela",
        content: (
          <div className="space-y-2 text-zinc-600">
            <p>É a sua <strong>agenda de clientes</strong> — todos os contatos cadastrados, com busca rápida por nome, empresa, cidade ou telefone.</p>
            <ul className="space-y-1 list-disc list-inside text-sm pt-2">
              <li><strong>Agente</strong>: vê apenas a sua carteira (clientes atribuídos a você)</li>
              <li><strong>Admin</strong>: vê todos os contatos do sistema</li>
            </ul>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Diferente da tela <strong>Chats</strong>, que mostra só conversas <strong>em andamento</strong>. Aqui você acha qualquer cliente cadastrado, mesmo que nunca tenha conversado.
            </div>
          </div>
        ),
      },
      {
        title: "Buscar por nome",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-2 list-decimal list-inside">
              <li>Menu → <strong>Clientes Cadastrados</strong></li>
              <li>Selecione a aba <strong>Nome</strong> (vem selecionada por padrão)</li>
              <li>Digite ao menos <strong>3 letras</strong> do nome no campo de busca</li>
              <li>Lista filtra automaticamente em até 250 ms</li>
            </ol>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Busca <strong>em qualquer parte do nome</strong>, não só no começo. Ex: digitar "Silva" encontra "João Silva", "Silva Júnior" e "Maria da Silva".
            </div>
          </div>
        ),
      },
      {
        title: "Buscar por empresa ou cidade",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-2 list-decimal list-inside">
              <li>Menu → <strong>Clientes Cadastrados</strong></li>
              <li>Clica na aba <strong>Empresa</strong> ou <strong>Cidade</strong></li>
              <li>Digita o termo no campo de busca</li>
              <li>Lista filtra somente os contatos que têm aquele valor cadastrado</li>
            </ol>
            <div className="rounded-lg bg-amber-50 p-3 text-amber-700 text-sm">
              ⚠️ Só funciona se você preencheu esses dados no cadastro. Se não tinha, edite o contato (botão <strong>Editar</strong>) e preencha empresa/cidade.
            </div>
          </div>
        ),
      },
      {
        title: "Buscar por telefone",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-2 list-decimal list-inside">
              <li>Menu → <strong>Clientes Cadastrados</strong></li>
              <li>Clica na aba <strong>Telefone</strong></li>
              <li>Digita os <strong>dígitos do número</strong> (sem traços, parênteses ou DDI)</li>
              <li>Encontra mesmo que vc digite só parte do número (ex: digite "9999" pra achar todos que terminam em 9999)</li>
            </ol>
          </div>
        ),
      },
      {
        title: "Abrir conversa com um cliente",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-2 list-decimal list-inside">
              <li>Encontra o cliente na lista após filtrar</li>
              <li>Clica no botão <strong className="bg-emerald-500 text-white px-2 py-0.5 rounded text-xs">💬 Conversar</strong> ao lado dele</li>
              <li>Você é levado direto pra <strong>Chats</strong> com a conversa daquele cliente aberta</li>
              <li>Se o cliente está em URA / aguardando: aparece o aviso amarelo + botão <strong>"Assumir / Reassumir"</strong>. Clica e começa a digitar.</li>
            </ol>
            <div className="rounded-lg bg-green-50 p-3 text-green-700 text-sm">
              ✅ Funciona mesmo pra clientes que <strong>nunca conversaram com você</strong>. Você inicia a primeira mensagem proativamente.
            </div>
          </div>
        ),
      },
      {
        title: "Atualizar empresa e cidade",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Se um cliente foi importado sem empresa/cidade, ou se mudou:</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Encontra ele na lista</li>
              <li>Clica em <strong>Editar</strong> ao lado dele</li>
              <li>Janelinha abre com 2 campos: <strong>Empresa</strong> e <strong>Cidade</strong></li>
              <li>Preenche e clica em <strong>Salvar</strong></li>
            </ol>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Depois de preencher, as buscas por empresa/cidade já encontram esse contato.
            </div>
          </div>
        ),
      },
      {
        title: "Status do cliente (etiquetas coloridas)",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Cada linha mostra o status atual do contato:</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-lg border border-zinc-100 p-2.5">
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500">LIVRE</span>
                <span className="text-sm">Sem atendimento em andamento — você pode iniciar</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-zinc-100 p-2.5">
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">URA</span>
                <span className="text-sm">Cliente está respondendo o menu automático</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-zinc-100 p-2.5">
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">AGUARDANDO</span>
                <span className="text-sm">Cliente escolheu opção da URA e está na fila esperando agente</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-zinc-100 p-2.5">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">EM ATENDIMENTO</span>
                <span className="text-sm">Está sendo atendido por algum agente neste momento</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-zinc-100 p-2.5">
                <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700">AVALIANDO</span>
                <span className="text-sm">Acabou de receber o pedido de nota e tá pra responder 1-5</span>
              </div>
            </div>
          </div>
        ),
      },
    ],
  },
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "equipe",
    title: "Gerenciar Equipe",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    steps: [
      {
        title: "Adicionar um novo agente",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-2 list-decimal list-inside">
              <li>Menu → <strong>Equipe</strong></li>
              <li>Clica em <strong>+ Novo usuário</strong></li>
              <li>Preenche nome, e-mail, senha, departamento</li>
              <li>Escolhe o perfil:
                <ul className="ml-6 mt-1 text-sm list-disc list-inside">
                  <li><strong>Agente</strong> — atende clientes, vê só seus chats</li>
                  <li><strong>Admin</strong> — acesso total (cuidado com este)</li>
                </ul>
              </li>
              <li>Clica em <strong>Salvar</strong></li>
            </ol>
            <div className="rounded-lg bg-amber-50 p-3 text-amber-700 text-sm">
              ⚠️ Depois de criar, mande pro agente: a URL <code>frtwhats.com</code> + e-mail + senha.
            </div>
          </div>
        ),
      },
      {
        title: "Desativar um agente",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Quando alguém sair da empresa, <strong>desative</strong> em vez de excluir (pra preservar histórico):</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Menu → <strong>Equipe</strong></li>
              <li>Encontre o usuário e clique nele</li>
              <li>Clica em <strong>Desativar</strong></li>
            </ol>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Agente desativado <strong>não consegue mais logar</strong>, mas as conversas e métricas dele ficam preservadas pra relatórios.
            </div>
          </div>
        ),
      },
      {
        title: "Resetar senha de um agente",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-2 list-decimal list-inside">
              <li>Menu → <strong>Equipe</strong> → clica no usuário</li>
              <li>Preenche o campo <strong>Nova senha</strong> com uma senha temporária</li>
              <li>Clica em <strong>Salvar</strong></li>
              <li>Manda a nova senha pro agente (combine que ele troque depois)</li>
            </ol>
          </div>
        ),
      },
    ],
  },
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ura",
    title: "Configurar URA",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
    steps: [
      {
        title: "O que a URA faz",
        content: (
          <div className="space-y-2 text-zinc-600">
            <p>A URA (menu automático) responde clientes <strong>antes de chegar no agente humano</strong>:</p>
            <ol className="space-y-1 list-decimal list-inside text-sm">
              <li>Verifica se está no horário de expediente</li>
              <li>Envia o menu (1 - Vendas, 2 - Financeiro, etc)</li>
              <li>Aguarda escolha do cliente</li>
              <li>Direciona pra fila do departamento correto</li>
            </ol>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Funciona 24/7 mesmo fora do expediente — mas fora do horário envia mensagem diferente avisando.
            </div>
          </div>
        ),
      },
      {
        title: "Configurar horário de expediente",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-2 list-decimal list-inside">
              <li>Menu → <strong>URA</strong></li>
              <li>Aba <strong>Expediente</strong></li>
              <li>Configura horário de abertura/fechamento por dia da semana</li>
              <li>Marca como <strong>fechado</strong> nos dias sem expediente (sábado/domingo)</li>
              <li>Se tem horário de almoço: ativa o checkbox e define</li>
              <li>Clica em <strong>Salvar</strong></li>
            </ol>
          </div>
        ),
      },
      {
        title: "Mensagem fora do expediente",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Quando o cliente manda mensagem fora do horário:</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Menu → <strong>URA</strong> → aba <strong>Mensagens</strong></li>
              <li>Edita o texto de <strong>Fora do expediente</strong></li>
              <li>(Opcional) Configura <strong>Oferta noturna</strong> com cupom de desconto</li>
              <li>Salva</li>
            </ol>
          </div>
        ),
      },
      {
        title: "Editar opções do menu (1, 2, 3...)",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-2 list-decimal list-inside">
              <li>Menu → <strong>URA</strong> → aba <strong>Menu</strong></li>
              <li>Adiciona/edita opções:
                <ul className="ml-6 mt-1 text-sm list-disc list-inside">
                  <li><strong>Dígito</strong>: o número que o cliente vai responder (1, 2, 3...)</li>
                  <li><strong>Label</strong>: o que aparece no menu ("1 - Vendas")</li>
                  <li><strong>Departamento</strong>: pra qual fila vai depois</li>
                </ul>
              </li>
              <li>Salva</li>
            </ol>
          </div>
        ),
      },
    ],
  },
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "transmissao",
    title: "Transmissão (disparo em massa)",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
    steps: [
      {
        title: "O que é uma transmissão",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>É o disparo da mesma mensagem (texto + opcional foto/PDF) pra <strong>vários contatos</strong> de uma vez.</p>
            <div className="rounded-lg bg-amber-50 p-3 text-amber-700 text-sm">
              ⚠️ <strong>Use com responsabilidade.</strong> Disparo em massa aumenta MUITO o risco de banimento do WhatsApp. Recomendamos no máximo 200 disparos/dia. Tenha autorização dos clientes pra mandar.
            </div>
          </div>
        ),
      },
      {
        title: "Criar e enviar transmissão",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-2 list-decimal list-inside">
              <li>Menu → <strong>Transmissão</strong></li>
              <li>Clica em <strong>Nova transmissão</strong></li>
              <li>Define um nome interno (só você vê)</li>
              <li>Escreve a mensagem (use <strong>{"{nome}"}</strong> pra personalizar com o nome do cliente)</li>
              <li>(Opcional) Anexa uma imagem/PDF clicando no botão de upload</li>
              <li>Escolhe quem vai receber:
                <ul className="ml-6 mt-1 text-sm list-disc list-inside">
                  <li><strong>Todos</strong> — todos seus contatos</li>
                  <li><strong>Cooperativa</strong> — só contatos de uma cooperativa específica</li>
                  <li><strong>Agente</strong> (admin only) — contatos atribuídos a outro agente</li>
                  <li><strong>Manual</strong> — você escolhe um a um</li>
                </ul>
              </li>
              <li>Clica em <strong>Iniciar</strong>. O sistema dispara com delays automáticos pra reduzir risco</li>
              <li>Acompanhe o progresso e taxa de entrega no painel</li>
            </ol>
          </div>
        ),
      },
    ],
  },
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "troubleshooting",
    title: "Quando algo der errado",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.34 16a2 2 0 001.73 3z" />
      </svg>
    ),
    steps: [
      {
        title: "Banner vermelho aparece — como agir",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Significa que o WhatsApp caiu. Não tem como mandar/receber mensagens.</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Clica no botão <strong>Abrir Conectar</strong> no banner</li>
              <li>Você vai pra tela do QR code</li>
              <li>Escaneia com o celular do número (mesmo passo de quando conectou da primeira vez)</li>
              <li>Em até 30s o banner some sozinho</li>
            </ol>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Avisa o supervisor. Enquanto banner vermelho está ativo, NENHUM cliente é atendido.
            </div>
          </div>
        ),
      },
      {
        title: "Mensagem ficou com ⚠️ vermelho (FAILED)",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Significa que a mensagem não saiu. Possíveis causas:</p>
            <ul className="space-y-1 list-disc list-inside text-sm">
              <li>WhatsApp estava caído na hora (veja banner)</li>
              <li>Número do cliente não existe no WhatsApp</li>
              <li>Cliente bloqueou o número da empresa</li>
              <li>Cliente é um "@lid" (número interno do WhatsApp Business, não real) — sistema bloqueia</li>
            </ul>
            <ol className="space-y-1 list-decimal list-inside text-sm pt-2">
              <li>Confere se o WhatsApp tá conectado</li>
              <li>Tenta enviar de novo</li>
              <li>Se persistir, confirma com o cliente por outro canal qual o WhatsApp dele</li>
            </ol>
          </div>
        ),
      },
      {
        title: "Não consigo digitar mensagem (campo bloqueado)",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Causas mais comuns:</p>
            <ul className="space-y-2 list-disc list-inside">
              <li><strong>Modo auditoria ativo</strong> — você está vendo a conversa de outro agente. Clica em <strong>Assumir Atendimento</strong></li>
              <li><strong>Contato não está em IN_SERVICE</strong> — só pode mandar mensagem pra contatos que você assumiu</li>
            </ul>
          </div>
        ),
      },
      {
        title: "Mensagem aparece duplicada",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Não deveria acontecer — o sistema tem proteção contra duplicação. Se acontecer:</p>
            <ol className="space-y-1 list-decimal list-inside text-sm">
              <li>Dá F5 (Ctrl+R) no navegador</li>
              <li>Se a duplicata sumir, era só visualização — não enviou 2x</li>
              <li>Se persistir, avisa o suporte técnico</li>
            </ol>
          </div>
        ),
      },
      {
        title: "Cliente disse que não recebeu",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Verifique no chat o status da mensagem:</p>
            <ul className="space-y-1 list-disc list-inside text-sm">
              <li><strong>🕐 ou ✓</strong> — saiu do sistema mas não chegou ainda. Espera 1 min</li>
              <li><strong>✓✓ cinza</strong> — entregue. Provável que o cliente tá com WhatsApp sem internet. Liga ou tenta outro canal</li>
              <li><strong>✓✓ azul</strong> — o cliente leu. Pode estar ignorando</li>
              <li><strong>⚠️</strong> — falhou. Tenta de novo</li>
            </ul>
          </div>
        ),
      },
    ],
  },
]

export default function ManualPage() {
  const [activeSection, setActiveSection] = useState("primeiros-passos")
  const [openStep, setOpenStep] = useState<number | null>(0)

  const currentSection = SECTIONS.find((s) => s.id === activeSection)!

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-60 flex-shrink-0 border-r border-zinc-100 bg-zinc-50 overflow-y-auto">
        <div className="px-3 py-4">
          <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Manual</p>
          <div className="space-y-0.5">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => { setActiveSection(section.id); setOpenStep(0) }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors ${
                  activeSection === section.id
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                }`}
              >
                {section.icon}
                {section.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-8 py-8">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white">
              {currentSection.icon}
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-900">{currentSection.title}</h1>
              <p className="text-sm text-zinc-400">{currentSection.steps.length} tópicos</p>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-2">
            {currentSection.steps.map((step, idx) => (
              <div key={idx} className="rounded-xl border border-zinc-200 overflow-hidden">
                <button
                  onClick={() => setOpenStep(openStep === idx ? null : idx)}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-bold text-zinc-600">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-medium text-zinc-800">{step.title}</span>
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-4 w-4 text-zinc-400 transition-transform ${openStep === idx ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openStep === idx && (
                  <div className="border-t border-zinc-100 px-4 py-4 bg-white">
                    {step.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
