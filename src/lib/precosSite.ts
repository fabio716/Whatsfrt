// ═══════════════════════════════════════════════════════════════════════════
// Preços do site — lê a loja da FRT (frtautomacao.com.br) e guarda uma lista
// de produto / preço / link em ai_knowledge (id "site"). O atendente virtual
// usa essa lista como fonte de preço, então o que ele fala bate com o site.
//
// Só LEITURA no site. Endereço fixo (não vem de usuário). Se o site estiver
// fora do ar, a lista anterior é mantida.
// ═══════════════════════════════════════════════════════════════════════════
import { prisma } from "@/lib/prisma"

const SITE = "https://frtautomacao.com.br"
const SITEMAP = `${SITE}/sitemap-produtos-1.xml`
const MAX_PRODUTOS = 80
const DOZE_HORAS = 12 * 60 * 60 * 1000

async function baixarTexto(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { "user-agent": "frtwhats-precos/1.0" },
    })
    if (!r.ok) return null
    return await r.text()
  } catch {
    return null
  }
}

function reais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

interface ProdutoSite {
  nome: string
  sku: string
  preco: number
  pix: string | null
  parcelas: string | null
  disponivel: boolean
  url: string
}

// Extrai o bloco JSON-LD "Product" e os textos de Pix / parcelamento.
export function lerPaginaProduto(html: string, url: string): ProdutoSite | null {
  const blocos = html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)
  for (const b of blocos) {
    let dado: unknown
    try {
      dado = JSON.parse(b[1])
    } catch {
      continue
    }
    const p = dado as {
      "@type"?: string; name?: string; sku?: string
      offers?: { price?: string | number; availability?: string }
    }
    if (p?.["@type"] !== "Product" || !p.name) continue
    const preco = Number(p.offers?.price)
    if (!Number.isFinite(preco) || preco <= 0) continue

    const texto = html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
    const pix = texto.match(/R\$\s*([\d.]+,\d{2})\s*no Pix/i)
    const parc = texto.match(/(\d{1,2})\s*x\s*de\s*R\$\s*([\d.]+,\d{2})\s*sem juros/i)

    return {
      nome: p.name.trim().slice(0, 200),
      sku: String(p.sku ?? "").trim().slice(0, 40),
      preco,
      pix: pix ? `R$ ${pix[1]}` : null,
      parcelas: parc ? `${parc[1]}x de R$ ${parc[2]} sem juros` : null,
      disponivel: !/OutOfStock/i.test(p.offers?.availability ?? ""),
      url,
    }
  }
  return null
}

export interface ResultadoSync {
  ok: boolean
  produtos: number
  erro?: string
}

export async function sincronizarPrecosSite(): Promise<ResultadoSync> {
  const mapa = await baixarTexto(SITEMAP)
  if (!mapa) return { ok: false, produtos: 0, erro: "Não consegui abrir o site da FRT." }

  const links = [...mapa.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => u.startsWith(`${SITE}/produto/`))
    .slice(0, MAX_PRODUTOS)
  if (links.length === 0) return { ok: false, produtos: 0, erro: "Nenhum produto encontrado no site." }

  const produtos: ProdutoSite[] = []
  for (const url of links) {
    const html = await baixarTexto(url)
    if (html) {
      const p = lerPaginaProduto(html, url)
      if (p) produtos.push(p)
    }
    // Um pedido por vez, com pausa — não sobrecarrega a loja.
    await new Promise((r) => setTimeout(r, 300))
  }
  // Menos da metade lida = site instável; melhor manter a lista anterior.
  if (produtos.length < Math.ceil(links.length / 2)) {
    return { ok: false, produtos: produtos.length, erro: "O site respondeu só em parte — mantive a lista anterior." }
  }

  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
  const linhas = produtos.map((p) => {
    const partes = [
      `- ${p.nome}${p.sku ? ` (código ${p.sku})` : ""}`,
      `preço: ${reais(p.preco)}`,
      p.pix ? `no Pix: ${p.pix}` : null,
      p.parcelas ? `cartão: ${p.parcelas}` : null,
      p.disponivel ? "disponível" : "SEM ESTOQUE no site",
      `link: ${p.url}`,
    ]
    return partes.filter(Boolean).join(" | ")
  })
  const content =
    `PREÇOS DO SITE (lidos em ${quando} — horário de Brasília). ` +
    `Carrinho: ${SITE}/carrinho\n\n${linhas.join("\n")}`

  await prisma.aiKnowledge.upsert({
    where: { id: "site" },
    create: { id: "site", content, updatedBy: "sincronização automática" },
    update: { content, updatedBy: "sincronização automática" },
  })
  return { ok: true, produtos: produtos.length }
}

// Atualiza ao subir o sistema (se a lista tiver mais de 12h) e depois a cada 12h.
export function startPrecosSiteSync(): void {
  const rodar = async () => {
    try {
      const atual = await prisma.aiKnowledge.findUnique({ where: { id: "site" }, select: { updatedAt: true } })
      if (atual && Date.now() - atual.updatedAt.getTime() < DOZE_HORAS) return
      const r = await sincronizarPrecosSite()
      console.log(r.ok ? `[precosSite] ${r.produtos} produtos atualizados` : `[precosSite] falhou: ${r.erro}`)
    } catch (err) {
      console.error("[precosSite] erro:", err instanceof Error ? err.message : err)
    }
  }
  setTimeout(rodar, 90_000)
  setInterval(rodar, 60 * 60 * 1000)
}
