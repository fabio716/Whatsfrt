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
            <p>A importação de contatos permite que você adicione vários clientes de uma vez ao sistema usando um arquivo CSV (planilha). Isso é muito útil para quem já tem uma lista de clientes no Excel, Google Planilhas ou no Google Contatos.</p>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 <strong>Dica:</strong> Um arquivo CSV é uma planilha simples que pode ser exportada do Excel, Google Planilhas ou Google Contatos.
            </div>
          </div>
        ),
      },
      {
        title: "Passo 1 — Preparar o arquivo CSV",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Seu arquivo CSV precisa ter pelo menos <strong>duas colunas</strong>:</p>
            <div className="rounded-lg border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-zinc-700">Nome da coluna</th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-700">Exemplos aceitos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  <tr>
                    <td className="px-3 py-2 font-medium">Nome</td>
                    <td className="px-3 py-2 text-zinc-500">nome, name, contato, cliente, first name</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium">Telefone</td>
                    <td className="px-3 py-2 text-zinc-500">telefone, phone, celular, whatsapp, tel</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm">Exemplo de como deve ficar sua planilha:</p>
            <div className="rounded-lg border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-zinc-700">nome</th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-700">telefone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  <tr><td className="px-3 py-2">João Silva</td><td className="px-3 py-2">11 99999-8888</td></tr>
                  <tr><td className="px-3 py-2">Maria Souza</td><td className="px-3 py-2">47 98765-4321</td></tr>
                  <tr><td className="px-3 py-2">Pedro Lima</td><td className="px-3 py-2">21 91234-5678</td></tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-lg bg-green-50 p-3 text-green-700 text-sm">
              ✅ O sistema aceita números com ou sem código do país (55), com ou sem traços e parênteses.
            </div>
          </div>
        ),
      },
      {
        title: "Passo 2 — Exportar do Google Contatos",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Se os seus contatos estão no celular ou no Google Contatos, siga esses passos:</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Acesse <a href="https://contacts.google.com" target="_blank" className="text-blue-600 underline">contacts.google.com</a> no computador</li>
              <li>No menu esquerdo, clique em <strong>"Exportar"</strong></li>
              <li>Selecione os contatos que deseja exportar (ou todos)</li>
              <li>Escolha o formato <strong>"Google CSV"</strong></li>
              <li>Clique em <strong>"Exportar"</strong> — o arquivo será baixado automaticamente</li>
            </ol>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 O sistema já reconhece automaticamente o formato do Google Contatos!
            </div>
          </div>
        ),
      },
      {
        title: "Passo 3 — Exportar do Excel ou Google Planilhas",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p><strong>No Excel:</strong></p>
            <ol className="space-y-1 list-decimal list-inside text-sm">
              <li>Abra sua planilha</li>
              <li>Clique em <strong>Arquivo → Salvar Como</strong></li>
              <li>Em "Tipo de arquivo", escolha <strong>CSV UTF-8 (delimitado por vírgulas)</strong></li>
              <li>Salve o arquivo</li>
            </ol>
            <p className="pt-2"><strong>No Google Planilhas:</strong></p>
            <ol className="space-y-1 list-decimal list-inside text-sm">
              <li>Abra sua planilha</li>
              <li>Clique em <strong>Arquivo → Fazer download → Valores separados por vírgulas (.csv)</strong></li>
            </ol>
          </div>
        ),
      },
      {
        title: "Passo 4 — Fazer a importação no sistema",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-3 list-decimal list-inside">
              <li>No menu lateral, clique em <strong>"Contatos"</strong></li>
              <li>Clique no botão <strong>"Importar CSV"</strong> (no canto superior direito)</li>
              <li>Uma janela vai abrir — clique em <strong>"Escolher arquivo"</strong> e selecione o arquivo CSV que você preparou</li>
              <li>
                <strong>(Opcional)</strong> Se quiser atribuir esses contatos a um agente específico, selecione o agente no campo que aparece
              </li>
              <li>Clique em <strong>"Importar"</strong> e aguarde</li>
            </ol>
            <div className="rounded-lg bg-green-50 p-3 text-green-700 text-sm">
              ✅ Ao final, o sistema mostrará quantos contatos foram <strong>criados</strong>, <strong>atualizados</strong> e <strong>ignorados</strong> (números inválidos).
            </div>
            <div className="rounded-lg bg-amber-50 p-3 text-amber-700 text-sm">
              ⚠️ Se um contato já existir com o mesmo número, ele será <strong>atualizado</strong>, não duplicado.
            </div>
          </div>
        ),
      },
      {
        title: "Números aceitos — Formatos válidos",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>O sistema aceita números no formato brasileiro. Veja os formatos válidos:</p>
            <div className="rounded-lg border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-zinc-700">Formato</th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-700">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  <tr><td className="px-3 py-2">11 99999-8888</td><td className="px-3 py-2 text-green-600">✅ Aceito</td></tr>
                  <tr><td className="px-3 py-2">(11) 99999-8888</td><td className="px-3 py-2 text-green-600">✅ Aceito</td></tr>
                  <tr><td className="px-3 py-2">11999998888</td><td className="px-3 py-2 text-green-600">✅ Aceito</td></tr>
                  <tr><td className="px-3 py-2">5511999998888</td><td className="px-3 py-2 text-green-600">✅ Aceito (com DDI)</td></tr>
                  <tr><td className="px-3 py-2">99999-8888 (sem DDD)</td><td className="px-3 py-2 text-red-500">❌ Ignorado</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        ),
      },
    ],
  },
  {
    id: "atendimento",
    title: "Realizar um Atendimento",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
    steps: [
      {
        title: "Como iniciar um atendimento",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Quando um cliente envia uma mensagem, ela aparece automaticamente no <strong>Dashboard</strong>. Para atender:</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Clique na conversa do cliente no <strong>Dashboard</strong> ou <strong>Chats</strong></li>
              <li>Clique no botão <strong>"Assumir Atendimento"</strong> (canto superior direito)</li>
              <li>Agora você pode digitar e enviar mensagens normalmente</li>
            </ol>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700 text-sm">
              💡 Enquanto o atendimento não for assumido, o sistema está no modo <strong>auditoria</strong> — você pode ver as mensagens mas não pode responder.
            </div>
          </div>
        ),
      },
      {
        title: "Como encerrar um atendimento",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Após resolver o assunto com o cliente:</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Na conversa aberta, clique no botão <strong>"Encerrar"</strong> ou no ícone de fechar</li>
              <li>O contato voltará para o status <strong>IDLE</strong> (disponível)</li>
              <li>A conversa sairá da lista de chats ativos</li>
            </ol>
          </div>
        ),
      },
      {
        title: "Status dos contatos",
        content: (
          <div className="space-y-3 text-zinc-600">
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-lg border border-zinc-100 p-3">
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">IDLE</span>
                <span className="text-sm">Contato disponível — nenhum atendimento em andamento</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-zinc-100 p-3">
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">IN_URA</span>
                <span className="text-sm">Contato está sendo atendido pela URA (menu automático)</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-zinc-100 p-3">
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">IN_SERVICE</span>
                <span className="text-sm">Contato está em atendimento com um agente humano</span>
              </div>
            </div>
          </div>
        ),
      },
    ],
  },
  {
    id: "equipe",
    title: "Gerenciar Equipe",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    steps: [
      {
        title: "Adicionar um novo agente",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-2 list-decimal list-inside">
              <li>Clique em <strong>"Equipe"</strong> no menu lateral</li>
              <li>Clique em <strong>"+ Novo usuário"</strong></li>
              <li>Preencha o nome, e-mail e senha do agente</li>
              <li>Escolha o perfil: <strong>Agente</strong> (atende clientes) ou <strong>Admin</strong> (acesso total)</li>
              <li>Clique em <strong>"Salvar"</strong></li>
            </ol>
            <div className="rounded-lg bg-amber-50 p-3 text-amber-700 text-sm">
              ⚠️ Agentes só podem ver o Dashboard e Chats. Apenas Admins acessam Equipe, Contatos, Métricas e configurações.
            </div>
          </div>
        ),
      },
      {
        title: "Importar contatos para um agente específico",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Você pode importar contatos e atribuí-los diretamente a um agente:</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Vá em <strong>"Equipe"</strong> e clique no agente desejado</li>
              <li>Role até a seção <strong>"Importar contatos para este agente"</strong></li>
              <li>Selecione o arquivo CSV e clique em <strong>"Importar"</strong></li>
            </ol>
            <div className="rounded-lg bg-green-50 p-3 text-green-700 text-sm">
              ✅ Todos os contatos importados serão automaticamente atribuídos a esse agente.
            </div>
          </div>
        ),
      },
    ],
  },
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
        title: "Como conectar um número de WhatsApp",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-2 list-decimal list-inside">
              <li>Clique em <strong>"WhatsApp"</strong> no menu lateral</li>
              <li>Clique em <strong>"Gerar QR Code"</strong></li>
              <li>Abra o WhatsApp no seu celular</li>
              <li>Toque nos <strong>três pontos</strong> (menu) → <strong>"Aparelhos conectados"</strong></li>
              <li>Toque em <strong>"Conectar um aparelho"</strong></li>
              <li>Aponte a câmera para o QR Code na tela</li>
              <li>Aguarde a conexão ser estabelecida</li>
            </ol>
            <div className="rounded-lg bg-amber-50 p-3 text-amber-700 text-sm">
              ⚠️ O QR Code expira em 20 segundos. Se expirar, clique em <strong>"Tentar novamente"</strong>.
            </div>
          </div>
        ),
      },
      {
        title: "Verificar se o WhatsApp está conectado",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Para verificar o status da conexão, acesse o painel do Evolution Manager:</p>
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 font-mono text-sm">
              http://62.171.178.160:8080/manager
            </div>
            <p className="text-sm">Credenciais de acesso:</p>
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-sm space-y-1">
              <p><strong>API Key:</strong> Evolution123Key</p>
            </div>
            <p className="text-sm">Se aparecer <span className="text-green-600 font-medium">Connected</span> na instância, o WhatsApp está funcionando.</p>
          </div>
        ),
      },
    ],
  },
  {
    id: "ura",
    title: "Configurar URA (Menu Automático)",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
    steps: [
      {
        title: "O que é a URA?",
        content: (
          <div className="space-y-2 text-zinc-600">
            <p>A URA (Unidade de Resposta Audível) é o <strong>menu automático</strong> que responde aos clientes quando eles enviam mensagens. Ela funciona 24 horas por dia e direciona o cliente para o departamento correto.</p>
            <p>Quando um cliente envia uma mensagem, a URA:</p>
            <ol className="space-y-1 list-decimal list-inside text-sm">
              <li>Verifica se está dentro do horário de expediente</li>
              <li>Envia o menu de opções (ex: 1 - Vendas, 2 - Financeiro)</li>
              <li>Aguarda a resposta do cliente</li>
              <li>Direciona para o agente responsável</li>
            </ol>
          </div>
        ),
      },
      {
        title: "Configurar horário de expediente",
        content: (
          <div className="space-y-3 text-zinc-600">
            <ol className="space-y-2 list-decimal list-inside">
              <li>Clique em <strong>"URA"</strong> → <strong>"URA Motor"</strong> no menu</li>
              <li>Clique na aba <strong>"Expediente"</strong></li>
              <li>Configure o horário de abertura e fechamento para cada dia da semana</li>
              <li>Marque os dias como <strong>fechado</strong> para fins de semana ou feriados</li>
              <li>Clique em <strong>"Salvar"</strong></li>
            </ol>
          </div>
        ),
      },
      {
        title: "Configurar mensagem noturna / fora do expediente",
        content: (
          <div className="space-y-3 text-zinc-600">
            <p>Quando alguém envia mensagem fora do horário, a URA responde com uma mensagem configurada por você:</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Vá em <strong>"URA Motor"</strong> → aba <strong>"Fluxo Noturno"</strong></li>
              <li>Configure a mensagem que será enviada fora do expediente</li>
              <li>Opcionalmente, adicione uma <strong>oferta especial</strong> com cupom de desconto</li>
              <li>Clique em <strong>"Salvar"</strong></li>
            </ol>
          </div>
        ),
      },
    ],
  },
]

export default function ManualPage() {
  const [activeSection, setActiveSection] = useState("importar")
  const [openStep, setOpenStep] = useState<number | null>(0)

  const currentSection = SECTIONS.find((s) => s.id === activeSection)!

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-zinc-100 bg-zinc-50 overflow-y-auto">
        <div className="px-3 py-4">
          <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Tópicos</p>
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
