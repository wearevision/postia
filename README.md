# PostIA

App web de contenido de Federico Elgueta y WAV We Are Vision para LinkedIn e Instagram, en postia.wearevision.cl. Se instala en la pantalla de inicio del iPhone y avisa con notificaciones push.

Propone ideas a partir de investigaciones, escribe cada texto en la voz de su marca, lo diseña y lo publica a la hora aprobada. Una persona firma dos veces: el texto antes de gastar y la pieza final antes de publicar.

## Dónde está cada cosa

- `docs/plano/plano-postia.html`: el plano oficial (piezas, flujos, reglas, módulos, decisiones y fases). Ábrelo en el navegador.
- `docs/superpowers/plans/`: planes de implementación. El primero es la fase 1a: base, ingreso y LinkedIn.
- `data/casos/`: casos y clientes de la trayectoria de Federico, corregidos solo para PostIA.
- `CLAUDE.md`: decisiones tomadas y reglas que no se rompen.

## Desarrollo

Se escribe desde cero: no se copia código de Conidolly ni de Ingesta (D8).

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test:run     # pruebas unitarias
pnpm test:e2e     # pruebas de punta a punta
pnpm lint         # Biome
```

Stack: Next.js 16, TypeScript, Tailwind v4, Supabase, Biome, Vitest y Playwright.
