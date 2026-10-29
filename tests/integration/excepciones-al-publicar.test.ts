import { randomUUID } from "node:crypto"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { type PuertosDePublicacion, publicarPendientes } from "@/lib/publicacion/publicar"
import { repositorioDePublicacion } from "@/lib/publicacion/repositorio"
import { admin, cuentaDe, marcaConDueno, personaConSesion, versionVigente } from "./entorno"

const EN_UNA_HORA = () => new Date(Date.now() + 3_600_000).toISOString()
const HACE_UN_MINUTO = () => new Date(Date.now() - 60_000).toISOString()

/** A connected account with a piece that names `cliente`, before it is signed. */
async function piezaQueNombra(cliente: string) {
  const dueno = await personaConSesion("excepcion-envio")
  const marca = await marcaConDueno(dueno.userId)
  const cuenta = await cuentaDe(marca, "persona", "api")
  const { error: errorDeConexion } = await dueno.db.rpc("conectar_linkedin", {
    p_cuenta: cuenta,
    p_token: "token-de-prueba",
    p_titular: "urn:li:person:abc123",
    p_nombre: "Federico Elgueta",
    p_scopes: ["openid", "profile", "w_member_social"],
    p_expira_en: new Date(Date.now() + 60 * 86_400_000).toISOString(),
  })
  if (errorDeConexion) throw errorDeConexion
  const { data: pieza, error } = await dueno.db.rpc("crear_pieza", {
    p_cuenta: cuenta,
    p_formato: "texto",
    p_texto: `Lo que aprendimos con ${cliente} en 2019`,
  })
  if (error) throw error
  return { ...dueno, marca, pieza }
}

/** Signs the latest version and makes its moment arrive. Signing refuses the past, so piece and signature move together. */
async function firmarVencida(c: Awaited<ReturnType<typeof piezaQueNombra>>) {
  const { huella } = await versionVigente(c.pieza)
  const { data: firma, error } = await c.db.rpc("firmar_pieza", {
    p_pieza: c.pieza,
    p_huella: huella,
    p_programada_para: EN_UNA_HORA(),
  })
  if (error) throw error
  const cuando = HACE_UN_MINUTO()
  await admin().from("piezas").update({ programada_para: cuando }).eq("id", c.pieza)
  await admin().from("firmas").update({ programada_para: cuando }).eq("id", firma)
}

async function marcarExcepcion(c: Awaited<ReturnType<typeof piezaQueNombra>>, cliente: string) {
  const { error } = await c.db.rpc("marcar_excepcion", { p_cliente: cliente, p_tipo: "no_nombrar", p_alias: [] })
  if (error) throw error
}

/** The real repository over the service role; only LinkedIn, the push and the clock are fakes. */
function publicador(pieza: string, cambios: Partial<PuertosDePublicacion> = {}) {
  const repo = repositorioDePublicacion(admin())
  const linkedin = {
    crearPost: vi.fn(async () => "urn:li:share:555"),
    subirDocumento: vi.fn(),
    estadoDelDocumento: vi.fn(),
  }
  const avisar = vi.fn(async () => {})
  const puertos: PuertosDePublicacion = {
    ...repo,
    // Scoped to this test's piece: the shared local database may hold other due pieces.
    tomarPendientes: async () => (await repo.tomarPendientes()).filter((p) => p.id === pieza),
    vencidasSinFirma: async () => [],
    sinRespuesta: async () => [],
    avisar,
    linkedin,
    esperar: async () => {},
    ahora: () => Date.now(),
    ...cambios,
  }
  return { puertos, linkedin, avisar }
}

async function estadoDe(pieza: string) {
  const { data } = await admin().from("piezas").select("estado, motivo").eq("id", pieza).single()
  return data
}

// Leftover due pieces from other files would fill the lease batch: take them first.
beforeEach(async () => {
  const repo = repositorioDePublicacion(admin())
  while ((await repo.tomarPendientes()).length > 0);
})

describe("the publisher re-checks client exceptions marked after the signature", () => {
  test("an exception that already existed when the piece was signed does not stop it", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const c = await piezaQueNombra(cliente)
    await marcarExcepcion(c, cliente)
    await firmarVencida(c)
    const { puertos, linkedin } = publicador(c.pieza)
    expect(await publicarPendientes(puertos)).toMatchObject({ publicada: 1 })
    expect(linkedin.crearPost).toHaveBeenCalledTimes(1)
    expect((await estadoDe(c.pieza))?.estado).toBe("publicada")
  })

  test("an exception marked after the signature returns the piece to the gate and tells the owner at once", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const c = await piezaQueNombra(cliente)
    await firmarVencida(c)
    await marcarExcepcion(c, cliente)
    const { puertos, linkedin, avisar } = publicador(c.pieza)
    expect(await publicarPendientes(puertos)).toMatchObject({ por_aprobar: 1, publicada: 0 })
    expect(linkedin.crearPost).not.toHaveBeenCalled()
    expect(await estadoDe(c.pieza)).toEqual({
      estado: "por_aprobar",
      motivo: `Nombra a ${cliente}, que ahora tiene una excepción. Revisa el texto y fírmala de nuevo.`,
    })
    expect(avisar).toHaveBeenCalledWith(c.marca, expect.objectContaining({ url: `/piezas/${c.pieza}` }))
    const { count } = await admin()
      .from("publicaciones")
      .select("*", { count: "exact", head: true })
      .eq("pieza_id", c.pieza)
    expect(count).toBe(0)
  })

  test("when the exceptions cannot be read nothing is sent and the piece stays scheduled for the next run", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const c = await piezaQueNombra(cliente)
    await firmarVencida(c)
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const { puertos, linkedin } = publicador(c.pieza, {
      excepcionesPuestasDespues: async () => {
        throw new Error("No pude leer las excepciones de clientes: base caída")
      },
    })
    expect(await publicarPendientes(puertos)).toMatchObject({ reintentar: 1, publicada: 0 })
    registro.mockRestore()
    expect(linkedin.crearPost).not.toHaveBeenCalled()
    expect((await estadoDe(c.pieza))?.estado).toBe("programada")
  })
})
