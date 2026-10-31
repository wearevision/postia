import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { informesPorAprobar } from "@/lib/investigacion/lectura"
import { proponerFecha } from "@/lib/piezas/horarios"
import { horariosOcupados } from "@/lib/piezas/lectura"
import {
  aprobarIdea,
  aprobarSerie,
  descartarIdea,
  editarIdea,
  moverAsignacion,
  pedirOtraIdea,
  pedirSerie,
} from "@/lib/series/acciones"
import { cuentasParaIdeas, ideasPorRevisar, ideasYSeries, series } from "@/lib/series/lectura"
import type { Db } from "@/lib/supabase/database"
import { admin, cuentaDe, literal, marcaConDueno, personaConSesion, piezaDe, vectorDe } from "./entorno"

type Persona = { db: Db; userId: string }
let dueno: Persona
let ajeno: Persona
let perfil: string
let pagina: string
let ejeSiguiente = 300
const investigacionesCreadas: string[] = []
const sueltasCreadas: string[] = []

/** An approved report inserted as 4e leaves it, with two findings of its own. */
async function informeAprobado(tema = `Tema ${randomUUID().slice(0, 8)}`) {
  const { data: inv, error } = await admin()
    .from("investigaciones")
    .insert({ origen: "encargo", tema, cantidad: 4, formato: "texto", pedida_por: dueno.userId, estado: "aprobada" })
    .select("id")
    .single()
  if (error) throw error
  investigacionesCreadas.push(inv.id)
  const hallazgos: string[] = []
  for (const medio of ["La Tercera", "Emol"]) {
    const enlace = `https://medio.cl/${randomUUID()}`
    const { data, error: errorDeHallazgo } = await admin()
      .from("hallazgos")
      .insert({
        resumen: `Hallazgo de ${medio}`,
        enlace,
        enlace_normalizado: enlace.replace(/^https:\/\//, ""),
        medio,
        publicado_en: "2026-10-20",
        vector: literal(vectorDe(ejeSiguiente++)),
        investigacion_id: inv.id,
        angulo: "Mitos",
      })
      .select("id")
      .single()
    if (errorDeHallazgo) throw errorDeHallazgo
    hallazgos.push(data.id)
  }
  return { id: inv.id, tema, hallazgos }
}

async function serieDe(
  informe: { id: string; hallazgos: string[] },
  ideas: { gancho: string; cuenta: string; formato?: "texto" | "carrusel_pdf" }[],
): Promise<string[]> {
  const { data, error } = await admin().rpc("guardar_serie", {
    p_investigacion: informe.id,
    p_ideas: ideas.map((i) => ({
      gancho: i.gancho,
      resumen: `Resumen de ${i.gancho}`,
      formato: i.formato ?? "texto",
      esqueleto:
        i.formato === "carrusel_pdf"
          ? [
              { tipo: "portada", idea: "El mito" },
              { tipo: "punto", idea: "Los datos" },
              { tipo: "cierre", idea: "Qué hacer" },
            ]
          : [{ idea: "El mito" }, { idea: "Los datos" }],
      fuentes: informe.hallazgos,
      cuenta: i.cuenta,
      razon: "Porque habla de investigación.",
      pilar: null,
      vector: literal(vectorDe(ejeSiguiente++)),
    })),
  })
  if (error) throw error
  return data as string[]
}

/** A finding of the map with no report, as the Saturday watch leaves it. */
async function hallazgoSuelto(medio: string, resumen = `Hallazgo de ${medio}`) {
  const enlace = `https://medio.cl/${randomUUID()}`
  const { data, error } = await admin()
    .from("hallazgos")
    .insert({
      resumen,
      enlace,
      enlace_normalizado: enlace.replace(/^https:\/\//, ""),
      medio,
      publicado_en: "2026-10-22",
      vector: literal(vectorDe(ejeSiguiente++)),
    })
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

async function sueltas(origen: "cruce" | "domingo", ideas: { gancho: string; fuentes: string[] }[]) {
  const { data, error } = await admin().rpc("guardar_ideas_sueltas", {
    p_origen: origen,
    p_ideas: ideas.map((i) => ({
      gancho: i.gancho,
      resumen: `Resumen de ${i.gancho}`,
      formato: "texto",
      esqueleto: [{ idea: "Lo que dice uno" }, { idea: "Lo que dice el otro" }],
      fuentes: i.fuentes,
      cuenta: perfil,
      razon: "Porque cruza dos mundos.",
      pilar: null,
      vector: literal(vectorDe(ejeSiguiente++)),
    })),
  })
  if (error) throw error
  const ids = data as string[]
  sueltasCreadas.push(...ids)
  return ids
}

async function asignacionesDe(ideaId: string) {
  const { data, error } = await admin()
    .from("asignaciones")
    .select("id, cuenta_id, planeada_para, estado")
    .eq("idea_id", ideaId)
    .order("planeada_para")
  if (error) throw error
  return data
}

const estadoDe = async (ideaId: string) =>
  (await admin().from("ideas").select("estado").eq("id", ideaId).single()).data?.estado

beforeAll(async () => {
  dueno = await personaConSesion("acc-series-dueno")
  ajeno = await personaConSesion("acc-series-ajeno")
  perfil = await cuentaDe(await marcaConDueno(dueno.userId, "yo"))
  pagina = await cuentaDe(await marcaConDueno(dueno.userId, "nosotros"), "empresa", "a_mano")
  await marcaConDueno(ajeno.userId)
})

afterAll(async () => {
  // Proposals and open assignments are counted and leased globally: leave none behind.
  await admin().from("ideas").update({ estado: "descartada" }).eq("estado", "propuesta").in("id", sueltasCreadas)
  await admin()
    .from("trabajos_de_investigacion")
    .update({ estado: "fallo", motivo: "Cerrado entre pruebas." })
    .in("idea_id", sueltasCreadas)
    .in("estado", ["pendiente", "trabajando"])
  await admin()
    .from("ideas")
    .update({ estado: "descartada" })
    .eq("estado", "propuesta")
    .in("investigacion_id", investigacionesCreadas)
  await admin()
    .from("asignaciones")
    .update({ estado: "descartada" })
    .in("cuenta_id", [perfil, pagina])
    .in("estado", ["por_escribir", "escribiendo"])
  await admin()
    .from("trabajos_de_investigacion")
    .update({ estado: "fallo", motivo: "Cerrado entre pruebas." })
    .in("investigacion_id", investigacionesCreadas)
    .in("estado", ["pendiente", "trabajando"])
})

describe("aprobarIdea", () => {
  test("plans the suggested account on its next free slot, after what the account already holds", async () => {
    const informe = await informeAprobado()
    const [idea] = await serieDe(informe, [{ gancho: "Uno", cuenta: perfil }])
    const ahora = Date.now()
    const esperada = proponerFecha("persona", await horariosOcupados(dueno.db, perfil, ahora), ahora)

    const r = await aprobarIdea(dueno.db, { ideaId: idea, cuentas: [perfil] }, ahora)

    expect(r).toEqual({ ok: true })
    expect(await estadoDe(idea)).toBe("aprobada")
    const [a] = await asignacionesDe(idea)
    expect(a).toMatchObject({ cuenta_id: perfil, estado: "por_escribir" })
    expect(Date.parse(a?.planeada_para ?? "")).toBe(esperada.getTime())
  })

  test("one idea for two accounts is one assignment per account, each on its own slot hour", async () => {
    const informe = await informeAprobado()
    const [idea] = await serieDe(informe, [{ gancho: "Dos cuentas", cuenta: perfil }])
    expect(await aprobarIdea(dueno.db, { ideaId: idea, cuentas: [perfil, pagina] })).toEqual({ ok: true })
    const asignaciones = await asignacionesDe(idea)
    expect(asignaciones.map((a) => a.cuenta_id).sort()).toEqual([perfil, pagina].sort())
  })

  test("retries once with fresh slots when the proposed one was taken meanwhile", async () => {
    const informe = await informeAprobado()
    const [idea, otra] = await serieDe(informe, [
      { gancho: "Carrera", cuenta: perfil },
      { gancho: "La que gana", cuenta: perfil },
    ])
    let robadas = 0
    // Between reading the free slots and approving, another idea takes the proposed slot.
    const conCarrera = new Proxy(dueno.db, {
      get(objetivo, clave, receptor) {
        if (clave !== "rpc") return Reflect.get(objetivo, clave, receptor)
        return async (nombre: string, args: { p_asignaciones?: { planeada_para: string }[] }) => {
          if (nombre === "aprobar_idea" && robadas === 0 && args.p_asignaciones?.[0]) {
            robadas++
            const { error } = await admin().from("asignaciones").insert({
              idea_id: otra,
              cuenta_id: perfil,
              formato: "texto",
              planeada_para: args.p_asignaciones[0].planeada_para,
            })
            if (error) throw error
          }
          return objetivo.rpc(nombre as "aprobar_idea", args as never)
        }
      },
    })

    expect(await aprobarIdea(conCarrera, { ideaId: idea, cuentas: [perfil] })).toEqual({ ok: true })
    expect(robadas).toBe(1)
    const [robada] = await asignacionesDe(otra)
    const [mia] = await asignacionesDe(idea)
    expect(Date.parse(mia?.planeada_para ?? "")).toBeGreaterThan(Date.parse(robada?.planeada_para ?? ""))
  })

  test("refuses no account, and a person who owns none of the brands", async () => {
    const informe = await informeAprobado()
    const [idea] = await serieDe(informe, [{ gancho: "Sin dueño", cuenta: perfil }])
    expect(await aprobarIdea(dueno.db, { ideaId: idea, cuentas: [] })).toEqual({
      ok: false,
      error: "Elige al menos una cuenta.",
    })
    expect(await aprobarIdea(ajeno.db, { ideaId: idea, cuentas: [perfil] })).toEqual({
      ok: false,
      error: "Solo el dueño de la marca de esa cuenta puede aprobar esta idea.",
    })
    expect(await estadoDe(idea)).toBe("propuesta")
  })

  test("an idea already approved says so", async () => {
    const informe = await informeAprobado()
    const [idea] = await serieDe(informe, [{ gancho: "Dos veces", cuenta: perfil }])
    await aprobarIdea(dueno.db, { ideaId: idea, cuentas: [perfil] })
    expect(await aprobarIdea(dueno.db, { ideaId: idea, cuentas: [perfil] })).toEqual({
      ok: false,
      error: "Esta idea ya no espera tu revisión.",
    })
  })

  test("an idea whose replacement is being written says to wait for it", async () => {
    const informe = await informeAprobado()
    const [idea] = await serieDe(informe, [{ gancho: "Mientras tanto", cuenta: perfil }])
    expect(await pedirOtraIdea(dueno.db, idea)).toEqual({ ok: true })
    expect(await aprobarIdea(dueno.db, { ideaId: idea, cuentas: [perfil] })).toEqual({
      ok: false,
      error: "Se está escribiendo otra versión de esta idea. Espera a que termine.",
    })
    const { error } = await admin()
      .from("trabajos_de_investigacion")
      .update({ estado: "fallo", motivo: "Cerrado en la prueba." })
      .eq("idea_id", idea)
    if (error) throw error
  })
})

describe("aprobarSerie", () => {
  test("approves every proposal in order with its suggested account and spreads the dates", async () => {
    const informe = await informeAprobado()
    const [a, b, c] = await serieDe(informe, [
      { gancho: "Primera", cuenta: perfil },
      { gancho: "Segunda", cuenta: pagina },
      { gancho: "Tercera", cuenta: perfil },
    ])
    await descartarIdea(dueno.db, b)

    expect(await aprobarSerie(dueno.db, informe.id)).toEqual({ ok: true, aprobadas: 2 })

    expect(await estadoDe(b)).toBe("descartada")
    const [primera] = await asignacionesDe(a)
    const [tercera] = await asignacionesDe(c)
    expect(primera?.cuenta_id).toBe(perfil)
    expect(Date.parse(tercera?.planeada_para ?? "")).toBeGreaterThan(Date.parse(primera?.planeada_para ?? ""))
  })

  test("skips an idea approved on its own while the series was being approved and keeps going", async () => {
    const informe = await informeAprobado()
    const [a, b, c] = await serieDe(informe, [
      { gancho: "Primera", cuenta: perfil },
      { gancho: "Segunda", cuenta: pagina },
      { gancho: "Tercera", cuenta: perfil },
    ])
    let aprobadaAparte = false
    const conCarrera = new Proxy(dueno.db, {
      get(db, propiedad, receptor) {
        if (propiedad !== "rpc") return Reflect.get(db, propiedad, receptor)
        return async (...args: Parameters<Db["rpc"]>) => {
          if (!aprobadaAparte) {
            aprobadaAparte = true
            await aprobarIdea(dueno.db, { ideaId: b, cuentas: [pagina] })
          }
          return db.rpc(...args)
        }
      },
    })

    expect(await aprobarSerie(conCarrera, informe.id)).toEqual({ ok: true, aprobadas: 2 })

    expect(await estadoDe(a)).toBe("aprobada")
    expect(await estadoDe(b)).toBe("aprobada")
    expect(await estadoDe(c)).toBe("aprobada")
    expect(await asignacionesDe(b)).toHaveLength(1)
  })

  test("a series with nothing to approve says so", async () => {
    const informe = await informeAprobado()
    expect(await aprobarSerie(dueno.db, informe.id)).toEqual({
      ok: false,
      error: "Esta serie no tiene propuestas por aprobar.",
    })
  })
})

describe("the other actions", () => {
  test("descartarIdea discards a proposal, and an approved idea with its unwritten slots", async () => {
    const informe = await informeAprobado()
    const [idea] = await serieDe(informe, [{ gancho: "Se va", cuenta: perfil }])
    await aprobarIdea(dueno.db, { ideaId: idea, cuentas: [perfil] })
    expect(await descartarIdea(dueno.db, idea)).toEqual({ ok: true })
    expect((await asignacionesDe(idea)).map((a) => a.estado)).toEqual(["descartada"])
    expect(await descartarIdea(dueno.db, idea)).toEqual({ ok: false, error: "Esta idea ya no se puede descartar." })
  })

  test("editarIdea saves the hook and the skeleton read from its lines", async () => {
    const informe = await informeAprobado()
    const [idea] = await serieDe(informe, [{ gancho: "Antes", cuenta: perfil, formato: "carrusel_pdf" }])
    expect(
      await editarIdea(dueno.db, {
        ideaId: idea,
        gancho: "  Después  ",
        esqueleto: "Portada: Nueva\nCifra: 3 de 4\nCierre: Fin",
      }),
    ).toEqual({ ok: true })
    const { data } = await admin().from("ideas").select("gancho, esqueleto").eq("id", idea).single()
    expect(data).toEqual({
      gancho: "Después",
      esqueleto: [
        { tipo: "portada", idea: "Nueva" },
        { tipo: "cifra", idea: "3 de 4" },
        { tipo: "cierre", idea: "Fin" },
      ],
    })
    expect(
      await editarIdea(dueno.db, { ideaId: idea, gancho: "X", esqueleto: "Idea: sin portada\nIdea: b\nCierre: c" }),
    ).toEqual({
      ok: false,
      error: "El carrusel empieza con la Portada y termina con el Cierre.",
    })
    expect(await editarIdea(dueno.db, { ideaId: idea, gancho: " ", esqueleto: "x" })).toEqual({
      ok: false,
      error: "Escribe el gancho.",
    })
  })

  test("pedirOtraIdea queues one replacement job and refuses a second while it runs", async () => {
    const informe = await informeAprobado()
    const [idea] = await serieDe(informe, [{ gancho: "Cámbiala", cuenta: perfil }])
    expect(await pedirOtraIdea(dueno.db, idea)).toEqual({ ok: true })
    expect(await pedirOtraIdea(dueno.db, idea)).toEqual({ ok: false, error: "Ya se está buscando otra idea." })
    const { data } = await admin().from("trabajos_de_investigacion").select("tipo, estado").eq("idea_id", idea)
    expect(data).toEqual([{ tipo: "otra_idea", estado: "pendiente" }])
  })

  test("moverAsignacion moves an unwritten slot and refuses a taken one or a weekend", async () => {
    const informe = await informeAprobado()
    const [idea] = await serieDe(informe, [{ gancho: "Se mueve", cuenta: perfil }])
    await aprobarIdea(dueno.db, { ideaId: idea, cuentas: [perfil] })
    const [a] = await asignacionesDe(idea)
    if (!a) throw new Error("se esperaba una asignación")
    const ocupada = await piezaDe(dueno.db, perfil, "Ocupa un horario")
    const ahora = Date.now()
    const libre = proponerFecha("persona", await horariosOcupados(dueno.db, perfil, ahora), ahora + 14 * 86_400_000)
    const plan = await dueno.db.rpc("planear_pieza", { p_pieza: ocupada, p_fecha: libre.toISOString() })
    if (plan.error) throw plan.error

    expect(await moverAsignacion(dueno.db, { asignacionId: a.id, planeadaPara: libre.toISOString() })).toEqual({
      ok: false,
      error: "Esa cuenta ya tiene algo en ese horario. Elige otro.",
    })
    const sabado = new Date(libre.getTime() + ((6 - libre.getUTCDay() + 7) % 7) * 86_400_000)
    expect(await moverAsignacion(dueno.db, { asignacionId: a.id, planeadaPara: sabado.toISOString() })).toEqual({
      ok: false,
      error: "Elige un día hábil que no haya pasado.",
    })
    const otra = new Date(libre.getTime() + 7 * 86_400_000).toISOString()
    expect(await moverAsignacion(dueno.db, { asignacionId: a.id, planeadaPara: otra })).toEqual({ ok: true })
    expect(Date.parse((await asignacionesDe(idea))[0]?.planeada_para ?? "")).toBe(Date.parse(otra))
  })

  test("pedirSerie queues a series for an approved report without one, and only once", async () => {
    const informe = await informeAprobado()
    expect(await pedirSerie(dueno.db, informe.id)).toEqual({ ok: true })
    expect(await pedirSerie(dueno.db, informe.id)).toEqual({
      ok: false,
      error: "Este informe ya tiene su serie o se está armando.",
    })
    expect(await pedirSerie(dueno.db, "no-es-un-id")).toEqual({ ok: false, error: "Revisa el informe." })
  })
})

describe("readers", () => {
  test("series returns the report's theme and its ideas in order, with sources, account, reason and slots", async () => {
    const informe = await informeAprobado("Focus groups en Chile")
    const [uno, dos] = await serieDe(informe, [
      { gancho: "Uno", cuenta: perfil, formato: "carrusel_pdf" },
      { gancho: "Dos", cuenta: pagina },
    ])
    await aprobarIdea(dueno.db, { ideaId: uno, cuentas: [perfil] })
    await pedirOtraIdea(dueno.db, dos)

    const [serie] = await series(dueno.db, { investigacionId: informe.id })

    expect(serie).toMatchObject({
      investigacionId: informe.id,
      tema: "Focus groups en Chile",
      cantidad: 4,
      trabajando: true,
      fallo: null,
    })
    expect(serie?.ideas.map((i) => [i.gancho, i.estado])).toEqual([
      ["Uno", "aprobada"],
      ["Dos", "propuesta"],
    ])
    const [primera, segunda] = serie?.ideas ?? []
    expect(primera).toMatchObject({
      id: uno,
      formato: "carrusel_pdf",
      resumen: "Resumen de Uno",
      razon: "Porque habla de investigación.",
      cuentaSugerida: { id: perfil },
      esqueleto: [
        { tipo: "portada", idea: "El mito" },
        { tipo: "punto", idea: "Los datos" },
        { tipo: "cierre", idea: "Qué hacer" },
      ],
    })
    expect(primera?.fuentes.map((f) => f.medio).sort()).toEqual(["Emol", "La Tercera"])
    expect(primera?.fuentes[0]).toMatchObject({
      enlace: expect.stringMatching(/^https:\/\/medio\.cl\//),
      publicadoEn: "2026-10-20",
    })
    expect(primera?.asignaciones).toEqual([
      expect.objectContaining({ cuentaId: perfil, estado: "por_escribir", motivo: null, piezaId: null }),
    ])
    expect(segunda?.asignaciones).toEqual([])
    expect(segunda?.pidiendoOtra).toBe(true)
  })

  test("a replaced idea leaves the list; series are newest first", async () => {
    const vieja = await informeAprobado()
    await serieDe(vieja, [{ gancho: "Vieja", cuenta: perfil }])
    const nueva = await informeAprobado()
    const [reemplazada] = await serieDe(nueva, [{ gancho: "Reemplazada", cuenta: perfil }])
    await admin().from("ideas").update({ estado: "reemplazada" }).eq("id", reemplazada)
    await serieDe(nueva, [{ gancho: "Su reemplazo", cuenta: perfil }])

    const todas = await series(dueno.db)
    const posicion = (id: string) => todas.findIndex((s) => s.investigacionId === id)
    expect(posicion(nueva.id)).toBeLessThan(posicion(vieja.id))
    expect(todas[posicion(nueva.id)]?.ideas.map((i) => i.gancho)).toEqual(["Su reemplazo"])
  })

  test("ideasPorRevisar counts every proposal; cuentasParaIdeas lists the person's accounts", async () => {
    const antes = await ideasPorRevisar(dueno.db)
    const informe = await informeAprobado()
    await serieDe(informe, [
      { gancho: "A", cuenta: perfil },
      { gancho: "B", cuenta: pagina },
    ])
    expect(await ideasPorRevisar(dueno.db)).toBe(antes + 2)
    const cuentas = await cuentasParaIdeas(dueno.db)
    expect(cuentas.map((c) => c.id).sort()).toEqual([perfil, pagina].sort())
  })

  test("informesPorAprobar counts only the reports waiting for approval", async () => {
    const antes = await informesPorAprobar(dueno.db)
    await informeAprobado()
    expect(await informesPorAprobar(dueno.db)).toBe(antes)
    const { data, error } = await admin()
      .from("investigaciones")
      .insert({
        origen: "encargo",
        tema: `Por aprobar ${randomUUID().slice(0, 8)}`,
        cantidad: 4,
        formato: "texto",
        pedida_por: dueno.userId,
        estado: "informe_por_aprobar",
      })
      .select("id")
      .single()
    if (error) throw error
    investigacionesCreadas.push(data.id)
    expect(await informesPorAprobar(dueno.db)).toBe(antes + 1)
  })

  test("ideasYSeries returns crosses and Sunday ideas newest first, each with its sources' summary excerpt", async () => {
    const largo = `${"Las marcas chilenas miden mal la experiencia. ".repeat(8)}Fin.`
    const a = await hallazgoSuelto("La Tercera", largo)
    const b = await hallazgoSuelto("Emol")
    const [cruceViejo] = await sueltas("cruce", [{ gancho: "Cruce viejo", fuentes: [a, b] }])
    const [cruceNuevo] = await sueltas("cruce", [{ gancho: "Cruce nuevo", fuentes: [a, b] }])
    const [domingo] = await sueltas("domingo", [{ gancho: "Del domingo", fuentes: [b] }])
    await pedirOtraIdea(dueno.db, domingo)

    const { cruces, sueltas: delDomingo, series: lista } = await ideasYSeries(dueno.db)

    expect(cruces.length).toBeLessThanOrEqual(30)
    expect(delDomingo.length).toBeLessThanOrEqual(30)
    const ids = cruces.map((i) => i.id)
    expect(ids.indexOf(cruceNuevo)).toBeGreaterThanOrEqual(0)
    expect(ids.indexOf(cruceNuevo)).toBeLessThan(ids.indexOf(cruceViejo))
    expect(cruces.every((i) => i.origen === "cruce")).toBe(true)
    const cruce = cruces.find((i) => i.id === cruceNuevo)
    expect(cruce).toMatchObject({ gancho: "Cruce nuevo", estado: "propuesta", cuentaSugerida: { id: perfil } })
    expect(cruce?.fuentes.map((f) => f.medio).sort()).toEqual(["Emol", "La Tercera"])
    const tercera = cruce?.fuentes.find((f) => f.medio === "La Tercera")
    expect(tercera).toMatchObject({ id: a, publicadoEn: "2026-10-22", enlace: expect.stringMatching(/^https:/) })
    expect(tercera?.resumen.length).toBeLessThanOrEqual(200)
    expect(tercera?.resumen).toMatch(/^Las marcas chilenas miden mal la experiencia\..*…$/)
    expect(cruce?.fuentes.find((f) => f.medio === "Emol")?.resumen).toBe("Hallazgo de Emol")

    const suelta = delDomingo.find((i) => i.id === domingo)
    expect(suelta).toMatchObject({ origen: "domingo", pidiendoOtra: true, asignaciones: [] })
    expect(delDomingo.some((i) => i.origen !== "domingo")).toBe(false)
    expect(lista.flatMap((s) => s.ideas).some((i) => i.id === cruceNuevo)).toBe(false)
  })

  test("an approved loose idea carries its slots like a series idea, and a replaced one leaves", async () => {
    const a = await hallazgoSuelto("Emol")
    const b = await hallazgoSuelto("Biobío")
    const [aprobar, reemplazada] = await sueltas("cruce", [
      { gancho: "Se aprueba", fuentes: [a, b] },
      { gancho: "Se reemplaza", fuentes: [a, b] },
    ])
    expect(await aprobarIdea(dueno.db, { ideaId: aprobar, cuentas: [perfil] })).toEqual({ ok: true })
    await admin().from("ideas").update({ estado: "reemplazada" }).eq("id", reemplazada)

    const { cruces } = await ideasYSeries(dueno.db)
    const aprobada = cruces.find((i) => i.id === aprobar)
    expect(aprobada?.estado).toBe("aprobada")
    expect(aprobada?.asignaciones).toEqual([expect.objectContaining({ cuentaId: perfil, estado: "por_escribir" })])
    expect(cruces.some((i) => i.id === reemplazada)).toBe(false)
  })

  test("a state filter runs in the query: an older discarded cross still shows under «descartada»", async () => {
    const a = await hallazgoSuelto("Emol")
    const b = await hallazgoSuelto("Biobío")
    const [vieja] = await sueltas("cruce", [{ gancho: "Descartada hace rato", fuentes: [a, b] }])
    await admin().from("ideas").update({ estado: "descartada" }).eq("id", vieja)
    // Newer proposals push it out of the newest 30; afterAll sets them aside with the file's other loose ideas.
    await sueltas(
      "cruce",
      Array.from({ length: 30 }, (_, n) => ({ gancho: `Cruce nuevo ${n}`, fuentes: [a, b] })),
    )
    const todas = await ideasYSeries(dueno.db)
    expect(todas.cruces.some((i) => i.id === vieja)).toBe(false)
    const descartadas = await ideasYSeries(dueno.db, { estado: "descartada" })
    expect(descartadas.cruces.some((i) => i.id === vieja)).toBe(true)
    expect(descartadas.cruces.every((i) => i.estado === "descartada")).toBe(true)
    expect(descartadas.cruces.length).toBeLessThanOrEqual(30)
    const propuestas = await ideasYSeries(dueno.db, { estado: "propuesta" })
    expect(propuestas.cruces).toHaveLength(30)
    expect(propuestas.cruces.every((i) => i.estado === "propuesta")).toBe(true)
  })

  test("filtered to one series, ideasYSeries leaves the loose groups out", async () => {
    const informe = await informeAprobado()
    await serieDe(informe, [{ gancho: "Sola", cuenta: perfil }])
    const r = await ideasYSeries(dueno.db, { investigacionId: informe.id })
    expect(r.cruces).toEqual([])
    expect(r.sueltas).toEqual([])
    expect(r.series.map((s) => s.investigacionId)).toEqual([informe.id])
  })

  test("a stranger reads nothing", async () => {
    const extrano = await personaConSesion("acc-series-extrano")
    expect(await series(extrano.db)).toEqual([])
    expect(await ideasYSeries(extrano.db)).toEqual({ cruces: [], sueltas: [], series: [] })
    expect(await ideasPorRevisar(extrano.db)).toBe(0)
  })
})
