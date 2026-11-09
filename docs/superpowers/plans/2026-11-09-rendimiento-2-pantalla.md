# Rendimiento, bloque 2: pantalla — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Same «Rules for every task»
> as `2026-11-09-rendimiento-1-importador.md`. Design: `docs/superpowers/specs/2026-11-09-rendimiento-design.md`
> (block 2). No migration: the tables exist (`20261109170000_metricas.sql`).

**Goal:** a «Rendimiento» screen where Federico sees, per account, each post's figures, the best and worst against
the account's median, the monthly trend and the audience.

**Architecture:** pure functions (`lib/rendimiento/resumen.ts`) do every calculation; a reader
(`lib/rendimiento/lectura.ts`) loads the rows under RLS and calls them; the server page renders; one client component
sorts the post list. Mobile-first, Spanish UI, existing classes (`tarjeta`, `boton`, `campo`, `text-apagado`,
`text-peligro`); no hex colours.

## Data (tables from block 1)

- `metricas_de_publicacion`: `cuenta_id, post_urn, pieza_id, publicada_el, interacciones, impresiones, extracto,
  clics, seguidores_nuevos, origen`. When both `api` and `importacion` rows exist for one URN, the `api` row wins.
- `metricas_diarias`: `cuenta_id, dia, impresiones, interacciones, seguidores_nuevos, visitas, visitantes_unicos, origen`.
- `importaciones_de_metricas`: `id, cuenta_id, desde, hasta, seguidores_total, creada_en`.
- `publico_de_la_cuenta`: `importacion_id, tipo (publico|contenido|seguidores|visitantes), categoria, valor,
  porcentaje, menor_a_uno, cantidad`.
- A post's text: when `pieza_id` is set, the first 140 characters of the piece's latest version text (`versiones`,
  highest `numero`); else `extracto`; else «Publicación anterior a PostIA».

## Task 1: Pure calculations

**Files:** create `lib/rendimiento/resumen.ts`, test `tests/unit/resumen-de-rendimiento.test.ts`.

- `tasa(p)`: `interacciones / impresiones` when both are numbers and `impresiones > 0`; else `null`.
- `mediana(valores: number[])`: `null` for an empty list; the middle value, or the mean of the two middle ones.
- `marcar(publicaciones)`: among posts with a `tasa`, the 3 highest are `"mejor"` and the 3 lowest `"peor"`, only when
  there are at least 6 posts with a tasa (fewer: nobody is marked); ties keep the earlier date first.
- `muestraChica(publicaciones)`: `true` when fewer than 8 posts have a `tasa` (`MINIMO_PARA_CONCLUIR = 8`).
- `porMes(dias)`: groups days by `YYYY-MM`, summing each figure; a month where a figure is null on every day keeps
  `null` for it (not 0). Sorted by month ascending.
- `publicoConCambios(actual, anterior)`: per `tipo` and `categoria`, the top 5 values of the latest import by
  `porcentaje` (profile) or `cantidad` (page; `menor_a_uno` sorts as 0.5), each with `cambio`: `"nuevo"` if absent in
  the previous import of the same account, else `"sube" | "baja" | "igual"`; `null` when there is no previous import.
- Strict TDD with small inline fixtures. Commit: `feat: rendimiento calculations (rate, median, best and worst, months, audience changes)`.

## Task 2: Reader

**Files:** create `lib/rendimiento/lectura.ts`, test `tests/integration/lectura-rendimiento.test.ts`.

- `cuentasConRendimiento(db)`: accounts the person can see (`id, nombre, tipo`), ordered by nombre, each with
  `tieneDatos` (any `metricas_de_publicacion` or `importaciones_de_metricas` row).
- `rendimientoDeCuenta(db, cuentaId)`: `{ publicaciones, meses, publico, ultimaImportacion, seguidoresTotal }` using the
  functions of Task 1; `publicaciones` sorted by date descending, each `{ id, publicadaEl, texto, piezaId,
  impresiones, interacciones, tasa, clics, seguidoresNuevos, marca }`; `publico` from the latest import and the one
  before it. Under RLS another owner gets empty results, not an error.
- Integration tests over local Supabase (reuse `publicadaConUrn` and the `importar_metricas` RPC to seed): the piece
  text replaces the URN, an earlier post shows its extract or the fallback, `api` wins over `importacion`, months and
  audience come back, another owner sees nothing.
- Commit: `feat: read an account's rendimiento under RLS`.

## Task 3: Screen and links

**Files:** add `RUTA_DE_RENDIMIENTO = "/rendimiento"` to `lib/sesion/rutas.ts`; create `app/(app)/rendimiento/page.tsx`,
`app/(app)/rendimiento/publicaciones.tsx` (client), tests `tests/unit/rendimiento.test.tsx`; links in
`app/(app)/page.tsx` (next to «Ver la semana»: «Ver el rendimiento») and `app/(app)/ajustes/page.tsx` (after the
import form: «Ver el rendimiento»). `navegacion.tsx`: `/rendimiento` marks no tab (it is reached from Inicio/Ajustes);
keep its tests green.

- Page `?cuenta=<id>`: defaults to the first account with data; account chooser as links (one per account).
  No data for the account: «Todavía no hay estadísticas de esta cuenta.» with a link to Ajustes → Importar.
- Header: last import period («Datos del 10 nov 2025 al 9 nov 2026»), followers total when present.
- Aviso when `muestraChica`: «Todavía son pocas publicaciones con interacciones para sacar conclusiones.»
- «Publicaciones» (client component): sort control (select «Ordenar por»: Fecha, Tasa de interacción, Impresiones,
  Interacciones; descending), each row: date (`fechaCorta`-like, Chile), text (link to the piece when `piezaId`),
  impresiones, interacciones, tasa as `4,2 %` (es-CL), and for the page clics and nuevos seguidores when present;
  «Mejor» / «Peor» chips from `marca`. Missing values show «—», never 0.
- «Tendencia»: per month impresiones, interacciones, nuevos seguidores, visitas (page) — a simple list or table with
  `aria-label`, no chart library.
- «Tu público»: sections «Quienes te siguen» (`publico` / `seguidores`) and «Quienes vieron tus publicaciones»
  (`contenido` / `visitantes` → «Quienes visitaron la página»), each category with its top 5 and a «sube / baja /
  nuevo» word when known; percentages `4 %` or `< 1 %`, counts as numbers.
- Unit tests for the page pieces with fixtures (sorting, chips, «—», percent formatting, no-data state).
- Commit: `feat: rendimiento screen with posts, trend and audience`.

## Task 4: Verification

`pnpm format`, `pnpm type`, `pnpm lint`, `pnpm test:run`, the new integration file plus the full `test:db` alone,
`pnpm build`. Check line 1 `"use client"` on client files. No dev server on port 3000.
