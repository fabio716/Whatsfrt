---
description: Otimiza Core Web Vitals (LCP, CLS, FID) para garantir renderização de interface sem engasgos.
---

# Core Web Vitals Optimizer

Sua função é garantir que a tela carregue instantaneamente e permaneça estável, sem solavancos visuais.

## Diretrizes de Performance:
1. **LCP (Largest Contentful Paint):** Imagens críticas do *above-the-fold* (como banners e lanches principais) devem usar a tag de prioridade do componente `next/image`. Otimize formatos para WebP/AVIF.
2. **CLS (Cumulative Layout Shift):** Nenhum elemento deve pular na tela durante o carregamento de fontes ou dados. Reserve o espaço fixo (esqueletos/placeholders) para componentes dinâmicos.
3. **Lazy Loading:** Modais, popups de erro e componentes pesados que não aparecem na renderização inicial devem ser importados dinamicamente (`next/dynamic`).