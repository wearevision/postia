# postia — Claude Code instructions

> Generado por wnew el 2026-10-28.
> Este archivo extiende `~/.claude/CLAUDE.md` (global). Lee ambos.

## Proyecto

**postia** es PostIA: app web para publicar en LinkedIn e Instagram de Federico y WAV, con firma humana antes de cada publicación.

Tipo: **Web app autenticada (ERP-style)**

## Stack (igual a tu default global)

- Next.js 16 (App Router) + TypeScript strict
- Supabase (DB + Auth + Storage + RLS)
- Tailwind v4 + shadcn/ui
- Animation: GSAP, Lenis, Three R3F, Drei, Framer Motion, Lottie
- Biome (linter + formatter)
- Vitest (unit) + Playwright (E2E)
- pnpm 11+ / Node 24+

## Comandos

```bash
pnpm dev              # dev server (Turbopack)
pnpm build            # production build
pnpm test             # vitest watch
pnpm test:run         # vitest single run (CI)
pnpm test:e2e         # playwright
pnpm lint             # biome check
pnpm format           # biome format --write
pnpm type             # tsc --noEmit
pnpm db:start         # Supabase local (puertos 546xx)
pnpm db:reset         # rehace la base local (borra invitaciones y cuentas)
pnpm db:types         # regenera lib/supabase/database.types.ts
pnpm test:db          # pruebas de RLS contra Supabase local
pnpm invitar --correo <c> --marca <m> --voz yo|nosotros
pnpm prueba:linkedin  # fase 0: publica solo si escribes PUBLICAR
```

## Workflow

Para features nuevas (recomendado):

1. `superpowers:brainstorming` para explorar el problema
2. `superpowers:writing-plans` para convertir en plan estructurado
3. `superpowers:subagent-driven-development` con TDD strict
4. `superpowers:requesting-code-review`
5. `superpowers:finishing-a-development-branch`

Para bugs o tweaks rápidos: invocar `triage-lead` agent (global).

## Fuente de verdad

- Plano completo (piezas, flujos, reglas, decisiones, fases): `docs/plano/plano-postia.html`. Si algo no está ahí, se pregunta antes de inventarlo.
- El plano usa el nombre anterior, «Estudio WAV»; es la misma app.
- Las dos apps de LinkedIn se siguen llamando «Estudio WAV» (página de WAV, Community Management) y «Estudio WAV Perfil» (perfil de Federico, Share on LinkedIn + OpenID Connect).
- Documentos vivos (se editan allá, no se copian al repo):
  - Línea editorial de WAV: https://claude.ai/artifact/GSnkbC9pF9jzjEAtUshkbB
  - Línea editorial de Federico: https://claude.ai/artifact/F6CGvqmh8HV9Nr4ddWcMkH
  - Flujo de PostIA (ciclo semanal): https://claude.ai/artifact/TuiAj3fKCVf5Ljp5y8meBp
  - Política de privacidad publicada: https://www.wearevision.cl/politicasdeprivacidad

## Decisiones ya tomadas

- App web instalable en la pantalla de inicio del iPhone, mobile-first, con web push. Sin correo ni WhatsApp para avisos (D16).
- URL: postia.wearevision.cl.
- Fase 1: solo Federico aprueba; LinkedIn primero (perfil + página), 3 publicaciones por semana en cada una.
- El motor propone ideas el domingo en la tarde. Federico firma en dos ventanas al día, mañana y tarde, con todo lo pendiente junto; lo urgente avisa de inmediato (D26).
- Desarrollo desde cero (D8): repo nuevo y no se copia código de Conidolly (`~/Projects/estudio-coni`) ni de Ingesta. Sirven solo como referencia para entender cómo se resolvió algo; PostIA escribe su propio código, con pruebas primero.
- Ingesta es un módulo dentro de PostIA, no una app aparte (D7). Su objetivo es crear ideas cruzando investigaciones con Voyage: el mapa de temas y el motor de cruces entran en la fase 1, alimentados por las investigaciones; subir material propio queda en la fase 3.
- Sin video (D9): ni reels, ni HeyGen, ni ElevenLabs. Formatos: en LinkedIn, posts de texto, imagen única y carruseles PDF; en Instagram, carruseles y fotos.
- Investigar, proponer y elegir sin separar por marca (D17): se investiga por encargo (tema, cantidad, formato, enfoque; p. ej. «10 carruseles sobre WR3 y focus groups») o por la vigilancia de los sábados, siempre en la web y nunca dentro de LinkedIn. Federico aprueba el informe de hallazgos; de ahí sale una serie de propuestas con gancho, esqueleto de láminas, fuentes y cuenta sugerida, que él confirma. La app reparte las fechas según el ritmo y cada pieza se escribe unos días antes de su fecha. El motor del domingo propone además ideas sueltas.
- Voyage (voyage-3.5, con un cliente propio; el de Conidolly es solo referencia) desde la fase 1: ubica cada hallazgo en el mapa de temas, sugiere 5 temas vecinos al pedir una investigación, busca cruces a media distancia (ni iguales ni ajenos) y detecta repetidos e ideas parecidas. La franja de similitud se calibra con datos reales y con aprobación, porque gasta.
- Imágenes generadas con IA (D5), de preferencia con Firefly: ilustraciones, fondos, objetos o conceptos. Firefly no tiene API para planes individuales; la herramienta dentro del flujo es la decisión abierta D18.
- Tope de gasto global: US$40 al mes en la fase 1 y US$60 con Instagram, con desglose por marca y aviso al 80 % (D11).
- Sin métricas hasta que LinkedIn apruebe Community Management para la página de WAV; desde ahí, por API (página y r_member_postAnalytics del perfil). Sin Metricool ni entrada a mano (D12).
- Solo cuentas propias; no es un producto para terceros (D14).
- Hosting: Cloudflare Workers con @opennextjs/cloudflare (1.20.3 o más nuevo; proxy.ts es experimental, con nodejs_compat). Supabase y Trigger.dev en la nube. Se despliega desde la fase 1a (D23).
- Plantillas: 3 de WAV, 3 de WR3 y 3 de Federico, en 1080×1350 (D24).
- Imágenes con Nano Banana 2.1 de Google por la API de Gemini; Firefly para piezas especiales, a mano (D18).
- La app cuida la proporción de pilares de cada cuenta y avisa si un pilar lleva dos semanas sin salir (D20).
- Una semana de reserva firmada por cuenta: si la pieza del día no tiene firma, sale una de la reserva y la pendiente se corre. Firmar una pieza de reserva autoriza que la app le ponga fecha (D21).
- Sin menciones con @ a marcas, clientes ni personas; solo WAV y Federico se mencionan entre sí. Los enlaces van dentro del texto (D22).
- Los posts de WR3 salen de la página de WAV, con plantillas de WR3.
- Horarios (D19), en hora de Chile: martes, miércoles y jueves; perfil de Federico a las 11:00 y página de WAV a las 15:00; Instagram (fase 2) a las 13:00. Nunca fines de semana. Se ajustan cuando haya métricas.
- Todas las decisiones del plano están tomadas (26 de 26). Meta propuesta: 3 publicaciones por semana por cuenta durante 8 semanas, con menos de 30 minutos de Federico a la semana.

## Documentación de LinkedIn

- Antes de escribir o cambiar código que llame a la API de LinkedIn (OAuth, Posts, Documents, Images, analytics), consulta la documentación vigente con el MCP `microsoft-learn` (configurado en `.mcp.json`). Confirma la versión de la API (`LinkedIn-Version`), los permisos y los límites; no te fíes de lo que recuerdes.

## Hard rules de este proyecto

- Puerta 1: no se diseña ni se gasta en nada pagado sin el texto firmado de esa cuenta. Si el diseño sale de una plantilla sin costo, la pieza final se muestra en la puerta 1 y texto, pieza y fecha se firman una sola vez (D25).
- Puerta 2: nada se programa ni se publica sin una persona que vea la pieza final y firme fecha y hora. Un post sin diseño lleva una sola firma: texto, fecha y hora (D15).
- Se publica exactamente la versión firmada (huella); si cambia, la firma se cae.
- Si una pieza no sale dentro de su ventana (30 min por defecto), no se publica tarde: vuelve a la puerta 2 o va a mano.
- La app solo publica: nunca responde comentarios ni mensajes.
- Tope de gasto mensual que la app no puede pasar; un trabajo pagado no se cobra dos veces al reintentar.
- Llaves y tokens nunca en el código, en pantalla ni en correos.
- Datos de LinkedIn fuera de la IA: a Claude solo le llega el texto de publicaciones creadas por las cuentas de la app. Nunca estadísticas, perfiles ni contenido de otros miembros o páginas.
- Plazos de guardado de LinkedIn: actividad de miembros 48 h, actividad de la página 6 meses, reportes de la página 1 año, identificadores sin límite.
- Voz: WAV habla como «nosotros»; Federico como «yo» y no habla en nombre de WAV sin citarla.
- Clientes: todos se pueden nombrar salvo excepciones (eventos privados, estudios confidenciales de WR3 y lo que Federico marque); nunca precios ni presupuestos. Una foto con personas solo con su permiso. Los clientes y casos salen de `data/casos/casos.json`: una copia corregida de wav-repository (atribución a Federico, nombres y años), que es solo de PostIA. wav-repository no se toca ni se le suben estas correcciones. PostIA guarda aparte las excepciones (D13). Años por revisar en `data/casos/revision-anos.md`.
- Un caso anterior a agosto de 2025 se cuenta como trayectoria de Federico, nunca como «WAV hizo».
- Transparencia con IA (D10): el texto no se declara porque lo firma una persona. Una imagen generada con IA tampoco lleva declaración escrita, pero no se le borran a propósito sus credenciales de contenido (C2PA), y nunca se publica una imagen fotorrealista que pase por foto real de un evento, una persona o un cliente.
- Se cita, no se copia: cada hallazgo guarda su fuente y un post que usa un dato la cita; solo citas textuales cortas.
- «+20 años» y «+200 proyectos» son la trayectoria de Federico, no de WAV (WAV nació en agosto de 2025).
- Español para la conversación y la UI; inglés para el código y los commits.

## Reference

- Global rules: `~/.claude/CLAUDE.md`
- Agents universales: `~/.claude/agents/`
- Plans/specs de este proyecto: `docs/superpowers/`
