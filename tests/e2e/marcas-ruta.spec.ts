import { expect, test } from "@playwright/test"
import { invitar } from "@/lib/equipo/invitar"
import { admin, correoUnico } from "../integration/entorno"
import { entrar } from "./ingreso"

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
