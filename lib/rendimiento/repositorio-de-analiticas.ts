import type { Db } from "@/lib/supabase/database"
import { ARRIENDO_S, type PuertosDeAnaliticas } from "./sincronizar"

// Service role only (Trigger.dev): it reads tokens from Vault and writes across brands.

const DIAS_DE_HISTORIA = 365
const MAXIMO_DE_POSTS = 200
const URN_DE_ORGANIZACION = /^urn:li:organization:[0-9]+$/

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

export function repositorioDeAnaliticas(db: Db): Omit<PuertosDeAnaliticas, "linkedin" | "ahora"> {
  return {
    async tomar() {
      const { data, error } = await db.rpc("tomar_lecturas_de_analiticas", { p_arriendo_segundos: ARRIENDO_S })
      if (error) fallo("No pude tomar las lecturas de analíticas", error)
      return data.map((l) => ({ id: l.id, cuentaId: l.cuenta_id }))
    },

    async terminar(id, estado, motivo) {
      const { error } = await db.rpc("terminar_lectura_de_analiticas", {
        p_id: id,
        p_estado: estado,
        p_motivo: motivo ?? undefined,
      })
      if (error) fallo("No pude cerrar la lectura de analíticas", error)
    },

    async tipoDeCuenta(cuentaId) {
      const { data, error } = await db.from("cuentas").select("tipo").eq("id", cuentaId).single()
      if (error) fallo("No pude leer la cuenta de la lectura", error)
      return data.tipo === "empresa" ? "empresa" : "persona"
    },

    async credencial(cuentaId, tipo) {
      if (tipo === "persona") {
        const { data, error } = await db.rpc("credencial_de_analiticas", { p_cuenta: cuentaId })
        if (error) fallo("No pude leer la conexión de analíticas", error)
        const fila = data[0]
        return fila ? { token: fila.token, expiraEn: fila.expira_en, organizacion: null } : null
      }
      // The page reads through its publishing connection: `autor` is the organization for a page.
      const { data, error } = await db.rpc("credencial_de_cuenta", { p_cuenta: cuentaId })
      if (error) fallo("No pude leer la conexión de la página", error)
      const fila = data[0]
      if (!fila) return null
      return {
        token: fila.token,
        expiraEn: fila.expira_en,
        organizacion: URN_DE_ORGANIZACION.test(fila.autor) ? fila.autor : null,
      }
    },

    async postsDePostia(cuentaId) {
      const desde = new Date(Date.now() - DIAS_DE_HISTORIA * 86_400_000).toISOString()
      const { data, error } = await db
        .from("publicaciones")
        .select("post_urn, enviado_en, piezas!inner(cuenta_id)")
        .eq("piezas.cuenta_id", cuentaId)
        .not("post_urn", "is", null)
        .gte("enviado_en", desde)
        .order("enviado_en", { ascending: false })
        .limit(MAXIMO_DE_POSTS)
      if (error) fallo("No pude leer las publicaciones de PostIA", error)
      return data.flatMap((p) => (p.post_urn ? [p.post_urn] : []))
    },

    async guardar(cuentaId, datos) {
      const { data, error } = await db.rpc("guardar_metricas_api", { p_cuenta: cuentaId, p_datos: datos })
      if (error) fallo("No pude guardar las cifras de LinkedIn", error)
      const { publicaciones, dias } = data as { publicaciones: number; dias: number }
      return { publicaciones, dias }
    },
  }
}

/** The daily schedule: one reading for every connected account with none open. Returns how many it queued. */
export async function programarLecturasDeAnaliticas(db: Db): Promise<number> {
  const { data, error } = await db.rpc("programar_lecturas_de_analiticas")
  if (error) fallo("No pude programar las lecturas de analíticas", error)
  return data
}
