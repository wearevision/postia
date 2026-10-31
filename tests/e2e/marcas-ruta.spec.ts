import { expect, test } from "@playwright/test"
import { invitar } from "@/lib/equipo/invitar"
import { admin, correoUnico } from "../integration/entorno"
import { entrar } from "./ingreso"

const DIA = 86_400_000

test("an owner sends the WAV page out by itself, sees how to connect it, and goes back to by hand", async ({
  page,
  request,
}) => {
  const db = admin()
  const correo = correoUnico("e2e-ruta")
  const { marcaId } = await invitar(db, { correo, marca: `Marca ${correo}`, voz: "nosotros" })
  const { data: cuenta, error } = await db
    .from("cuentas")
    .insert({ marca_id: marcaId, red: "linkedin", tipo: "empresa", ruta: "a_mano", nombre: "Página de WAV" })
    .select("id")
    .single()
  if (error) throw new Error(`No pude crear la cuenta de prueba: ${error.message}`)

  await entrar(page, request, correo)
  await page.goto("/marcas")
  const fila = page.getByRole("listitem").filter({ hasText: "Página de WAV" })
  const conectar = fila.getByRole("link", { name: "Conectar página de LinkedIn" })
  await expect(fila.getByRole("button", { name: "A mano" })).toHaveAttribute("aria-pressed", "true")
  await expect(conectar).toHaveCount(0)

  await fila.getByRole("button", { name: "Sale sola" }).click()
  await expect(fila.getByRole("button", { name: "Sale sola" })).toHaveAttribute("aria-pressed", "true")
  await expect(conectar).toHaveAttribute("href", `/api/linkedin/pagina/conectar?cuenta=${cuenta.id}`)

  await fila.getByRole("button", { name: "A mano" }).click()
  await expect(fila.getByRole("button", { name: "A mano" })).toHaveAttribute("aria-pressed", "true")
  await expect(conectar).toHaveCount(0)
})

test("a connected page goes by hand as a pause: it keeps its connection and comes back without a new login", async ({
  page,
  request,
}) => {
  const db = admin()
  const correo = correoUnico("e2e-pausa")
  const { marcaId, userId } = await invitar(db, { correo, marca: `Marca ${correo}`, voz: "nosotros" })
  const { data: cuenta, error } = await db
    .from("cuentas")
    .insert({ marca_id: marcaId, red: "linkedin", tipo: "empresa", ruta: "api", nombre: "Página en pausa" })
    .select("id")
    .single()
  if (error) throw new Error(`No pude crear la cuenta de prueba: ${error.message}`)
  const { data: conexion, error: errorDeConexion } = await db
    .from("conexiones")
    .insert({
      red: "linkedin",
      app: "estudio_wav",
      titular: `urn:li:person:e2e${crypto.randomUUID().slice(0, 8)}`,
      organizacion: `urn:li:organization:${Math.floor(Math.random() * 1e9)}`,
      scopes: ["w_organization_social"],
      expira_en: new Date(Date.now() + 40 * DIA).toISOString(),
      conectada_por: userId,
    })
    .select("id")
    .single()
  if (errorDeConexion) throw new Error(`No pude crear la conexión de prueba: ${errorDeConexion.message}`)
  const enlazada = await db.from("cuentas").update({ conexion_id: conexion.id }).eq("id", cuenta.id)
  if (enlazada.error) throw new Error(`No pude enlazar la conexión de prueba: ${enlazada.error.message}`)

  await entrar(page, request, correo)
  await page.goto("/marcas")
  const fila = page.getByRole("listitem").filter({ hasText: "Página en pausa" })
  const chip = fila.getByText("Conectada · vence en 40 días")
  const pausa = fila.getByText("En pausa: las piezas se publican a mano.")
  await expect(chip).toBeVisible()
  await expect(fila.getByText(/desconecta LinkedIn/)).toHaveCount(0)

  await fila.getByRole("button", { name: "A mano" }).click()
  await expect(pausa).toBeVisible()
  await expect(chip).toBeVisible()
  await expect(fila.getByRole("button", { name: "Desconectar" })).toBeVisible()
  await expect(fila.getByRole("link", { name: "Renovar página" })).toHaveCount(0)

  await fila.getByRole("button", { name: "Sale sola" }).click()
  await expect(fila.getByRole("button", { name: "Sale sola" })).toHaveAttribute("aria-pressed", "true")
  await expect(pausa).toHaveCount(0)
  await expect(chip).toBeVisible()
  await expect(fila.getByRole("link", { name: "Renovar página" })).toBeVisible()
})
