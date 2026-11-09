import { randomUUID } from "node:crypto"
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest"
import type { Pedir } from "@/lib/ia/claude"
import { leerRendimiento } from "@/lib/rendimiento/aprendizajes"
import { repositorioDeLecturas } from "@/lib/rendimiento/repositorio-de-lecturas"
import type { Db } from "@/lib/supabase/database"
import { admin, cuentaDe, marcaConDueno, personaConSesion, piezaDe } from "./entorno"

const SECCIONES = {
  deQueHablamos: "Eventos",
  tono: "",
  formatos: "",
  temasVetados: "",
  temasAVigilar: "",
  ejemplos: "",
}

let dueno: { db: Db; userId: string }
let marca: string
let cuenta: string
let pilarId: string
let conPieza: { metrica: string; pieza: string }
let soloExtracto: string
let desdeApi: string

const repo = () => repositorioDeLecturas(admin())

async function cerrarLecturasAbiertas(): Promise<void> {
  const { error } = await admin()
    .from("lecturas_de_rendimiento")
    .update({ estado: "fallo", motivo: "Cerrado entre pruebas.", arrendado_hasta: null })
    .in("estado", ["pendiente", "trabajando"])
  if (error) throw error
}

async function metrica(campos: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin()
    .from("metricas_de_publicacion")
    .insert({
      cuenta_id: cuenta,
      post_urn: `urn:li:share:${Date.now()}${Math.floor(Math.random() * 1e6)}`,
      publicada_el: "2026-10-01",
      origen: "importacion",
      ...campos,
    })
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

beforeAll(async () => {
  dueno = await personaConSesion("repo-lecturas")
  marca = await marcaConDueno(dueno.userId, "nosotros")
  const guardada = await dueno.db.rpc("guardar_linea_editorial", {
    p_marca: marca,
    p_base: 0,
    p_secciones: SECCIONES,
    p_pilares: [{ nombre: "Oficio", deQueHabla: "Montaje", material: "", porSemana: 1 }],
  })
  if (guardada.error) throw guardada.error
  cuenta = await cuentaDe(marca, "empresa")
  const { data: pilares } = await admin().from("pilares").select("id").eq("marca_id", marca)
  pilarId = pilares?.[0]?.id ?? ""

  const pieza = await piezaDe(dueno.db, cuenta, "Primera versión")
  const nueva = await admin().from("versiones").select("*").eq("pieza_id", pieza).single()
  if (nueva.error) throw nueva.error
  const { id: _id, ...base } = nueva.data
  const segunda = await admin()
    .from("versiones")
    .insert({
      ...base,
      numero: 2,
      texto: "Segunda versión, la vigente",
      huella: randomUUID().replaceAll("-", "").repeat(2),
    })
  if (segunda.error) throw segunda.error
  const pilar = await admin().from("piezas").update({ pilar_id: pilarId }).eq("id", pieza)
  if (pilar.error) throw pilar.error
  conPieza = {
    pieza,
    metrica: await metrica({
      pieza_id: pieza,
      impresiones: 1000,
      interacciones: 50,
      clics: 4,
      extracto: "Extracto que no se usa",
    }),
  }
  soloExtracto = await metrica({ impresiones: 500, interacciones: 5, extracto: "Solo el extracto del export" })
  desdeApi = await metrica({ origen: "api", impresiones: 9999, interacciones: 99, extracto: "Cifra de la API" })
})

beforeEach(cerrarLecturasAbiertas)

describe("repositorioDeLecturas", () => {
  test("lists only imported figures, with the latest version text, format and pillar name", async () => {
    const publicaciones = await repo().publicacionesParaLeer(cuenta)
    expect(publicaciones.map((p) => p.id).sort()).toEqual([conPieza.metrica, soloExtracto].sort())
    expect(publicaciones.find((p) => p.id === desdeApi)).toBeUndefined()
    expect(publicaciones.find((p) => p.id === conPieza.metrica)).toEqual({
      id: conPieza.metrica,
      publicadaEl: "2026-10-01",
      texto: "Segunda versión, la vigente",
      formato: "texto",
      pilar: "Oficio",
      impresiones: 1000,
      interacciones: 50,
      clics: 4,
    })
  })

  test("falls back to the export's extract when the post has no piece", async () => {
    const publicaciones = await repo().publicacionesParaLeer(cuenta)
    expect(publicaciones.find((p) => p.id === soloExtracto)).toMatchObject({
      texto: "Solo el extracto del export",
      formato: null,
      pilar: null,
    })
  })

  test("builds the context from the brand: voice, account and the current line's pillar names", async () => {
    expect(await repo().contexto(cuenta)).toEqual({
      marcaId: marca,
      voz: "nosotros",
      cuenta: { nombre: expect.any(String), tipo: "empresa" },
      pilares: ["Oficio"],
    })
  })

  test("takes a queued reading, saves the learnings and closes it", async () => {
    const { data: id, error } = await dueno.db.rpc("pedir_lectura", { p_cuenta: cuenta })
    expect(error).toBeNull()
    const [lectura] = await repo().tomar()
    expect(lectura).toEqual({ id, cuentaId: cuenta })
    const guardados = await repo().guardar(lectura?.id ?? "", [
      { texto: "Abre con una cifra.", porque: "Rinden más.", respaldo: 1, publicaciones: [conPieza.metrica] },
    ])
    expect(guardados).toBe(1)
    await repo().terminar(lectura?.id ?? "", "lista", null)
    const { data: fila } = await admin()
      .from("lecturas_de_rendimiento")
      .select("estado, motivo")
      .eq("id", id as string)
      .single()
    expect(fila).toEqual({ estado: "lista", motivo: null })
    const { data: aprendizajes } = await admin()
      .from("aprendizajes")
      .select("texto, estado, publicaciones")
      .eq("lectura_id", id as string)
    expect(aprendizajes).toEqual([{ texto: "Abre con una cifra.", estado: "pista", publicaciones: [conPieza.metrica] }])
  })

  test("takes nothing when no reading is waiting", async () => {
    expect(await repo().tomar()).toEqual([])
  })

  test("the whole reading, end to end with a fake Claude, saves what it cites and never sends the API figures", async () => {
    const { data: id } = await dueno.db.rpc("pedir_lectura", { p_cuenta: cuenta })
    const otra = await metrica({ impresiones: 800, interacciones: 80, extracto: "Tercer post del export" })
    const pedir = vi.fn<Pedir>(async () => ({
      texto: JSON.stringify({
        aprendizajes: [
          {
            texto: "Escribe más sobre el oficio.",
            porque: "Lideran la tasa.",
            publicaciones: [conPieza.metrica, otra, "no-existe"],
          },
        ],
      }),
      detenido: "end_turn",
      bloques: [],
    }))
    const resultado = await leerRendimiento({ ...repo(), pedir })
    expect(resultado).toEqual({ leidas: 1, fallidas: 0 })
    const mensaje = JSON.stringify(pedir.mock.calls[0]?.[1].mensajes)
    expect(mensaje).not.toContain("Cifra de la API")
    expect(mensaje).not.toContain(desdeApi)
    const { data: aprendizajes } = await admin()
      .from("aprendizajes")
      .select("texto, respaldo")
      .eq("lectura_id", id as string)
    expect(aprendizajes).toEqual([{ texto: "Escribe más sobre el oficio.", respaldo: 2 }])
    await admin().from("metricas_de_publicacion").delete().eq("id", otra)
  })
})
