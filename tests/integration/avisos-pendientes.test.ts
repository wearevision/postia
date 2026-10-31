import { describe, expect, test } from "vitest"
import { anotarAviso, avisosSinEnviar, borrarAvisosEnviados, marcarEnviados } from "@/lib/avisos/repositorio-de-avisos"
import { admin, marcaConDueno, personaConSesion } from "./entorno"

const AVISO = { titulo: "Página de WAV", cuerpo: "No firmaste «Hola» a tiempo; la corrí al martes.", url: "/piezas/x" }

describe("avisos_pendientes", () => {
  test("only the service role reads or writes the queue", async () => {
    const { db, userId } = await personaConSesion("cola")
    const marca = await marcaConDueno(userId)
    expect((await db.from("avisos_pendientes").select("id")).error?.code).toBe("42501")
    const { error } = await db.from("avisos_pendientes").insert({ marca_id: marca, ...AVISO })
    expect(error?.code).toBe("42501")
  })

  test("a line is queued, read once unsent, marked sent and deleted after 30 days", async () => {
    const { userId } = await personaConSesion("cola-ciclo")
    const marca = await marcaConDueno(userId)
    const db = admin()
    await anotarAviso(db, marca, AVISO)
    const mias = (await avisosSinEnviar(db)).filter((l) => l.marcaId === marca)
    expect(mias).toEqual([expect.objectContaining({ marcaId: marca, ...AVISO })])
    const ahora = Date.now()
    await marcarEnviados(
      db,
      mias.map((l) => l.id),
      ahora,
    )
    expect((await avisosSinEnviar(db)).filter((l) => l.marcaId === marca)).toEqual([])
    await borrarAvisosEnviados(db, ahora + 29 * 86_400_000)
    expect((await db.from("avisos_pendientes").select("id").eq("marca_id", marca)).data).toHaveLength(1)
    await borrarAvisosEnviados(db, ahora + 31 * 86_400_000)
    expect((await db.from("avisos_pendientes").select("id").eq("marca_id", marca)).data).toHaveLength(0)
  })

  test("marks hundreds of lines sent at once: no request carries every id", async () => {
    const { userId } = await personaConSesion("cola-masiva")
    const marca = await marcaConDueno(userId)
    const db = admin()
    const { data, error } = await db
      .from("avisos_pendientes")
      .insert(Array.from({ length: 400 }, () => ({ marca_id: marca, ...AVISO })))
      .select("id")
    if (error) throw error
    await marcarEnviados(
      db,
      data.map((l) => l.id),
      Date.now(),
    )
    const { count } = await db
      .from("avisos_pendientes")
      .select("id", { count: "exact", head: true })
      .eq("marca_id", marca)
      .is("enviado_en", null)
    expect(count).toBe(0)
  })

  test("a line only opens a path inside the app", async () => {
    const { userId } = await personaConSesion("cola-url")
    const marca = await marcaConDueno(userId)
    const { error } = await admin()
      .from("avisos_pendientes")
      .insert({ marca_id: marca, ...AVISO, url: "https://ejemplo.com" })
    expect(error?.code).toBe("23514")
  })

  test("an unsent line is ignored after three days and deleted after thirty", async () => {
    const { userId } = await personaConSesion("cola-vieja")
    const marca = await marcaConDueno(userId)
    const db = admin()
    await anotarAviso(db, marca, AVISO)
    const ahora = Date.now()
    expect((await avisosSinEnviar(db, ahora + 2 * 86_400_000)).filter((l) => l.marcaId === marca)).toHaveLength(1)
    expect((await avisosSinEnviar(db, ahora + 4 * 86_400_000)).filter((l) => l.marcaId === marca)).toHaveLength(0)
    await borrarAvisosEnviados(db, ahora + 31 * 86_400_000)
    expect((await db.from("avisos_pendientes").select("id").eq("marca_id", marca)).data).toHaveLength(0)
  })
})
