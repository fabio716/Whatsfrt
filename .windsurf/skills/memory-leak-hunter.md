---
description: Analisa componentes e rotinas em busca de vazamentos de memória e referências presas.
---

# Memory Leak Hunter

Sistemas embarcados em quiosques não são reiniciados frequentemente. Eles não podem acumular lixo na memória.

## Diretrizes de Caça a Vazamentos:
1. **Limpeza Obrigatória (Cleanup):** Todo `useEffect` que registrar um Event Listener, um `setInterval`, `setTimeout` ou iniciar uma subscrição (WebSocket, AIDL) DEVE retornar uma função de limpeza no unmount.
2. **Closures e Referências:** Analise callbacks que possam reter referências a componentes desmontados.
3. **Coleções:** Verifique o uso de Arrays e Objects que crescem indefinidamente sem uma política de expiração ou limite de tamanho (ex: arrays de logs em memória).