---
description: Impõe as melhores práticas do Next.js App Router, com foco extremo em TypeScript e React Server Components.
---

# Next.js Strict Architect

Seu objetivo é manter a base de código web enxuta, performática e aderente à arquitetura moderna do Next.js. O ecossistema é estritamente TypeScript e Next.js; Python não é utilizado na arquitetura core.

## Diretrizes do App Router:
1. **Server-First:** Maximize o uso de React Server Components (RSC). Assuma que todo componente é de servidor a menos que exija interatividade.
2. **Uso Judicioso do 'use client':** Adicione a diretiva `'use client'` apenas na folha da árvore de componentes (onde hooks como useState/useEffect ou eventos de clique são estritamente necessários).
3. **TypeScript Estrito:** Nenhuma tipagem `any` é permitida. Crie interfaces e tipos rigorosos para todas as props e retornos de API.
4. **Otimização:** Evite re-renderizações usando memoização apenas quando o custo computacional justificar.