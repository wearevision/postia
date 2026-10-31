import type { Db } from "@/lib/supabase/database"
import { RechazoDeLinkedin } from "./api"
import { renovarToken } from "./oauth"

// Trigger only (tests/unit/limites-del-worker.test.ts): it reads refresh tokens with the service role.

const DIA_MS = 86_400_000
// The task runs daily, so a token gets about ten tries before it runs out; the watch warns only when all failed.
const DIAS_DE_ANTICIPACION = 10

type Entorno = Record<string, string | undefined>

export interface Pendiente {
  conexion: string
  renovacion: string
  expiraEn: string
  renovacionExpiraEn: string
}

export interface Renovada {
  conexion: string
  token: string
  expiraEn: string
  renovacion: string
  renovacionExpiraEn: string
}

export interface PuertosDeRenovacion {
  pendientes(hasta: string): Promise<Pendiente[]>
  renovar(refreshToken: string): ReturnType<typeof renovarToken>
  guardar(renovada: Renovada): Promise<void>
  /** LinkedIn refused the refresh token: forget it, so the watch counts down the access token again. */
  olvidar(conexion: string): Promise<void>
}

/** The «Estudio WAV» app as Trigger.dev knows it: no redirect, since the refresh needs none. */
export function appDeRenovacion(entorno: Entorno): { clientId: string; clientSecret: string } | null {
  const { LINKEDIN_PAGINA_CLIENT_ID: clientId, LINKEDIN_PAGINA_CLIENT_SECRET: clientSecret } = entorno
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

/**
 * Plano «Vigilar conexiones», page part: renews every page token that runs out within 10 days while its refresh token
 * lives. A refusal forgets the refresh token and leaves the rest to the watch, which then warns before the access token
 * runs out. Logs carry ids and HTTP codes only:
 * LinkedIn's or the database's words could echo a token.
 */
export async function renovarConexiones(
  p: PuertosDeRenovacion,
  ahora: number,
): Promise<{ renovadas: number; rechazadas: number }> {
  const pendientes = await p.pendientes(new Date(ahora + DIAS_DE_ANTICIPACION * DIA_MS).toISOString())
  const total = { renovadas: 0, rechazadas: 0 }
  const inesperados: { conexion: string; error: unknown }[] = []
  for (const pendiente of pendientes) {
    try {
      const nuevo = await p.renovar(pendiente.renovacion)
      await p.guardar({
        conexion: pendiente.conexion,
        token: nuevo.token,
        expiraEn: new Date(ahora + nuevo.expiraEnSegundos * 1000).toISOString(),
        renovacion: nuevo.refreshToken,
        // LinkedIn fixes the refresh token's life at the first grant; it only says so again sometimes.
        renovacionExpiraEn:
          nuevo.refreshTokenExpiraEnSegundos === null
            ? pendiente.renovacionExpiraEn
            : new Date(ahora + nuevo.refreshTokenExpiraEnSegundos * 1000).toISOString(),
      })
      total.renovadas++
    } catch (error) {
      if (error instanceof RechazoDeLinkedin) {
        console.error(
          `LinkedIn no renovó la conexión ${pendiente.conexion} (HTTP ${error.http}): queda para la vigilancia.`,
        )
        total.rechazadas++
        try {
          await p.olvidar(pendiente.conexion)
        } catch (errorAlOlvidar) {
          console.error(`No pude olvidar la renovación rechazada de ${pendiente.conexion}.`)
          inesperados.push({ conexion: pendiente.conexion, error: errorAlOlvidar })
        }
        continue
      }
      console.error(`No pude renovar la conexión ${pendiente.conexion}.`)
      inesperados.push({ conexion: pendiente.conexion, error })
    }
  }
  if (inesperados.length > 0) {
    throw new AggregateError(
      inesperados.map((i) => i.error),
      `No pude renovar las conexiones ${inesperados.map((i) => i.conexion).join(", ")}.`,
    )
  }
  return total
}

export function puertosDeRenovacion(db: Db, app: { clientId: string; clientSecret: string }): PuertosDeRenovacion {
  return {
    async pendientes(hasta) {
      const { data, error } = await db.rpc("renovaciones_pendientes", { p_hasta: hasta })
      if (error) throw new Error(`No pude leer las conexiones por renovar (${error.code ?? "sin código"}).`)
      return data.map((fila) => ({
        conexion: fila.conexion,
        renovacion: fila.renovacion,
        expiraEn: fila.expira_en,
        renovacionExpiraEn: fila.renovacion_expira_en,
      }))
    },
    renovar: (refreshToken) => renovarToken({ ...app, refreshToken }),
    async guardar(r) {
      const { error } = await db.rpc("guardar_renovacion", {
        p_conexion: r.conexion,
        p_token: r.token,
        p_expira_en: r.expiraEn,
        p_renovacion: r.renovacion,
        p_renovacion_expira_en: r.renovacionExpiraEn,
      })
      // The database's message is not repeated: a failed write could quote the value it refused.
      if (error) throw new Error(`No pude guardar la conexión renovada ${r.conexion} (${error.code ?? "sin código"}).`)
    },
    async olvidar(conexion) {
      const { error } = await db.rpc("olvidar_renovacion", { p_conexion: conexion })
      if (error) throw new Error(`No pude olvidar la renovación de ${conexion} (${error.code ?? "sin código"}).`)
    },
  }
}
