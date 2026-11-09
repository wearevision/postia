import { expect, test } from "@playwright/test"
import { invitar } from "@/lib/equipo/invitar"
import { rutaDeRendimiento } from "@/lib/sesion/rutas"
import { admin, correoUnico } from "../integration/entorno"
import { entrar } from "./ingreso"

// Renders the real /rendimiento route (server page + client sections): unit tests and the build do not prove the
// client/server boundary.
test("an owner opens Rendimiento, sees the imported post and approves a learning", async ({ page, request }) => {
  const db = admin()
  const correo = correoUnico("e2e-rendimiento")
  const { userId, marcaId } = await invitar(db, { correo, marca: `Marca ${correo}`, voz: "yo" })
  const { data: cuenta, error } = await db
    .from("cuentas")
    .insert({
      marca_id: marcaId,
      red: "linkedin",
      tipo: "persona",
      ruta: "api",
      nombre: "Perfil E2E",
      ritmo_semanal: 3,
    })
    .select("id")
    .single()
  if (error) throw new Error(`No pude crear la cuenta de prueba: ${error.message}`)

  const id = (r: { data: { id: string } | null; error: { message: string } | null }, que: string) => {
    if (r.error || !r.data) throw new Error(`No pude sembrar ${que}: ${r.error?.message}`)
    return r.data.id
  }
  id(
    await db
      .from("importaciones_de_metricas")
      .insert({ cuenta_id: cuenta.id, desde: "2026-10-01", hasta: "2026-10-31" })
      .select("id")
      .single(),
    "la importación",
  )
  const publicacion = id(
    await db
      .from("metricas_de_publicacion")
      .insert({
        cuenta_id: cuenta.id,
        post_urn: `urn:li:share:${Date.now()}`,
        publicada_el: "2026-10-15",
        impresiones: 500,
        interacciones: 20,
        extracto: "Un post importado para la prueba",
        origen: "importacion",
      })
      .select("id")
      .single(),
    "la publicación",
  )
  const lectura = id(
    await db
      .from("lecturas_de_rendimiento")
      .insert({ cuenta_id: cuenta.id, estado: "lista", pedida_por: userId })
      .select("id")
      .single(),
    "la lectura",
  )
  id(
    await db
      .from("aprendizajes")
      .insert({
        cuenta_id: cuenta.id,
        lectura_id: lectura,
        texto: "Abrir con una cifra funciona mejor.",
        porque: "Los posts que abren con una cifra tienen más enganche.",
        respaldo: 9,
        publicaciones: [publicacion],
        estado: "propuesto",
      })
      .select("id")
      .single(),
    "el aprendizaje",
  )

  await entrar(page, request, correo)
  await page.goto(rutaDeRendimiento(cuenta.id))

  await expect(page.getByRole("heading", { name: "Rendimiento", level: 1 })).toBeVisible()
  await expect(page.getByText("Un post importado para la prueba")).toBeVisible()
  const porDecidir = page.getByRole("list", { name: "Por decidir" })
  await expect(porDecidir.getByText("Abrir con una cifra funciona mejor.")).toBeVisible()
  await porDecidir.getByRole("button", { name: "Aprobar" }).click()
  await expect(
    page.getByRole("list", { name: "Aprobados" }).getByText("Abrir con una cifra funciona mejor."),
  ).toBeVisible()
})
