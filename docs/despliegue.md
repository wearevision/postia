# Despliegue de PostIA

PostIA corre en **https://postia.wearevision.cl** (D23).

## Qué vive dónde

| Pieza | Dónde | Identificador |
|---|---|---|
| App (Next.js 16 con OpenNext) | Cloudflare Workers, cuenta de Federico | Worker `postia`, dominio propio `postia.wearevision.cl` |
| Base de datos, Auth y Vault | Supabase, organización WAV (plan Pro, US$10 al mes) | proyecto `postia`, ref `ipjszctraqhvpsyogbbd`, región `sa-east-1` |
| Llaves de LinkedIn y VAPID | Secretos del Worker | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| URL de retorno de LinkedIn | `vars` en `wrangler.jsonc` | `LINKEDIN_REDIRECT_URI` |
| Llaves de la app «Estudio WAV» (página de WAV, Community Management) | Secretos del Worker y variables de Trigger.dev prod (secretas) | `LINKEDIN_PAGINA_CLIENT_ID`, `LINKEDIN_PAGINA_CLIENT_SECRET` |
| URL de retorno de la página | `vars` en `wrangler.jsonc` | `LINKEDIN_PAGINA_REDIRECT_URI` |
| Tokens de LinkedIn de cada cuenta | Supabase Vault del proyecto | `conexion:<id>`, `conexion:<id>:renovacion` (si LinkedIn manda token de renovación), `eleccion:<id>` (≤ 10 min, mientras se elige página) |
| Publicador (cada 5 min, hora de Chile) | Trigger.dev, organización WAV | proyecto `postia`, ref `proj_cfileylububfgxfoqhyb`, tarea `publicar-pendientes` |
| Llaves del publicador | Variables de Trigger.dev prod | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secreta), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (secreta), `VAPID_SUBJECT` |
| PDFs de las piezas | Supabase Storage, bucket privado `piezas` | una carpeta por marca, hasta 30 MB por archivo |
| Llave service_role | `.env.produccion` (ignorado) y Trigger.dev prod | Nunca en el Worker |

Los valores nunca van en el repo, en el chat ni en un log. Este documento solo nombra.

## Desplegar a mano

Compila con los valores públicos de producción en el entorno del comando. No van en `.env.production*`, porque `next build` siempre carga esos archivos y `pnpm preview` terminaría compilando contra producción.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ipjszctraqhvpsyogbbd.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key del proyecto> pnpm desplegar
```

`pnpm desplegar` compila con OpenNext y despliega con `--keep-vars`, para no borrar variables definidas en el panel. Para comprobar que el build apuntó a producción:

```bash
grep -rl "ipjszctraqhvpsyogbbd" .open-next | head -1
```

## Migraciones

Son manuales: se corre `supabase db push` (proyecto ya vinculado con `supabase link`) **antes** de hacer merge de una migración a `main`. Automatizarlas en el CI exige poner la contraseña de la base en GitHub, y esa decisión está pendiente.

## Secretos

- **Ver los nombres:** `pnpm exec wrangler secret list`.
- **Rotar uno:** `pnpm exec wrangler secret put <NOMBRE>` (pide el valor) o `wrangler secret bulk` por stdin. Rigen de inmediato.
- **Rotar VAPID** cambia la llave en dos lugares a la vez: el Worker (que la entrega al celular) y Trigger.dev (que manda los avisos). Si quedan distintas, los avisos fallan. Después de rotar, cada aparato muestra de nuevo «Activar avisos» y hay que activarlos.
- **Trigger.dev:** `pnpm exec trigger env set <NOMBRE> <valor> --env prod [--secret]`. El CI despliega el publicador con `TRIGGER_ACCESS_TOKEN` (secreto de GitHub).

## Publicador

`trigger/publicar.ts` corre cada 5 minutos en Trigger.dev, de a una corrida (lote de 3 piezas, hasta 540 s, arriendo de 10 min). Ver corridas y logs en el panel de Trigger.dev, proyecto `postia`. Desplegar a mano:

```bash
pnpm exec trigger deploy --env prod
```

Las migraciones van **antes** que el publicador: sin las tablas de piezas, cada corrida falla.

## Volver atrás

```bash
pnpm exec wrangler deployments list
pnpm exec wrangler rollback <version-id>
```

## Logs

```bash
pnpm exec wrangler tail postia
```

## Probar antes de desplegar

`pnpm preview` corre el Worker en `workerd` local (puerto 8787) con `.dev.vars` (ignorado, copia de `.env.local` más `NEXTJS_ENV=development`). Las mismas pruebas de punta a punta corren contra él:

```bash
E2E_BASE_URL=http://localhost:8787 pnpm test:e2e
```

## Límites a vigilar

- **Tamaño del Worker:** 2.880 KiB comprimido; el plan gratuito permite 3 MiB. La próxima dependencia grande obliga a pasar al plan de pago (10 MiB) o a sacar dependencias del bundle.
- **Correos de Auth:** el SMTP por defecto de Supabase solo envía a miembros del equipo de la organización WAV, con un límite bajo por hora. Alcanza para la fase 1, donde solo entra Federico; el equipo de la fase 2 necesita un SMTP propio.
- **`proxy.ts` en Workers** es experimental en OpenNext (soportado desde la 1.20.3). Antes de subir de versión `@opennextjs/cloudflare`, correr el E2E contra `pnpm preview`.
