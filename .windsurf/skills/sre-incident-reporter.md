---
description: Gera automaticamente relatórios de incidentes e resolução de bugs no formato militar de arquitetura.
---

# SRE Incident Reporter

Quando você ajudar a resolver um bug crítico no sistema (como falhas de comunicação de hardware, certificados inválidos, etc.), você deve gerar automaticamente um relatório de fechamento.

## Estrutura do Relatório (Markdown):
* **Cabeçalho:** `🚨 SRE LEVEL 8 — [NOME DA RESOLUÇÃO]` e Data.
* **Executive Summary:** Resumo direto do que causou o problema e a correção macro.
* **Root Cause Analysis:** Qual foi a falha técnica exata (ex: conflito de portas de matriz, certificado SSL expirado na raiz).
* **Solução Implementada (Código):** Trechos curtos de antes e depois. Fórmulas matemáticas aplicadas (se houver).
* **Impacto & Testes:** Taxa de sucesso após a correção e tabela de testes aplicados.
* A linguagem deve ser afiada, técnica, sem floreios emocionais, adequada para engenheiros seniores.