// Conversas do mascote quando a tela está parada. Texto fixo (nada é gravado
// nem enviado a ninguém): só puxa papo e anima o dia. Vendas ouve falar de
// venda; os outros setores, do dia a dia.

export interface Conversa {
  texto: string
  opcoes: { rotulo: string; resposta: string }[]
}

const SETORES_DE_VENDA = new Set(["VENDAS", "COMERCIAL"])

const VENDAS: Conversa[] = [
  { texto: "E aí{nome}, vendeu hoje? 💰", opcoes: [
    { rotulo: "Vendi! 🎉", resposta: "BOAAA! Bora pra próxima! 🚀" },
    { rotulo: "Ainda não", resposta: "Calma, o dia é longo! Uma ligação muda tudo. 💪" },
  ] },
  { texto: "Já chamou aquele cliente que sumiu? Hoje pode ser o dia dele voltar! 📞", opcoes: [
    { rotulo: "Vou chamar!", resposta: "Esse é o espírito! 🔥" },
    { rotulo: "Já chamei", resposta: "Então é questão de tempo! 😉" },
  ] },
  { texto: "Cada atendimento bem feito é uma venda a caminho. Bora{nome}? 🚀", opcoes: [
    { rotulo: "Bora!", resposta: "Isso aí! Você manda bem! ⭐" },
    { rotulo: "Tô na luta", resposta: "Eu sei, e eu torço por você! 💙" },
  ] },
  { texto: "Dica do dia: quem responde rápido vende mais. ⚡ Tem alguém esperando você?", opcoes: [
    { rotulo: "Vou olhar", resposta: "Boa! Cliente esperando esfria rápido. 👀" },
    { rotulo: "Tudo em dia", resposta: "Que máximo! Orgulho de você! 🏆" },
  ] },
]

const OUTROS: Conversa[] = [
  { texto: "E aí{nome}, como está seu dia? 😊", opcoes: [
    { rotulo: "Ótimo!", resposta: "Que bom! Continue assim! ✨" },
    { rotulo: "Corrido…", resposta: "Respira fundo, você dá conta! 💙" },
  ] },
  { texto: "Já tomou água hoje? 💧", opcoes: [
    { rotulo: "Já!", resposta: "Perfeito! Hidratação em dia! 🥤" },
    { rotulo: "Esqueci", resposta: "Vai lá, eu espero! 😄" },
  ] },
  { texto: "Passei só pra dizer: seu trabalho faz diferença pra FRT. 💙", opcoes: [
    { rotulo: "Valeu!", resposta: "De nada! Conte comigo! 🤖" },
    { rotulo: "Preciso de pausa", resposta: "Alonga um pouquinho, é rapidinho! 🧘" },
  ] },
  { texto: "Tem algum cliente que merece um carinho extra hoje? 🌟", opcoes: [
    { rotulo: "Tem sim", resposta: "Capricha! Cliente feliz volta sempre. 💚" },
    { rotulo: "Tudo certo", resposta: "Ótimo! Serviço de campeão! 🏅" },
  ] },
]

const ADMIN: Conversa[] = [
  { texto: "E aí{nome}, tudo certo por aqui? 👀", opcoes: [
    { rotulo: "Tudo certo", resposta: "Assim que eu gosto! 😎" },
    { rotulo: "Cheio de coisa", resposta: "Respira! Eu fico de olho nos retornos pra você. 🤖" },
  ] },
]

// Escolhe uma conversa do perfil da pessoa, sem repetir a anterior.
export function escolherConversa(
  perfil: { nome: string | null; departamento: string | null; role: string | null },
  anterior: number,
): { conversa: Conversa; indice: number } {
  const lista = perfil.role === "ADMIN" ? [...ADMIN, ...OUTROS]
    : SETORES_DE_VENDA.has(perfil.departamento ?? "") ? VENDAS : OUTROS
  let indice = Math.floor(Math.random() * lista.length)
  if (lista.length > 1 && indice === anterior) indice = (indice + 1) % lista.length
  const primeiro = (perfil.nome ?? "").trim().split(/\s+/)[0]
  const nome = primeiro ? `, ${primeiro}` : ""
  const base = lista[indice]
  return { conversa: { ...base, texto: base.texto.replace("{nome}", nome) }, indice }
}
