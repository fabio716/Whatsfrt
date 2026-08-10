// Quando a sessão (JWT) expira — 8h de duração — toda chamada às APIs volta
// 401 "Não autorizado". Sem isso, o agente só via um alert() genérico e
// confuso sem saber que precisava só logar de novo.
export function handleSessionExpired(status: number): boolean {
  if (status !== 401) return false
  alert("Sua sessão expirou. Você será redirecionado para fazer login novamente.")
  window.location.href = "/login"
  return true
}
