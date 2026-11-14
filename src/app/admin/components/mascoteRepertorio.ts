// Repertório do mascote: várias falas por situação, sorteadas SEM repetir —
// só volta a usar uma fala depois de passar por todas as outras. O histórico
// fica neste navegador (nada é gravado no servidor).

const PREFIXO = "mascote_rep_"

export function sortear<T>(chave: string, lista: readonly T[]): { item: T; indice: number } {
  if (lista.length === 1) return { item: lista[0], indice: 0 }
  let usados: number[] = []
  try {
    const bruto = JSON.parse(localStorage.getItem(PREFIXO + chave) ?? "[]")
    if (Array.isArray(bruto)) usados = bruto.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < lista.length)
  } catch { /* sem armazenamento: sorteia sem memória */ }

  let livres = lista.map((_, i) => i).filter((i) => !usados.includes(i))
  if (livres.length === 0) {
    // Passou por todas: recomeça, só evitando repetir a última.
    const ultima = usados[usados.length - 1]
    usados = []
    livres = lista.map((_, i) => i).filter((i) => i !== ultima)
  }
  const indice = livres[Math.floor(Math.random() * livres.length)]
  try { localStorage.setItem(PREFIXO + chave, JSON.stringify([...usados, indice])) } catch { /* ignora */ }
  return { item: lista[indice], indice }
}

export const preencher = (modelo: string, dados: Record<string, string>): string =>
  modelo.replace(/\{(\w+)\}/g, (_, k: string) => dados[k] ?? "")

// ── Cenas sem pergunta ──────────────────────────────────────────────────────
export const BOLINHA_CONVITE = [
  "Bora brincar? Pega a bolinha! ⚽",
  "Pausa rápida! Consegue pegar a bolinha? 🏀",
  "Joga comigo? Clica na bolinha! 🎯",
  "Olha o que eu achei: uma bolinha! Pega ela! ⚽",
  "Duvido você pegar essa bolinha! 😏",
  "Cinco segundinhos de diversão: pega a bolinha! ⏱️",
  "Opa, a bolinha escapou! Ajuda aí! 🏐",
  "Tava treinando meu chute... pega aí! ⚽",
]
export const BOLINHA_PEGOU = [
  "Você pegou! 🎯 Já são {total} {bolinhas}!",
  "Boa mira! 👏 São {total} {bolinhas} até agora!",
  "Isso! 🙌 Placar: {total} {bolinhas}!",
  "Que reflexo! ⚡ Já são {total} {bolinhas}!",
  "Mandou bem! 🥳 {total} {bolinhas} no total!",
  "Pegou de novo! 😮 Contando {total} {bolinhas}!",
]
export const BOLINHA_PERDEU = [
  "Peguei! 😄 Foi divertido!",
  "Essa escapou! Sem problema, eu pego. 😄",
  "Fica pra próxima! Valeu por brincar! 👋",
  "Ela foi rápida demais! 😅 Divertido, né?",
  "Tudo bem, a bolinha ganhou essa. 🏆😂",
]
export const SHOW_ABERTURA = [
  "Olha só isso! 🤸",
  "Atenção, plateia! 🎪",
  "Hora do showzinho! ✨",
  "Posso mostrar uma coisa? Olha! 😎",
  "Segura esse talento! 🤩",
  "Preparado? Lá vai! 🚀",
]
export const SHOW_FINAL = [
  "🎵 Tchan-tchan! 🎶",
  "Ta-dá! 🎉",
  "E o público vai à loucura! 👏",
  "Foi ou não foi lindo? 😄",
  "Mais um espetáculo! 🌟",
  "🎶 Ê, ê, ê! 🎶",
]
export const ESPIAR_FALAS = [
  "Psiu... tá trabalhando? 👀",
  "Só passando pra ver se está tudo bem! 🙂",
  "Tem cliente esperando? Dá uma olhadinha! 👀",
  "Shhh... estou de olho (com carinho)! 💙",
  "Aposto que você está arrasando hoje! 😉",
  "Procurando minha bolinha... viu por aí? ⚽",
  "Ei! Lembra de dar uma esticada nas costas! 🧘",
  "Só conferindo se o café está em dia! ☕",
]

// ── Resposta aos botões da cobrança ─────────────────────────────────────────
export const RESP_AGORA = [
  "Isso! Corre lá! 🏃",
  "Esse é o meu herói! 🦸",
  "Valeu! Você me salvou! 🙏",
  "Vai lá, eu fico torcendo! 📣",
  "Já estou até mais calmo! 😮‍💨",
]
export const RESP_TELEFONE = [
  "Anotado! Dica: manda um 'oi' no chat pro chefe ver que você falou com o cliente 😉",
  "Boa, ligar também vale! Deixa uma observação no chat pra ficar registrado. 📝",
  "Beleza! Só registra no chat, assim ninguém me cobra depois. 😅",
  "Que bom! Conta no chat o que combinaram, fica tudo certinho. ✅",
]
export const RESP_DEPOIS = [
  "Tá bom... mas não demora, hein? 😬",
  "Combinado, volto em 15! ⏰",
  "Ok! Mas já estou roendo as unhas... 😰",
  "Aceito! Só não esquece, tá? 🥺",
  "Fechado, aguardo ansioso! 😅",
]
export const RESP_IGNOROU = [
  "Vou ficar de olho! 👀",
  "Sem pressa... (tem pressa) 😅",
  "Tô aqui quando precisar! 🤖",
  "Volto já já, hein! 👋",
]

// ── Comemoração ─────────────────────────────────────────────────────────────
export const FESTA_UM = [
  "Boaaa! Atendeu o retorno e me salvou da bronca! Você é demais! 🎉",
  "Retorno feito! Cliente feliz, mascote aliviado! 🥳",
  "Uhuuu! Você é rápido(a)! 🚀",
  "Mais um atendido! Nem acredito que escapei da bronca! 😅🎉",
  "Isso é que é profissional! Parabéns! 👏",
  "Cliente atendido, coração tranquilo! 💚",
]
export const FESTA_VARIOS = [
  "Boaaa! Você atendeu {qtd} retornos e me salvou de {qtd} broncas! 🎉",
  "{qtd} retornos de uma vez! Você é uma máquina! 🤩",
  "Uau! {qtd} atendimentos em dia, sou seu fã! 🥳",
  "Missão cumprida: {qtd} retornos atendidos! 🏆",
]

// ── Cobrança: várias formas de pedir, de acordo com a urgência ──────────────
export const COBRANCA_FUTURO = [
  "{oi}! Daqui a {quanto} tem retorno com {cliente}{mais}. Já vai se preparando? 😉",
  "{oi}, aviso rápido: em {quanto} é o retorno do {cliente}{mais}. Separa o que precisa! 📋",
  "Psiu, {oi}! O {cliente} te espera daqui a {quanto}{mais}. Eu já estou nervoso! 😬",
  "{oi}, falta pouco: retorno com {cliente} em {quanto}{mais}. Bora se organizar? ⏳",
]
export const COBRANCA_RECENTE = [
  "{oi}! Tem retorno do {cliente} marcado pra {hora}{mais}. Atende pra eu não levar bronca! 🥺",
  "{oi}, o {cliente} estava marcado pras {hora}{mais}. Dá uma olhadinha, por favor? 🙏",
  "Ei, {oi}! Já deu {hora} e o {cliente} ainda espera{mais}. Me ajuda a não ouvir sermão! 😖",
  "{oi}, retorno do {cliente} às {hora}{mais}. Um 'oi' já resolve muita coisa! 💬",
]
export const COBRANCA_ATRASADO = [
  "{oi}... o {cliente} está esperando desde {hora}{mais}. Se o chefe ver, quem leva bronca sou eu! 😅",
  "{oi}, o {cliente} aguarda desde {hora}{mais}. Eu já estou suando frio! 💦",
  "Socorro, {oi}! O {cliente} está há um tempão esperando (desde {hora}){mais}. 😰",
  "{oi}, será que dá pra olhar o {cliente}? Desde {hora}{mais}... o chefe tem olhos de águia! 🦅",
]
export const COBRANCA_CRITICO = [
  "{oi}, pelo amor! 😱 O {cliente} espera há {quanto}{mais}. O chefe vai me dar uma bronca (e sobra pra nós dois)!",
  "{oi}!!! {quanto} de espera com o {cliente}{mais}. Eu juro que não fui eu! 🙈",
  "Código vermelho, {oi}! 🚨 {cliente} aguardando há {quanto}{mais}. Atende, por favorzinho!",
  "{oi}, o {cliente} está há {quanto} esperando{mais}. Meus circuitos estão em pânico! 😵",
]
