import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
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
import { cuentasParaIdeas, ideasPorRevisar, series } from "@/lib/series/lectura"
import type { Db } from "@/lib/supabase/database"
import { admin, cuentaDe, literal, marcaConDueno, personaConSesion, piezaDe, vectorDe } from "./entorno"

type Persona = { db: Db; userId: string }
let dueno: Persona
let ajeno: Persona
let perfil: string
let pagina: string
let ejeSiguiente = 300
const investigacionesCreadas: string[] = []

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

  test("a stranger reads nothing", async () => {
    const extrano = await personaConSesion("acc-series-extrano")
    expect(await series(extrano.db)).toEqual([])
    expect(await ideasPorRevisar(extrano.db)).toBe(0)
  })
})
