import type { Db } from "@/lib/supabase/database"
import { lineaDeMarca } from "@/lib/voz/lectura"
import type { PublicacionLeida, PuertosDeLectura } from "./aprendizajes"

// Service role only (Trigger.dev): it reads across brands.

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

const MAXIMO_DE_PUBLICACIONES = 100

export function repositorioDeLecturas(db: Db): Omit<PuertosDeLectura, "pedir"> {
  return {
    async tomar() {
      const { data, error } = await db.rpc("tomar_lecturas")
      if (error) fallo("No pude tomar las lecturas de rendimiento", error)
      return data.map((l) => ({ id: l.id, cuentaId: l.cuenta_id }))
    },

    async publicacionesParaLeer(cuentaId) {
      // Origin «importacion» only: figures read from LinkedIn's API never go to Claude (Developer AI Policy).
      const { data: metricas, error } = await db
        .from("metricas_de_publicacion")
        .select("id, pieza_id, publicada_el, impresiones, interacciones, clics, extracto")
        .eq("cuenta_id", cuentaId)
        .eq("origen", "importacion")
        .order("publicada_el", { ascending: false })
        .limit(MAXIMO_DE_PUBLICACIONES)
      if (error) fallo("No pude leer las cifras de las publicaciones", error)
      const piezaIds = metricas.flatMap((m) => (m.pieza_id ? [m.pieza_id] : []))
      const [piezas, versiones] =
        piezaIds.length === 0
          ? [
              { data: [], error: null },
              { data: [], error: null },
            ]
          : await Promise.all([
              db.from("piezas").select("id, formato, pilares(nombre)").in("id", piezaIds),
              db.from("versiones").select("pieza_id, texto, numero").in("pieza_id", piezaIds),
            ])
      if (piezas.error) fallo("No pude leer las piezas de las publicaciones", piezas.error)
      if (versiones.error) fallo("No pude leer los textos de las publicaciones", versiones.error)
      const ultimas = new Map<string, { texto: string; numero: number }>()
      for (const v of versiones.data) {
        const actual = ultimas.get(v.pieza_id)
        if (!actual || v.numero > actual.numero) ultimas.set(v.pieza_id, { texto: v.texto, numero: v.numero })
      }
      return metricas.map((m): PublicacionLeida => {
        const pieza = piezas.data.find((x) => x.id === m.pieza_id)
        return {
          id: m.id,
          publicadaEl: m.publicada_el,
          texto: (m.pieza_id ? ultimas.get(m.pieza_id)?.texto : undefined) ?? m.extracto,
          formato: pieza?.formato === "texto" || pieza?.formato === "carrusel_pdf" ? pieza.formato : null,
          pilar: pieza?.pilares?.nombre ?? null,
          impresiones: m.impresiones,
          interacciones: m.interacciones,
          clics: m.clics,
        }
      })
    },

    async contexto(cuentaId) {
      const { data, error } = await db.from("cuentas").select("nombre, tipo, marca_id").eq("id", cuentaId).single()
      if (error) fallo("No pude leer la cuenta de la lectura", error)
      const linea = await lineaDeMarca(db, data.marca_id)
      if (!linea) throw new Error(`La cuenta ${cuentaId} no tiene marca`)
      return {
        marcaId: linea.marca.id,
        voz: linea.marca.voz,
        cuenta: { nombre: data.nombre, tipo: data.tipo === "empresa" ? "empresa" : "persona" },
        pilares: linea.actual?.pilares.map((p) => p.nombre) ?? [],
      }
    },

    async guardar(lecturaId, items) {
      const { data, error } = await db.rpc("guardar_aprendizajes", {
        p_lectura: lecturaId,
        p_items: items.map((i) => ({
          texto: i.texto,
          porque: i.porque,
          respaldo: i.respaldo,
          publicaciones: i.publicaciones,
        })),
      })
      if (error) fallo("No pude guardar los aprendizajes", error)
      return data
    },

    async terminar(lecturaId, estado, motivo) {
      const { error } = await db.rpc("terminar_lectura", {
        p_id: lecturaId,
        p_estado: estado,
        p_motivo: motivo ?? undefined,
      })
      if (error) fallo("No pude cerrar la lectura de rendimiento", error)
    },
  }
}
