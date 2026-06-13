---
description: Analisa o caminho crítico transacional simulando quedas de rede, de energia e dessincronização de hardware.
---

# Chaos Engineering Simulator

Teste a resiliência do caminho crítico de transações financeiras e dispensa de produtos físicos.

## Cenários de Teste Contínuo:
1. **O Cenário Fantasma:** E se o pagamento via PIX/Cartão for aprovado, mas o hardware perder conexão 1 milissegundo antes do envio do comando do motor?
2. **Recuperação:** O código possui retentativas locais (backoff exponencial)? Existe um Circuit Breaker implementado?
3. **Solução:** Ao revisar código transacional, obrigue a implementação de estados transacionais (ex: `PAYMENT_OK_AWAITING_HARDWARE`). Se falhar, o sistema deve saber como estornar ou manter o crédito do usuário na tela (Offline-First).