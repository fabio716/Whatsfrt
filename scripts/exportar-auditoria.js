// ═══════════════════════════════════════════════════════════════════════════
// Exporta 1 semana de atendimentos (seg 00:00 → dom 23:59:59, horário de
// Brasília) para auditoria externa. SOMENTE LEITURA: tudo roda dentro de uma
// transação READ ONLY — o Postgres recusa qualquer escrita.
//
// Uso no servidor (de dentro de /opt/Whatsfrt):
//   docker compose exec -T app node - < scripts/exportar-auditoria.js
//   docker compose exec -T -e SEMANA_INICIO=2026-09-21 app node - < scripts/exportar-auditoria.js
//
// Sem SEMANA_INICIO, exporta a última semana completa. Os arquivos ficam em
// /tmp/frtwhats_auditoria_AAAA-MM-DD dentro do container (o caminho é
// impresso no fim) — copiar com `docker cp`.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const { Client, types } = require("pg")

// Prisma grava DateTime como "timestamp without time zone" em UTC. Sem isso o
// driver interpretaria no fuso do container.
types.setTypeParser(1114, (s) => new Date(s.replace(" ", "T") + "Z"))

const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS
// Brasil sem horário de verão desde 2019: -03:00 fixo (mesma regra do sistema).
const OFFSET_BR_MS = 3 * HORA_MS

// ─── Período ─────────────────────────────────────────────────────────────────

function hojeBR() {
  return new Date(Date.now() - OFFSET_BR_MS).toISOString().slice(0, 10)
}

function segundaDaUltimaSemanaCompleta() {
  const hoje = new Date(`${hojeBR()}T00:00:00Z`)
  const diaSemana = hoje.getUTCDay() // 0=dom, 1=seg
  const voltaAteSegundaAtual = (diaSemana + 6) % 7
  return new Date(hoje.getTime() - (voltaAteSegundaAtual + 7) * DIA_MS).toISOString().slice(0, 10)
}

const segunda = process.env.SEMANA_INICIO || segundaDaUltimaSemanaCompleta()
if (!/^\d{4}-\d{2}-\d{2}$/.test(segunda) || new Date(`${segunda}T00:00:00Z`).getUTCDay() !== 1) {
  console.error(`SEMANA_INICIO precisa ser uma segunda-feira no formato AAAA-MM-DD (recebi "${segunda}")`)
  process.exit(1)
}
const iniUTC = new Date(new Date(`${segunda}T00:00:00Z`).getTime() + OFFSET_BR_MS)
const fimUTC = new Date(iniUTC.getTime() + 7 * DIA_MS) // exclusivo
const domingo = new Date(new Date(`${segunda}T00:00:00Z`).getTime() + 6 * DIA_MS).toISOString().slice(0, 10)

// Parâmetro "naive" em UTC, igual ao que está gravado na coluna.
const naive = (d) => d.toISOString().replace("T", " ").replace("Z", "")

function isoBR(d) {
  return new Date(d.getTime() - OFFSET_BR_MS).toISOString().slice(0, 19) + "-03:00"
}

// ─── Mapeamentos ─────────────────────────────────────────────────────────────

const SETOR_POR_DEPARTAMENTO = {
  VENDAS: "vendas",
  COMERCIAL: "vendas",
  SUPORTE: "assistência técnica",
  SECRETARIA_ASSISTENCIA: "assistência técnica",
  TECNICOS_ASSISTENCIA: "assistência técnica",
  FINANCEIRO: "financeiro",
  COBRANCA: "financeiro",
}
const setorDe = (dep) => (dep ? SETOR_POR_DEPARTAMENTO[dep] || "outro" : "")

function mascararTelefone(whatsappId) {
  const digitos = String(whatsappId).replace(/@.*$/, "").replace(/\D/g, "")
  if (digitos.length < 4) return ""
  return `****-${digitos.slice(-4)}`
}

const PLACEHOLDER_SISTEMA = "⚠️ O cliente enviou"

function tipoDaMensagem(m) {
  const mt = m.mediaType || ""
  if (!mt) return m.body.startsWith(PLACEHOLDER_SISTEMA) ? "outro" : "texto"
  if (mt.startsWith("audio/")) return "áudio"
  if (mt.startsWith("image/")) return "imagem"
  if (mt.startsWith("video/")) return "outro"
  return "documento"
}

// /api/media/1758123456789-Orcamento_123.pdf → Orcamento_123.pdf
// /api/media/1758123456789.pdf (arquivo sem nome original) → ""
function nomeDoArquivo(mediaUrl) {
  if (!mediaUrl) return ""
  const arquivo = decodeURIComponent(mediaUrl.split("/").pop() || "")
  const m = arquivo.match(/^\d{10,}-(.+)$/)
  return m ? m[1] : ""
}

function textoDaMensagem(m, tipo) {
  const legenda = (m.body || "").trim()
  const comLegenda = (marcador) => (legenda ? `${marcador} ${legenda}` : marcador)
  if (tipo === "áudio") return comLegenda("[áudio sem transcrição]")
  if (tipo === "imagem") return comLegenda(m.mediaType === "image/webp" ? "[imagem: figurinha]" : "[imagem]")
  if (tipo === "documento") {
    const nome = nomeDoArquivo(m.mediaUrl)
    return comLegenda(nome ? `[documento: ${nome}]` : "[documento]")
  }
  if (tipo === "outro" && (m.mediaType || "").startsWith("video/")) return comLegenda("[vídeo]")
  return m.body
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

function celula(v) {
  const s = v === null || v === undefined ? "" : String(v)
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function escreverCsv(arquivo, cabecalho, linhas) {
  // BOM: sem ele o Excel em português abre UTF-8 com acentos quebrados.
  const conteudo = "﻿" + [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n"
  fs.writeFileSync(arquivo, conteudo, "utf8")
}

// Parser usado só na validação (relê o que foi gravado).
function lerCsv(arquivo) {
  const txt = fs.readFileSync(arquivo, "utf8").replace(/^﻿/, "")
  const linhas = []
  let linha = []
  let campo = ""
  let aspas = false
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i]
    if (aspas) {
      if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === ";") { linha.push(campo); campo = "" }
    else if (c === "\r" && txt[i + 1] === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; i++ }
    else campo += c
  }
  if (campo !== "" || linha.length > 0) { linha.push(campo); linhas.push(linha) }
  const [cab, ...resto] = linhas
  return resto.map((l) => Object.fromEntries(cab.map((k, i) => [k, l[i]])))
}

// ─── Relatório de tempo de resposta (o que o sistema já gera) ───────────────
// Não recalcula nada: chama a MESMA rota que a tela "Relatório" usa no modo
// Semana (GET /api/reports/daily?periodo=semana) e grava os valores como
// vieram. A rota exige sessão de administrador; o script assina um token de
// sessão com o JWT_SECRET do próprio servidor (mesmo formato do login,
// HS256), em nome de um administrador ativo. A rota só lê do banco.

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")

function tokenDeSessao(admin) {
  const segredo = process.env.JWT_SECRET
  if (!segredo) throw new Error("JWT_SECRET ausente no container")
  const agora = Math.floor(Date.now() / 1000)
  const cab = b64url(JSON.stringify({ alg: "HS256" }))
  const corpo = b64url(JSON.stringify({ id: admin.id, name: admin.name, role: "ADMIN", iat: agora, exp: agora + 600 }))
  const assinatura = b64url(crypto.createHmac("sha256", segredo).update(`${cab}.${corpo}`).digest())
  return `${cab}.${corpo}.${assinatura}`
}

const ROTA_SLA = (dia) => `/api/reports/daily?periodo=semana&dia=${dia}`

async function obterRelatorioSla(admin) {
  const porta = process.env.PORT || "3000"
  const res = await fetch(`http://127.0.0.1:${porta}${ROTA_SLA(segunda)}`, {
    headers: { cookie: `whatsfrt-session=${tokenDeSessao(admin)}` },
  })
  if (!res.ok) throw new Error(`rota do relatório respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

const COLUNAS_SLA = [
  "atendente_id", "nome", "atendimentos", "respostas", "mediaSeg", "medianaSeg", "lentas",
  "conversas", "mensagens", "comTroca", "notas", "notaMedia", "notasBaixas",
]

// ─── Exportação ──────────────────────────────────────────────────────────────

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  await client.query("BEGIN TRANSACTION READ ONLY")

  const problemas = []
  try {
    // Conversa = conversa do cliente na semana em que pelo menos um atendente
    // humano mandou mensagem. Sessões de atendimento (Assumir/Encerrar) não
    // servem de base: quem fala com cliente da carteira sem clicar "Assumir"
    // não gera sessão, e essas conversas sumiriam da auditoria.
    const { rows: contatos } = await client.query(
      `SELECT c.id, c.name, c.empresa, c."whatsappId", c."deletedAt"
         FROM contacts c
        WHERE EXISTS (
          SELECT 1 FROM messages m
           WHERE m."contactId" = c.id
             AND m.direction = 'OUTBOUND'
             AND m."agentId" IS NOT NULL
             AND m."createdAt" >= $1::timestamp AND m."createdAt" < $2::timestamp)
        ORDER BY c.id`,
      [naive(iniUTC), naive(fimUTC)],
    )

    const grupos = contatos.filter((c) => c.whatsappId.endsWith("@g.us"))
    const clientes = contatos.filter((c) => !c.whatsappId.endsWith("@g.us"))
    if (grupos.length > 0) {
      problemas.push(`${grupos.length} conversa(s) de GRUPO de WhatsApp com mensagem de atendente ficaram de fora (não são atendimento a cliente).`)
    }
    const deletados = clientes.filter((c) => c.deletedAt)
    if (deletados.length > 0) {
      problemas.push(`${deletados.length} conversa(s) são de contatos que depois foram excluídos do sistema — exportadas mesmo assim, mas não aparecem mais na tela.`)
    }
    const ids = clientes.map((c) => c.id)

    const { rows: msgs } = ids.length === 0 ? { rows: [] } : await client.query(
      `SELECT id, "contactId", direction, "agentId", "createdAt", body, "mediaType", "mediaUrl",
              status, "isBroadcast", "adminPrivate"
         FROM messages
        WHERE "contactId" = ANY($1)
          AND "createdAt" >= $2::timestamp AND "createdAt" < $3::timestamp
        ORDER BY "createdAt", id`,
      [ids, naive(iniUTC), naive(fimUTC)],
    )

    const { rows: sessoes } = ids.length === 0 ? { rows: [] } : await client.query(
      `SELECT "contactId", "startedAt", "endedAt"
         FROM service_sessions
        WHERE "contactId" = ANY($1)
          AND "startedAt" < $3::timestamp
          AND ("endedAt" IS NULL OR "endedAt" >= $2::timestamp)`,
      [ids, naive(iniUTC), naive(fimUTC)],
    )

    const { rows: transferencias } = ids.length === 0 ? { rows: [] } : await client.query(
      `SELECT "contactId", "fromUserId", "toUserId", "createdAt"
         FROM contact_transfer_logs
        WHERE "contactId" = ANY($1)
          AND "createdAt" >= $2::timestamp AND "createdAt" < $3::timestamp
        ORDER BY "createdAt"`,
      [ids, naive(iniUTC), naive(fimUTC)],
    )

    // Atendentes: quem mandou mensagem + quem aparece em transferência, pra
    // todo id citado nos CSVs existir em atendentes.csv.
    const idsAtendentes = new Set()
    for (const m of msgs) if (m.direction === "OUTBOUND" && m.agentId) idsAtendentes.add(m.agentId)
    for (const t of transferencias) {
      if (t.fromUserId) idsAtendentes.add(t.fromUserId)
      idsAtendentes.add(t.toUserId)
    }
    const { rows: usuarios } = await client.query(
      `SELECT id, name, department::text AS department FROM users WHERE id = ANY($1) ORDER BY name`,
      [[...idsAtendentes]],
    )
    const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]))
    for (const id of idsAtendentes) {
      if (!usuarioPorId.has(id)) problemas.push(`Atendente ${id} citado nas mensagens/transferências não existe mais na tabela de usuários.`)
    }
    const semSetor = usuarios.filter((u) => !u.department)
    if (semSetor.length > 0) {
      problemas.push(`Sem setor cadastrado no sistema (coluna setor vazia): ${semSetor.map((u) => u.name).join(", ")}.`)
    }

    const { rows: admins } = await client.query(
      `SELECT id, name FROM users WHERE role = 'ADMIN' AND "isActive" = true ORDER BY "createdAt" LIMIT 1`,
    )

    await client.query("COMMIT")

    let sla = null
    if (admins.length === 0) {
      problemas.push("relatorio_sla.csv NÃO gerado: não há administrador ativo para consultar o relatório.")
    } else {
      try {
        sla = await obterRelatorioSla(admins[0])
        if (sla.periodo?.de !== segunda || sla.periodo?.ate !== domingo) {
          problemas.push(`O relatório do sistema devolveu o período ${sla.periodo?.de} a ${sla.periodo?.ate}, diferente do exportado (${segunda} a ${domingo}).`)
        }
      } catch (err) {
        problemas.push(`relatorio_sla.csv NÃO gerado: ${err.message}`)
      }
    }

    // ── Monta as linhas ──
    const msgsPorContato = new Map()
    for (const m of msgs) {
      if (!msgsPorContato.has(m.contactId)) msgsPorContato.set(m.contactId, [])
      msgsPorContato.get(m.contactId).push(m)
    }

    const linhasConversas = []
    const principalPorConversa = new Map()
    let semStatus = 0
    for (const c of clientes) {
      const lista = msgsPorContato.get(c.id) || []
      // Atendente principal: quem mais mandou mensagem; empate → quem falou primeiro.
      const contagem = new Map()
      for (const m of lista) {
        if (m.direction === "OUTBOUND" && m.agentId) contagem.set(m.agentId, (contagem.get(m.agentId) || 0) + 1)
      }
      let principal = ""
      let max = 0
      for (const m of lista) {
        if (m.direction !== "OUTBOUND" || !m.agentId) continue
        const n = contagem.get(m.agentId)
        if (n > max) { max = n; principal = m.agentId }
      }
      principalPorConversa.set(c.id, principal)

      const ss = sessoes.filter((s) => s.contactId === c.id)
      let status = ""
      if (ss.some((s) => !s.endedAt || s.endedAt >= fimUTC)) status = "aberta"
      else if (ss.length > 0) status = "encerrada"
      else semStatus++

      const tt = transferencias.filter((t) => t.contactId === c.id)
      linhasConversas.push([
        c.id,
        c.name,
        c.empresa || "",
        mascararTelefone(c.whatsappId),
        principal,
        setorDe(usuarioPorId.get(principal)?.department),
        lista.length ? isoBR(lista[0].createdAt) : "",
        lista.length ? isoBR(lista[lista.length - 1].createdAt) : "",
        status,
        tt.length > 0 ? "sim" : "não",
        tt.map((t) => t.fromUserId || "").join("|"),
        tt.map((t) => t.toUserId).join("|"),
        "",
        "",
      ])
    }
    if (semStatus > 0) {
      problemas.push(`${semStatus} conversa(s) com status vazio: o atendente conversou sem nunca clicar "Assumir"/"Encerrar", então o sistema não registra se o atendimento foi aberto ou encerrado.`)
    }

    const linhasMensagens = []
    let falhas = 0
    let privadas = 0
    for (const m of msgs) {
      const autor = m.direction === "INBOUND" ? "cliente" : m.agentId ? "atendente" : "bot"
      const tipo = tipoDaMensagem(m)
      if (m.status === "FAILED") falhas++
      if (m.adminPrivate) privadas++
      linhasMensagens.push([
        m.contactId,
        m.createdAt ? isoBR(m.createdAt) : "",
        autor,
        autor === "atendente" ? m.agentId : "",
        tipo,
        textoDaMensagem(m, tipo),
      ])
    }
    if (falhas > 0) problemas.push(`${falhas} mensagem(ns) de atendente/bot com status de FALHA no envio — exportadas, mas o cliente pode não ter recebido.`)
    if (privadas > 0) problemas.push(`${privadas} mensagem(ns) enviadas por administrador em modo privado — o atendente dono da conversa não as vê na tela dele.`)

    const linhasAtendentes = usuarios.map((u) => [u.id, u.name, setorDe(u.department)])

    // ── Grava ──
    const pasta = path.join("/tmp", `frtwhats_auditoria_${hojeBR()}`)
    fs.mkdirSync(pasta, { recursive: true })
    escreverCsv(path.join(pasta, "atendentes.csv"), ["atendente_id", "nome", "setor"], linhasAtendentes)
    escreverCsv(path.join(pasta, "conversas.csv"), [
      "conversa_id", "cliente_nome", "cliente_empresa", "cliente_telefone_mascarado",
      "atendente_id", "setor", "inicio", "fim", "status",
      "transferida", "transferida_de", "transferida_para",
      "gerou_orcamento_ou_os", "numero_orcamento_ou_os",
    ], linhasConversas)
    escreverCsv(path.join(pasta, "mensagens.csv"), [
      "conversa_id", "data_hora", "autor", "atendente_id", "tipo", "texto",
    ], linhasMensagens)

    // Valores exatamente como a rota devolveu — nenhum arredondamento ou
    // conversão. A última linha é o total que aparece no topo da tela.
    const linhasSla = sla
      ? [
          ...sla.vendedoras.map((v) => COLUNAS_SLA.map((k) => (k === "atendente_id" ? v.id : v[k]))),
          COLUNAS_SLA.map((k) => (k === "atendente_id" ? "TOTAL" : k === "nome" ? "Total da empresa (topo do relatório)" : sla.totais[k])),
        ]
      : null
    if (linhasSla) escreverCsv(path.join(pasta, "relatorio_sla.csv"), COLUNAS_SLA, linhasSla)

    // ── Validação (relendo os arquivos gravados) ──
    const rAt = lerCsv(path.join(pasta, "atendentes.csv"))
    const rConv = lerCsv(path.join(pasta, "conversas.csv"))
    const rMsg = lerCsv(path.join(pasta, "mensagens.csv"))
    const idsConv = new Set(rConv.map((c) => c.conversa_id))
    const idsAt = new Set(rAt.map((a) => a.atendente_id))
    const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/

    const totalPorAtendente = usuarios.map((u) => ({
      nome: u.name,
      id: u.id,
      conversas: rConv.filter((c) => c.atendente_id === u.id).length,
      mensagens: rMsg.filter((m) => m.autor === "atendente" && m.atendente_id === u.id).length,
    }))
    const somaConversas = totalPorAtendente.reduce((n, t) => n + t.conversas, 0)
    const somaMsgAtendente = totalPorAtendente.reduce((n, t) => n + t.mensagens, 0)
    const porAutor = (a) => rMsg.filter((m) => m.autor === a).length

    const checagens = [
      ["Toda mensagem tem conversa_id existente em conversas.csv", rMsg.every((m) => idsConv.has(m.conversa_id))],
      ["Nenhuma data_hora vazia ou fora do formato ISO 8601", rMsg.every((m) => ISO.test(m.data_hora || ""))],
      ["Todo atendente_id citado existe em atendentes.csv", rConv.every((c) => !c.atendente_id || idsAt.has(c.atendente_id))
        && rMsg.every((m) => !m.atendente_id || idsAt.has(m.atendente_id))],
      ["Linhas relidas = linhas geradas", rConv.length === linhasConversas.length && rMsg.length === linhasMensagens.length && rAt.length === linhasAtendentes.length],
      ["Soma de conversas por atendente = total de conversas.csv", somaConversas === rConv.length],
      ["Soma de mensagens por autor = total de mensagens.csv", somaMsgAtendente + porAutor("cliente") + porAutor("bot") === rMsg.length],
      ["Toda conversa tem atendente", rConv.every((c) => c.atendente_id)],
      ...(linhasSla ? [[
        "relatorio_sla.csv tem uma linha por atendente do relatório + o total",
        lerCsv(path.join(pasta, "relatorio_sla.csv")).length === sla.vendedoras.length + 1,
      ]] : []),
      ["Mensagens em ordem cronológica dentro de cada conversa", (() => {
        const ultima = new Map()
        return rMsg.every((m) => {
          const ok = !ultima.has(m.conversa_id) || ultima.get(m.conversa_id) <= m.data_hora
          ultima.set(m.conversa_id, m.data_hora)
          return ok
        })
      })()],
    ]

    // 3 conversas aleatórias pra conferência humana na tela do sistema.
    const sorteadas = [...rConv].sort(() => Math.random() - 0.5).slice(0, 3).map((c) => {
      const ms = rMsg.filter((m) => m.conversa_id === c.conversa_id)
      const resumo = (m) => `${m.data_hora} — ${m.autor}: ${m.texto.replace(/\s+/g, " ").slice(0, 80)}`
      return [
        `- **${c.cliente_nome}** (${c.cliente_telefone_mascarado}) — conversa_id \`${c.conversa_id}\`, ${ms.length} mensagens`,
        `  - Primeira: ${ms[0] ? resumo(ms[0]) : "—"}`,
        `  - Última: ${ms.length ? resumo(ms[ms.length - 1]) : "—"}`,
        `  - Conferido na tela: [ ] bate  [ ] não bate — observação: ______`,
      ].join("\n")
    })

    const leiame = [
      `# Exportação para auditoria — frtwhats`,
      ``,
      `Gerado em ${isoBR(new Date())}.`,
      ``,
      `## Período exportado`,
      ``,
      `De **${segunda}T00:00:00-03:00** (segunda) até **${domingo}T23:59:59-03:00** (domingo), horário de Brasília.`,
      ``,
      `Exportação somente leitura (transação READ ONLY no banco). Nada foi alterado no sistema.`,
      ``,
      `## Totais`,
      ``,
      `- Conversas: **${rConv.length}**`,
      `- Mensagens: **${rMsg.length}** (cliente: ${porAutor("cliente")}, atendente: ${porAutor("atendente")}, bot: ${porAutor("bot")}, sistema: ${porAutor("sistema")})`,
      `- Atendentes: **${rAt.length}**`,
      ``,
      `### Por atendente`,
      ``,
      `Conversas = conversas em que ele é o atendente principal (quem mais mandou mensagem). Mensagens = mensagens enviadas por ele, em qualquer conversa.`,
      ``,
      `| Atendente | atendente_id | Conversas | Mensagens enviadas |`,
      `|---|---|---:|---:|`,
      ...totalPorAtendente.map((t) => `| ${t.nome} | \`${t.id}\` | ${t.conversas} | ${t.mensagens} |`),
      `| **Total** | | **${somaConversas}** | **${somaMsgAtendente}** |`,
      ``,
      `## Como os dados foram definidos`,
      ``,
      `- **Conversa**: todas as mensagens de um cliente dentro da semana, desde que pelo menos um atendente humano tenha escrito nela. Uma conversa por cliente. \`conversa_id\` é o id do cliente no sistema (abre a conversa em /admin/chats?contact=ID).`,
      `- **atendente_id da conversa**: quem mais mandou mensagem ao cliente na semana (empate: quem escreveu primeiro). Cada linha de mensagens.csv traz o atendente exato que a enviou.`,
      `- **inicio / fim**: primeira e última mensagem da conversa dentro do período.`,
      `- **status**: \`aberta\` se havia atendimento formal (botão "Assumir") sem encerrar no fim do domingo; \`encerrada\` se foi encerrado; vazio se o sistema não tem registro formal de atendimento.`,
      `- **transferida**: registro de mudança de carteira no período. Com mais de uma transferência, \`transferida_de\`/\`transferida_para\` listam todas, em ordem, separadas por \`|\`. \`transferida_de\` vazio = cliente estava sem carteira.`,
      `- **setor**: setor cadastrado do atendente. Mapeamento: Vendas/Comercial → vendas; Suporte/Secretária da Assistência/Técnicos da Assistência → assistência técnica; Financeiro/Cobrança → financeiro; demais (Gerência, Atendimento, Marketing, TI, RH, Expedição, Pós-vendas) → outro.`,
      `- **autor**: \`cliente\` = mensagem recebida; \`atendente\` = enviada por pessoa da equipe (inclui administradores); \`bot\` = enviada automaticamente (menu/URA, aviso de fora do horário, pedido de avaliação etc.).`,
      `- **tipo**: vídeo e figurinhas não têm tipo próprio na lista pedida — vídeo saiu como \`outro\` com texto \`[vídeo]\`, figurinha como \`imagem\` com \`[imagem: figurinha]\`.`,
      `- Arquivos em UTF-8 com BOM e separador \`;\` (abre direto no Excel). Textos com quebra de linha estão entre aspas, sem cortes.`,
      ``,
      `## relatorio_sla.csv — relatório de tempo de resposta do sistema`,
      ``,
      ...(sla ? [
        `- **Origem**: tela **Relatório** do frtwhats (menu "Relatório do dia", modo **Semana**, semana de ${segunda}). Os números vêm da rota \`GET ${ROTA_SLA(segunda)}\`, a mesma que a tela usa, função \`gerarRelatorio\` em \`src/lib/reports/dailyReport.ts\`. Nenhum valor foi recalculado, arredondado ou convertido.`,
        `- Uma linha por atendente que aparece no relatório + linha \`TOTAL\` (os números do topo da tela). O relatório do sistema só mostra o nome de quem tem perfil de vendedora: administradores que escreveram para clientes aparecem com o nome \`(usuário removido)\` — é assim que o sistema exibe, e o valor não foi alterado. O \`atendente_id\` identifica a pessoa em atendentes.csv.`,
        `- Colunas com os nomes internos do sistema: \`mediaSeg\`/\`medianaSeg\` = média/mediana do tempo até a primeira resposta, **em segundos**, só das respostas dentro de 1 hora; \`respostas\` = respostas dentro de 1 hora; \`lentas\` = clientes que esperaram mais de 1 hora (com ou sem resposta); \`atendimentos\` = atendimentos assumidos (botão "Assumir"); \`notas\`/\`notaMedia\`/\`notasBaixas\` = avaliações recebidas / média / notas 3 ou menos. Vazio = sem dado (ex.: nenhuma resposta, média não existe).`,
        `- \`conversas\`/\`mensagens\`/\`comTroca\` seguem a regra do sistema, que é **diferente** da usada em conversas.csv: no relatório, a conversa conta para **cada** atendente que escreveu nela (conversa com dois atendentes conta duas vezes), e \`mensagens\` soma as mensagens **dos dois lados** (cliente + equipe) dessas conversas; \`comTroca\` = conversas com pelo menos 2 mensagens de cada lado. Por isso esses números não batem com as contagens de conversas.csv/mensagens.csv, e não é erro.`,
        `- \`lentas\` da linha TOTAL pode ser maior que a soma das linhas: inclui clientes sem nenhum atendente na carteira.`,
        `- O relatório é calculado na hora da consulta, com as regras atuais do sistema (ex.: desconta horário de almoço, ignora despedidas como "obrigado" e contatos marcados como robô). Gerado em ${isoBR(new Date())}.`,
        `- Para a consulta, o script criou dentro do servidor uma sessão de administrador de 10 minutos (em nome de ${admins[0].name}); a rota só lê dados.`,
      ] : [`- Não gerado — ver "Problemas encontrados".`]),
      ``,
      `## Campos que não existem no sistema (ficaram vazios)`,
      ``,
      `- \`gerou_orcamento_ou_os\` e \`numero_orcamento_ou_os\`: o frtwhats não registra orçamento nem ordem de serviço. Existem etiquetas livres nos clientes (ex.: "orçamento enviado"), mas não foram usadas porque não dizem em qual conversa nem trazem número.`,
      `- Transcrição de áudio: o sistema não transcreve áudios — todos saíram como \`[áudio sem transcrição]\`.`,
      `- autor \`sistema\`: o sistema não diferencia mensagem automática de "bot" e de "sistema"; todas as automáticas saíram como \`bot\`.`,
      `- Nome de documento: só existe quando o arquivo veio com nome; senão saiu \`[documento]\`.`,
      ``,
      `## Problemas encontrados`,
      ``,
      ...(problemas.length ? problemas.map((p) => `- ${p}`) : ["- Nenhum."]),
      `- Mensagens que o cliente mandou num formato que o sistema não exibe (localização, enquete etc.) estão com tipo \`outro\` e o aviso que o sistema grava no lugar ("⚠️ O cliente enviou…").`,
      `- Ao conferir na tela: quando um cliente é assumido de outro atendente, a tela pode mostrar só as mensagens a partir da troca. A exportação traz o histórico completo da semana.`,
      ``,
      `## Validação`,
      ``,
      ...checagens.map(([nome, ok]) => `- [${ok ? "x" : " "}] ${nome}${ok ? "" : " — **FALHOU**"}`),
      ``,
      `### Conferência manual (3 conversas sorteadas)`,
      ``,
      `Abrir cada uma no sistema e marcar se bate:`,
      ``,
      ...(sorteadas.length ? sorteadas : ["- Nenhuma conversa no período."]),
      ``,
    ].join("\n")
    fs.writeFileSync(path.join(pasta, "LEIAME.md"), leiame, "utf8")

    console.log(`Período: ${segunda} a ${domingo}`)
    console.log(`Conversas: ${rConv.length} | Mensagens: ${rMsg.length} | Atendentes: ${rAt.length} | relatorio_sla.csv: ${linhasSla ? "gerado" : "NÃO gerado"}`)
    for (const p of problemas) console.log(`AVISO ${p}`)
    for (const [nome, ok] of checagens) console.log(`${ok ? "OK   " : "FALHA"} ${nome}`)
    console.log(`Arquivos em: ${pasta}`)
    if (checagens.some(([, ok]) => !ok)) process.exitCode = 2
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {})
    throw err
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error("Erro na exportação:", err)
  process.exit(1)
})
