import { z } from "zod"
import { leerExcepciones } from "@/lib/clientes/lectura"
import { Falla } from "@/lib/dominio/falla"
import { aLiteral } from "@/lib/mapa/vectores"
import { diaEnSantiago } from "@/lib/piezas/calendario"
import { proponerFecha } from "@/lib/piezas/horarios"
import { horariosOcupados, leerTipo } from "@/lib/piezas/lectura"
import { TIPOS_DE_LAMINA } from "@/lib/plantillas/laminas"
import { nombresVetados } from "@/lib/redaccion/instrucciones"
import { contextoDeRedaccion, repositorioDeRedaccion } from "@/lib/redaccion/repositorio"
import type { Db } from "@/lib/supabase/database"
import { lineaDeMarca } from "@/lib/voz/lectura"
import type { PuertosDeSerie } from "./armar"
import type { AsignacionAEscribir, PuertosDeEscritura } from "./escribir"
import { PREVIAS_EN_EL_MENSAJE } from "./instrucciones"
import type { CuentaDeSerie, PasoDeEsqueleto } from "./propuestas"

// Service role only (Trigger.dev): it reads every brand's line and accounts, and writes the ideas.

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

const Angulos = z.array(z.object({ nombre: z.string(), por_que: z.string().catch("") }))
const Formato = z.enum(["texto", "carrusel_pdf"])
/** A report asked for before 4f could miss its count; the plano's default series is five ideas. */
const CANTIDAD_POR_DEFECTO = 5

export function repositorioDeSeries(db: Db): Omit<PuertosDeSerie, "pedir" | "embeberIdeas"> {
  return {
    async informeDeSerie(investigacionId) {
      const [investigacion, hallazgos] = await Promise.all([
        db.from("investigaciones").select("tema, cantidad, angulos").eq("id", investigacionId).single(),
        db
          .from("hallazgos")
          .select("id, angulo, resumen, medio, publicado_en, enlace")
          .eq("investigacion_id", investigacionId)
          .order("creado_en")
          .order("id"),
      ])
      if (investigacion.error) fallo("No pude leer el informe de la serie", investigacion.error)
      if (hallazgos.error) fallo("No pude leer los hallazgos del informe", hallazgos.error)
      return {
        tema: investigacion.data.tema,
        cantidad: investigacion.data.cantidad ?? CANTIDAD_POR_DEFECTO,
        angulos: Angulos.parse(investigacion.data.angulos),
        hallazgos: hallazgos.data.map((h) => ({ ...h, angulo: h.angulo ?? "" })),
      }
    },

    async cuentasDeSerie() {
      const { data: cuentas, error } = await db
        .from("cuentas")
        .select("id, nombre, tipo, marca_id")
        .gt("ritmo_semanal", 0)
        .order("creada_en")
        .order("id")
      if (error) fallo("No pude leer las cuentas de la serie", error)
      const marcas = [...new Set(cuentas.map((c) => c.marca_id))]
      const [lineas, pilares] = await Promise.all([
        Promise.all(marcas.map((m) => lineaDeMarca(db, m))),
        db
          .from("pilares")
          .select("id, marca_id, nombre, de_que_habla")
          .eq("activo", true)
          .in("marca_id", marcas)
          .order("orden"),
      ])
      if (pilares.error) fallo("No pude leer los pilares de la serie", pilares.error)
      return cuentas.flatMap((c): CuentaDeSerie[] => {
        const linea = lineas.find((l) => l?.marca.id === c.marca_id)
        if (!linea) return []
        return [
          {
            id: c.id,
            nombre: c.nombre,
            tipo: leerTipo(c.tipo),
            marca: linea.marca,
            pilares: pilares.data
              .filter((p) => p.marca_id === c.marca_id)
              .map((p) => ({ id: p.id, nombre: p.nombre, deQueHabla: p.de_que_habla })),
            temasVetados: linea.actual?.secciones.temasVetados ?? "",
          },
        ]
      })
    },

    async noNombrar() {
      return nombresVetados(await leerExcepciones(db), diaEnSantiago(Date.now()))
    },

    async ideasPrevias() {
      const { data, error } = await db
        .from("ideas")
        .select("gancho")
        .order("creada_en", { ascending: false })
        .limit(PREVIAS_EN_EL_MENSAJE)
      if (error) fallo("No pude leer las ideas anteriores", error)
      return data.map((i) => i.gancho)
    },

    async ideasParecidas(vector, umbral) {
      const { data, error } = await db.rpc("ideas_parecidas", {
        p_vector: aLiteral(vector),
        p_umbral: umbral,
        p_excepto: [],
      })
      if (error) fallo("No pude buscar ideas parecidas", error)
      return data.map((i) => i.id)
    },

    async ideaAReemplazar(ideaId) {
      const { data: idea, error } = await db
        .from("ideas")
        .select("gancho, resumen, formato, investigacion_id")
        .eq("id", ideaId)
        .single()
      if (error) fallo("No pude leer la idea a reemplazar", error)
      const { data: hermanas, error: errorDeHermanas } = await db
        .from("ideas")
        .select("gancho")
        .eq("investigacion_id", idea.investigacion_id ?? "")
        .in("estado", ["propuesta", "aprobada"])
        .neq("id", ideaId)
        .order("orden")
      if (errorDeHermanas) fallo("No pude leer las otras ideas de la serie", errorDeHermanas)
      return {
        gancho: idea.gancho,
        resumen: idea.resumen,
        formato: Formato.parse(idea.formato),
        hermanas: hermanas.map((h) => h.gancho),
      }
    },

    async guardarSerie(investigacionId, ideas) {
      const { data, error } = await db.rpc("guardar_serie", {
        p_investigacion: investigacionId,
        p_ideas: ideas.map((i) => ({
          gancho: i.gancho,
          resumen: i.resumen,
          formato: i.formato,
          esqueleto: i.esqueleto,
          fuentes: i.fuentes,
          cuenta: i.cuenta,
          razon: i.razon,
          pilar: i.pilar,
          vector: aLiteral(i.vector),
          ...(i.reemplazaA ? { reemplaza_a: i.reemplazaA } : {}),
        })),
      })
      if (error) fallo("No pude guardar la serie", error)
      return data
    },
  }
}

// Writing ---------------------------------------------------------------------------------------------------------

const Esqueleto = z.array(z.object({ tipo: z.string().optional(), idea: z.string() }))
const Creada = z.object({ pieza: z.uuid(), version: z.uuid() })
// Only a late piece moves to a slot proposed here, and two runs never write at once: one retry per clash is plenty.
const INTENTOS_DE_PLAN = 3
const DOS_HORAS_MENOS_EL_MARGEN_MS = 90 * 60_000

function pasoDe(p: z.infer<typeof Esqueleto>[number]): PasoDeEsqueleto {
  const tipo = TIPOS_DE_LAMINA.find((t) => t === p.tipo)
  return tipo ? { tipo, idea: p.idea } : { idea: p.idea }
}

const unicos = (valores: string[]) => [...new Set(valores)]

export function repositorioDeEscritura(db: Db): Omit<PuertosDeEscritura, "pedir"> {
  return {
    async tomarAsignaciones(hasta, limite) {
      const { data, error } = await db.rpc("tomar_asignaciones", {
        p_hasta: new Date(hasta).toISOString(),
        p_limite: limite,
      })
      if (error) fallo("No pude tomar las asignaciones", error)
      if (data.length === 0) return []
      const [ideas, cuentas] = await Promise.all([
        db
          .from("ideas")
          .select("id, gancho, resumen, esqueleto, fuentes, pilar_id")
          .in("id", unicos(data.map((a) => a.idea_id))),
        db
          .from("cuentas")
          .select("id, marca_id")
          .in("id", unicos(data.map((a) => a.cuenta_id))),
      ])
      if (ideas.error) fallo("No pude leer las ideas de las asignaciones", ideas.error)
      if (cuentas.error) fallo("No pude leer las cuentas de las asignaciones", cuentas.error)
      const [hallazgos, pilares] = await Promise.all([
        db
          .from("hallazgos")
          .select("id, angulo, resumen, medio, publicado_en, enlace")
          .in("id", unicos(ideas.data.flatMap((i) => i.fuentes))),
        db
          .from("pilares")
          .select("id, nombre, marca_id, activo")
          .in("id", unicos(ideas.data.flatMap((i) => (i.pilar_id ? [i.pilar_id] : [])))),
      ])
      if (hallazgos.error) fallo("No pude leer los hallazgos de las asignaciones", hallazgos.error)
      if (pilares.error) fallo("No pude leer los pilares de las asignaciones", pilares.error)
      return data.map((a): AsignacionAEscribir => {
        const idea = ideas.data.find((i) => i.id === a.idea_id)
        if (!idea) throw new Error(`La asignación ${a.id} no tiene idea`)
        const marca = cuentas.data.find((c) => c.id === a.cuenta_id)?.marca_id
        // An idea confirmed for another brand's account carries no pillar there (pilar_de_idea_en_cuenta).
        const pilar = pilares.data.find((p) => p.id === idea.pilar_id && p.activo && p.marca_id === marca)
        return {
          id: a.id,
          cuentaId: a.cuenta_id,
          formato: Formato.parse(a.formato),
          planeadaPara: Date.parse(a.planeada_para),
          idea: {
            gancho: idea.gancho,
            resumen: idea.resumen,
            esqueleto: Esqueleto.parse(idea.esqueleto).map(pasoDe),
            pilar: pilar?.nombre ?? null,
          },
          hallazgos: idea.fuentes.flatMap((f) => {
            const h = hallazgos.data.find((x) => x.id === f)
            return h ? [{ ...h, angulo: h.angulo ?? "" }] : []
          }),
        }
      })
    },

    async contextoDeCuenta(cuentaId) {
      const { data, error } = await db.from("cuentas").select("nombre, tipo, marca_id").eq("id", cuentaId).single()
      if (error) fallo("No pude leer la cuenta de la asignación", error)
      const c = await contextoDeRedaccion(db, data.marca_id, data)
      if (!c) throw new Falla("La marca de esta cuenta no tiene línea editorial. Guárdala y escribe la pieza a mano.")
      return c
    },

    horariosDeCuenta: (cuentaId, desde) => horariosOcupados(db, cuentaId, desde),

    async crearPiezaDeAsignacion(a, texto, lineaVersion, planeadaPara, tipo) {
      const intentadas: number[] = []
      let fecha = planeadaPara
      for (let intento = 1; ; intento++) {
        const { data, error } = await db.rpc("crear_pieza_de_asignacion", {
          p_asignacion: a.id,
          p_texto: texto,
          p_linea_version: lineaVersion,
          p_planeada_para: fecha.toISOString(),
        })
        if (!error) {
          const creada = Creada.parse(data)
          return { piezaId: creada.pieza, versionId: creada.version }
        }
        // A clash only happens on a late piece's proposed slot: the assignment's own slot is held for it.
        if (error.code !== "23505" || intento === INTENTOS_DE_PLAN)
          fallo("No pude crear la pieza de la asignación", error)
        intentadas.push(fecha.getTime())
        const ahora = Date.now()
        const ocupados = await horariosOcupados(db, a.cuentaId, ahora)
        fecha = proponerFecha(tipo, [...ocupados, ...intentadas], ahora + DOS_HORAS_MENOS_EL_MARGEN_MS)
      }
    },

    guardarRevision: repositorioDeRedaccion(db).guardarRevision,

    async pedirDisenoDeAsignacion(asignacionId, d) {
      const { data, error } = await db.rpc("pedir_diseno_de_asignacion", {
        p_asignacion: asignacionId,
        p_tema: d.tema,
        p_titulo: d.titulo,
        p_texto: d.texto,
        p_diseno: d.diseno,
        p_linea_version: d.lineaVersion,
        p_planeada_para: d.planeadaPara.toISOString(),
      })
      if (error) fallo("No pude pedir el diseño de la asignación", error)
      return data
    },

    async fallarAsignacion(asignacionId, motivo) {
      const { error } = await db.rpc("fallar_asignacion", { p_asignacion: asignacionId, p_motivo: motivo })
      if (error) fallo("No pude cerrar la asignación", error)
    },

    async anotarAsignacion(asignacionId, motivo) {
      const { error } = await db
        .from("asignaciones")
        .update({ motivo })
        .eq("id", asignacionId)
        .eq("estado", "escribiendo")
      if (error) fallo("No pude anotar el motivo de la asignación", error)
    },
  }
}
