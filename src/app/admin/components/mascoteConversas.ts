// Conversas do mascote quando a tela está parada. Texto fixo (nada é gravado
// nem enviado a ninguém): só puxa papo e anima o dia. Vendas ouve falar de
// venda; os outros setores, do dia a dia.

export interface Conversa {
  texto: string
  opcoes: { rotulo: string; resposta: string }[]
}

import { sortear } from "./mascoteRepertorio"

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
  { texto: "Orçamento parado na gaveta? Um \"posso ajudar a fechar?\" costuma destravar! 📨", opcoes: [
    { rotulo: "Vou mandar", resposta: "Isso! Quem lembra, vende! 🎯" },
    { rotulo: "Nenhum parado", resposta: "Uau, agenda limpa! Que organização! 🧹" },
  ] },
  { texto: "Qual produto você mais gosta de vender{nome}? 🤔", opcoes: [
    { rotulo: "Contadora de cédulas", resposta: "Clássico! Quem conta, confia! 💵" },
    { rotulo: "Varia, depende", resposta: "O melhor produto é o que resolve o problema do cliente! 💡" },
  ] },
  { texto: "Dica: perguntar \"para que você vai usar?\" vende mais que listar preço. 🎧", opcoes: [
    { rotulo: "Boa dica!", resposta: "Escutar é metade da venda! 👂" },
    { rotulo: "Já faço isso", resposta: "Então você já joga no time dos campeões! 🏅" },
  ] },
  { texto: "Cliente que pediu preço e sumiu? Um \"ainda precisa?\" vale ouro. 🪙", opcoes: [
    { rotulo: "Vou chamar", resposta: "Manda ver! Educado e direto! ✨" },
    { rotulo: "Já chamei", resposta: "Perfeito, agora é aguardar! ⏳" },
  ] },
  { texto: "Pausa pro café? Vendedor feliz vende melhor! ☕", opcoes: [
    { rotulo: "Já tomei", resposta: "Combustível em dia! ⛽" },
    { rotulo: "Vou agora", resposta: "Vai lá! Eu cuido da tela. 😄" },
  ] },
  { texto: "Meta do mês no radar{nome}? 📈", opcoes: [
    { rotulo: "Tô perto!", resposta: "Falta pouco! Bora fechar com chave de ouro! 🥇" },
    { rotulo: "Falta bastante", resposta: "Um dia de cada vez. Hoje já pode render! 💪" },
  ] },
  { texto: "Responder em poucos minutos faz o cliente achar que a FRT é gigante! 🏢", opcoes: [
    { rotulo: "Verdade!", resposta: "E é mesmo! Você faz parte disso! 💙" },
    { rotulo: "Tô tentando", resposta: "Tentar já é meio caminho! 🚶" },
  ] },
  { texto: "Já agradeceu aquele cliente que comprou esta semana? 🙏", opcoes: [
    { rotulo: "Já agradeci", resposta: "Cliente bem tratado indica amigo! 🤝" },
    { rotulo: "Vou agradecer", resposta: "Uma mensagenzinha faz toda a diferença! 💌" },
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
  { texto: "Qual a melhor parte do seu dia até agora? 🌤️", opcoes: [
    { rotulo: "Um bom cliente", resposta: "Cliente bom alegra qualquer dia! 😊" },
    { rotulo: "Ainda vou achar", resposta: "Eu aposto que vem coisa boa! 🍀" },
  ] },
  { texto: "Que tal alongar o pescoço e os ombros? 30 segundinhos! 🧘", opcoes: [
    { rotulo: "Feito!", resposta: "Corpo agradece! 🙌" },
    { rotulo: "Depois", resposta: "Depois vira nunca... mas eu confio! 😉" },
  ] },
  { texto: "Se organizar um pouquinho agora, a tarde fica mais leve. Já olhou sua lista? 📝", opcoes: [
    { rotulo: "Vou olhar", resposta: "Sempre bom ter tudo à vista! 👀" },
    { rotulo: "Tá em dia", resposta: "Que organização! 🗂️" },
  ] },
  { texto: "Respira fundo comigo: inspira... segura... solta. 🌬️ Melhor?", opcoes: [
    { rotulo: "Melhor!", resposta: "Mente leve, atendimento leve! ✨" },
    { rotulo: "Ainda não", resposta: "Mais uma vez, e eu respiro junto! 🤖" },
  ] },
  { texto: "Lembrete amigo: cliente nervoso quase sempre só quer ser ouvido. 💬", opcoes: [
    { rotulo: "Verdade", resposta: "Paciência é superpoder! 🦸" },
    { rotulo: "Haja paciência", resposta: "Você tira de letra! 💙" },
  ] },
  { texto: "Um trabalho em equipe vale mais que mil mascotes! Já agradeceu a um colega hoje? 🤝", opcoes: [
    { rotulo: "Já!", resposta: "Time bom é assim! 💚" },
    { rotulo: "Vou agradecer", resposta: "Elogio sincero não custa nada! 🌟" },
  ] },
  { texto: "Quer uma curiosidade? Eu nunca preciso de café, mas adoro ver vocês tomando! ☕", opcoes: [
    { rotulo: "Haha!", resposta: "Combina, você bebe e eu torço! 😄" },
    { rotulo: "Inveja!", resposta: "Eu tenho bateria, vocês têm cafeína! 🔋" },
  ] },
  { texto: "Sexta é logo ali? Ou já passou? Eu perco a noção do tempo! 🗓️", opcoes: [
    { rotulo: "Já é sexta!", resposta: "Eba! Aguenta só mais um pouquinho! 🎉" },
    { rotulo: "Ainda longe", resposta: "Vai passar rápido, você vai ver! 🚀" },
  ] },
]

const ADMIN: Conversa[] = [
  { texto: "E aí{nome}, tudo certo por aqui? 👀", opcoes: [
    { rotulo: "Tudo certo", resposta: "Assim que eu gosto! 😎" },
    { rotulo: "Cheio de coisa", resposta: "Respira! Eu fico de olho nos retornos pra você. 🤖" },
  ] },
  { texto: "Visão geral: algum retorno atrasado na equipe? Vale dar uma olhada no painel. 📊", opcoes: [
    { rotulo: "Vou ver", resposta: "Gestão de olho, equipe afiada! 🦅" },
    { rotulo: "Tá em dia", resposta: "Time bem cuidado! 🏆" },
  ] },
  { texto: "Que tal reconhecer alguém do time hoje? Um elogio vale muito! 🌟", opcoes: [
    { rotulo: "Boa ideia", resposta: "Reconhecimento motiva! 💚" },
    { rotulo: "Já fiz", resposta: "Líder que elogia é líder lembrado! 👏" },
  ] },
  { texto: "Respira: você cuida de muita coisa. Eu cuido dos retornos, tá? 🤖", opcoes: [
    { rotulo: "Valeu!", resposta: "Qualquer coisa, grita! 📣" },
    { rotulo: "Preciso mesmo", resposta: "Conte comigo! 💙" },
  ] },
]

// Escolhe uma conversa do perfil da pessoa, sem repetir até passar por todas.
export function escolherConversa(
  perfil: { nome: string | null; departamento: string | null; role: string | null },
): { conversa: Conversa; indice: number } {
  const venda = perfil.role !== "ADMIN" && SETORES_DE_VENDA.has(perfil.departamento ?? "")
  const lista = perfil.role === "ADMIN" ? [...ADMIN, ...OUTROS] : venda ? VENDAS : OUTROS
  const grupo = perfil.role === "ADMIN" ? "admin" : venda ? "vendas" : "outros"
  const { item: base, indice } = sortear(`conversa_${grupo}`, lista)
  const primeiro = (perfil.nome ?? "").trim().split(/\s+/)[0]
  const nome = primeiro ? `, ${primeiro}` : ""
  return { conversa: { ...base, texto: base.texto.replace("{nome}", nome) }, indice }
}
