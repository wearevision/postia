import { beforeAll, describe, expect, test } from "vitest"
import { pedirDiseno } from "@/lib/disenos/acciones"
import { carruselParaEditar, disenoDePieza, pedidosDeDisenoRecientes } from "@/lib/disenos/lectura"
import { carruselInicial } from "@/lib/plantillas/iniciales"
import { admin, carruselDe, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

describe("asking for a carousel", () => {
  let dueno: Awaited<ReturnType<typeof personaConSesion>>
  let cuenta: string
  const entrada = (extra: Record<string, unknown> = {}) => ({
    cuentaId: cuenta,
    piezaId: null,
    tema: "wav-noche",
    titulo: "Documento",
    texto: "Post",
    diseno: carruselInicial("wav"),
    ...extra,
  })
  beforeAll(async () => {
    await admin().from("pedidos_de_diseno").update({ estado: "obsoleto" }).in("estado", ["pendiente", "trabajando"])
    dueno = await personaConSesion("e2e-acciones-disenos")
    // «a mano»: designing a carousel does not depend on the account's route.
    cuenta = await cuentaDe(await marcaConDueno(dueno.userId, "nosotros"), "empresa", "a_mano")
  })

  test("queues a valid carousel and lists it as recent", async () => {
    const r = await pedirDiseno(dueno.db, entrada())
    expect(r.ok).toBe(true)
    const recientes = await pedidosDeDisenoRecientes(dueno.db)
    expect(recientes[0]).toMatchObject({ estado: "pendiente", titulo: "Documento", piezaId: null, motivo: null })
  })

  test("refuses a slide over its limit before reaching the database", async () => {
    const diseno = carruselInicial("wav")
    diseno.laminas[1] = {
      tipo: "punto",
      numero: "",
      titulo: "una dos tres cuatro cinco seis siete ocho nueve diez once doce trece",
      cuerpo: "c",
    }
    const antes = await admin().from("pedidos_de_diseno").select("id", { count: "exact", head: true })
    expect(await pedirDiseno(dueno.db, entrada({ diseno }))).toEqual({
      ok: false,
      error: "Lámina 2: El título pasa las 12 palabras.",
    })
    const despues = await admin().from("pedidos_de_diseno").select("id", { count: "exact", head: true })
    expect(despues.count).toBe(antes.count)
  })

  test("translates a theme of another family", async () => {
    expect(await pedirDiseno(dueno.db, entrada({ tema: "personal-claro" }))).toEqual({
      ok: false,
      error: "Ese diseño no es de esta marca.",
    })
  })

  test("a piece's design state: open while a request runs, then the failure's reason", async () => {
    const pieza = await carruselDe(dueno.db, cuenta)
    expect(await disenoDePieza(dueno.db, pieza)).toEqual({ abierto: false, ultimoFallo: null })
    const r = await pedirDiseno(dueno.db, entrada({ piezaId: pieza }))
    expect(r.ok).toBe(true)
    expect(await disenoDePieza(dueno.db, pieza)).toEqual({ abierto: true, ultimoFallo: null })
    const id = r.ok ? r.pedidoId : ""
    await admin()
      .from("pedidos_de_diseno")
      .update({ estado: "obsoleto" })
      .in("estado", ["pendiente", "trabajando"])
      .neq("id", id)
    await admin().rpc("tomar_pedidos_de_diseno")
    await admin().rpc("terminar_pedido_de_diseno", {
      p_pedido: id,
      p_estado: "fallo",
      p_motivo: "La lámina 3 no cabe. Acórtala o divídela en dos.",
    })
    expect(await disenoDePieza(dueno.db, pieza)).toEqual({
      abierto: false,
      ultimoFallo: "La lámina 3 no cabe. Acórtala o divídela en dos.",
    })
  })

  test("a failure older than the piece's latest version is not shown", async () => {
    const pieza = await carruselDe(dueno.db, cuenta)
    const r = await pedirDiseno(dueno.db, entrada({ piezaId: pieza }))
    const id = r.ok ? r.pedidoId : ""
    await admin()
      .from("pedidos_de_diseno")
      .update({ estado: "obsoleto" })
      .in("estado", ["pendiente", "trabajando"])
      .neq("id", id)
    await admin().rpc("tomar_pedidos_de_diseno")
    await admin().rpc("terminar_pedido_de_diseno", { p_pedido: id, p_estado: "fallo", p_motivo: "No salió." })
    const { data: v } = await admin()
      .from("versiones")
      .select("titulo, archivo_ruta, archivo_sha256")
      .eq("pieza_id", pieza)
      .single()
    const { error } = await dueno.db.rpc("nueva_version", {
      p_pieza: pieza,
      p_texto: "Otro post",
      p_titulo: v?.titulo ?? undefined,
      p_archivo_ruta: v?.archivo_ruta ?? undefined,
      p_archivo_sha256: v?.archivo_sha256 ?? undefined,
    })
    expect(error).toBeNull()
    expect(await disenoDePieza(dueno.db, pieza)).toEqual({ abierto: false, ultimoFallo: null })
  })

  test("the editor reads a designed carousel's latest version, and nothing for a hand-made one", async () => {
    const r = await pedirDiseno(dueno.db, entrada({ titulo: "Para editar" }))
    const id = r.ok ? r.pedidoId : ""
    await admin()
      .from("pedidos_de_diseno")
      .update({ estado: "obsoleto" })
      .in("estado", ["pendiente", "trabajando"])
      .neq("id", id)
    await admin().rpc("tomar_pedidos_de_diseno")
    const { data: marca } = await admin().from("cuentas").select("marca_id").eq("id", cuenta).single()
    const guardado = await admin().rpc("guardar_diseno", {
      p_pedido: id,
      p_archivo_ruta: `${marca?.marca_id}/${crypto.randomUUID()}.pdf`,
      p_archivo_sha256: "b".repeat(64),
    })
    expect(guardado.error).toBeNull()
    const pieza = (guardado.data as { pieza: string }).pieza
    expect(await carruselParaEditar(dueno.db, pieza)).toEqual({
      piezaId: pieza,
      cuentaId: cuenta,
      tema: "wav-noche",
      titulo: "Para editar",
      texto: "Post",
      diseno: carruselInicial("wav"),
    })
    expect(await carruselParaEditar(dueno.db, await carruselDe(dueno.db, cuenta))).toBeNull()
    expect(await carruselParaEditar(dueno.db, "no-es-un-id")).toBeNull()
  })
})
