# Despliegue de PostIA

PostIA corre en **https://postia.wearevision.cl** (D23).

## Qué vive dónde

| Pieza | Dónde | Identificador |
|---|---|---|
| App (Next.js 16 con OpenNext) | Cloudflare Workers, cuenta de Federico | Worker `postia`, dominio propio `postia.wearevision.cl` |
| Base de datos, Auth y Vault | Supabase, organización WAV (plan Pro, US$10 al mes) | proyecto `postia`, ref `ipjszctraqhvpsyogbbd`, región `sa-east-1` |
| Llaves de LinkedIn y VAPID | Secretos del Worker | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| URL de retorno de LinkedIn | `vars` en `wrangler.jsonc` | `LINKEDIN_REDIRECT_URI` |
| Tokens de LinkedIn de cada cuenta | Supabase Vault del proyecto | `conexion:<id>` |
| Llave service_role | Solo en `.env.produccion` (ignorado), para `pnpm invitar:prod` | Nunca en el Worker |

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
- **Rotar VAPID** invalida las suscripciones de todos los aparatos: hay que volver a activar los avisos en cada uno.

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
