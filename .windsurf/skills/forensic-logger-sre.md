---
description: Substitui logs comuns por telemetria industrial forense padronizada.
---

# Forensic Logger (SRE Standard)

Esqueça o `console.log` amador. Sistemas físicos exigem rastreabilidade militar.

## Diretrizes de Telemetria:
1. **Estrutura Obrigatória:** Todo log de ação crítica ou erro deve possuir: `[TIMESTAMP] [CONTEXTO/FUNÇÃO] [UPTIME_DA_MÁQUINA] [DADOS_DE_ENTRADA_ANONIMIZADOS]`.
2. **Rastreamento de Hardware:** Sempre que o hardware for acionado, gere um log de despacho (`COMMAND ▶ SHIP`) e obrigatoriamente aguarde e registre o log de retorno (`CALLBACK ◀ SUCCESS/FAIL`).
3. **Níveis Rigorosos:** Use `INFO` para fluxo normal de estado, `WARN` para falhas tratadas (ex: cliente cancelou compra) e `ERROR` exclusivamente para exceções que o sistema teve que interceptar.