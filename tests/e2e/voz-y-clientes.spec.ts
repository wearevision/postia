import { randomUUID } from "node:crypto"
import { expect, test } from "@playwright/test"
import { invitar } from "@/lib/equipo/invitar"
import { rutaDePieza } from "@/lib/sesion/rutas"
import { admin, correoUnico } from "../integration/entorno"
import { entrar } from "./ingreso"
import { leerHastaElFinal } from "./lectura"
import { clienteDe, crearPiezaDeTexto } from "./piezas"

test("an owner writes the editorial line, marks a client not to be named, and gate 1 warns on a piece naming it", async ({
  page,
  request,
}) => {
  const db = admin()
  const correo = correoUnico("e2e-voz")
  const { marcaId } = await invitar(db, { correo, marca: `Marca ${correo}`, voz: "nosotros" })
  const cuenta = await db
    .from("cuentas")
    .insert({
      marca_id: marcaId,
      red: "linkedin",
      tipo: "persona",
      ruta: "api",
      nombre: "Perfil Voz E2E",
      ritmo_semanal: 3,
    })
    .select("id")
    .single()
  if (cuenta.error) throw new Error(`No pude crear la cuenta de prueba: ${cuenta.error.message}`)
  const azar = randomUUID().slice(0, 8)
  const cliente = `Cliente E2E ${azar}`
  const caso = await db
    .from("casos")
    .insert({ slug: `prueba-e2e-${azar}`, cliente, titulo: `Activación ${azar}`, anio: 2025, era: "wav" })
  if (caso.error) throw new Error(`No pude crear el caso de prueba: ${caso.error.message}`)

  await entrar(page, request, correo)

  await page.goto("/ajustes")
  await page.getByRole("link", { name: "Voz y línea editorial" }).click()
  await page.getByRole("link", { name: new RegExp(`^Marca ${correo}`) }).click()
  await page.getByLabel("Tono y voz").fill("Cercano y concreto: hablamos de lo que hicimos en terreno.")
  await page.getByLabel("Nombre del pilar").fill("Oficio")
  await page.getByRole("button", { name: "Guardar versión nueva" }).click()
  await expect(page.getByText("Guardada como versión 1.")).toBeVisible()
  // The save refreshes the page; leaving before it lands interrupts the next navigation.
  await expect(page.getByText(/Versión vigente: 1\./)).toBeVisible()

  await page.goto("/clientes")
  const ficha = page.locator("details", { has: page.locator("summary", { hasText: cliente }) })
  await ficha.locator("summary").click()
  await ficha.getByLabel("Tipo de excepción").selectOption({ label: "No se nombra" })
  await ficha.getByRole("button", { name: "Marcar excepción" }).click()
  await expect(ficha.getByText("Excepción marcada.")).toBeVisible()

  const pilar = await db.from("pilares").select("id").eq("marca_id", marcaId).eq("nombre", "Oficio").single()
  if (pilar.error) throw new Error(`No encontré el pilar guardado: ${pilar.error.message}`)
  const dueno = await clienteDe(db, correo)
  const piezaId = await crearPiezaDeTexto(dueno, {
    cuentaId: cuenta.data.id,
    texto: `Con ${cliente} en terreno.`,
    pilarId: pilar.data.id,
  })
  await page.goto(rutaDePieza(piezaId))

  // The review's summary counts what it found, and a finding opens it on its own (no click: that would fold it).
  await expect(page.locator("summary", { hasText: "Revisión: 1 alerta de clientes" })).toBeVisible()
  const veredicto = page.getByRole("region", { name: "Revisa antes de firmar" })
  await expect(veredicto).toBeVisible()
  await expect(veredicto.getByText(`Nombra a ${cliente}, que no se nombra.`)).toBeVisible()
  await leerHastaElFinal(page)
  await expect(page.getByRole("button", { name: /^Firmar para el / })).toBeEnabled()
  await page
    .locator("summary")
    .filter({ hasText: /^(Corregir o pedir otra versión|Cambiar el pilar)$/ })
    .click()
  await expect(page.getByLabel("Pilar").locator("option:checked")).toHaveText("Oficio")

  await page.goto("/calendario")
  const pilares = page.getByRole("region", { name: /^Pilares/ })
  await expect(pilares.getByText(/^Oficio: 0 de 4/)).toBeVisible()
})
