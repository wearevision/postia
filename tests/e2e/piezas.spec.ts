import { expect, test } from "@playwright/test"
import { invitar } from "@/lib/equipo/invitar"
import { semanaDe } from "@/lib/piezas/calendario"
import { rutaDeCalendario, rutaDePieza } from "@/lib/sesion/rutas"
import { admin, correoUnico } from "../integration/entorno"
import { entrar } from "./ingreso"
import { leerHastaElFinal } from "./lectura"
import { clienteDe, crearPiezaDeTexto } from "./piezas"

test("an owner creates a text piece, moves its date by the signature, signs it and finds it in the calendar week", async ({
  page,
  request,
}) => {
  const db = admin()
  const correo = correoUnico("e2e-piezas")
  const { marcaId } = await invitar(db, { correo, marca: `Marca ${correo}`, voz: "yo" })
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

  await entrar(page, request, correo)

  const dueno = await clienteDe(db, correo)
  const piezaId = await crearPiezaDeTexto(dueno, {
    cuentaId: cuenta.id,
    texto: "Una idea corta para probar la firma.",
  })
  await page.goto(rutaDePieza(piezaId))

  // One date control, by the signature: «Cambiar fecha» saves the plan and the signature follows it.
  const firmar = page.getByRole("button", { name: /^Firmar para el / })
  await expect(firmar).toBeVisible()
  await expect(page.getByLabel("Fecha y hora de publicación")).toHaveCount(0)
  const nombreAntes = (await firmar.textContent()) ?? ""
  await page.getByRole("button", { name: "Cambiar fecha" }).click()
  const campo = page.getByLabel("Fecha y hora de publicación")
  await campo.fill(unaSemanaDespues(await campo.inputValue()))
  await page.getByRole("button", { name: "Guardar fecha" }).click()
  await expect(firmar).not.toHaveText(nombreAntes)
  await expect(page.getByLabel("Fecha y hora de publicación")).toHaveCount(0)

  await leerHastaElFinal(page)
  await firmar.click()
  await expect(page.getByText("Programada", { exact: true })).toBeVisible()

  // Inicio only lists what is due today; the signed piece lives in the week of its date.
  const { data: firmada, error: errorDeLectura } = await db
    .from("piezas")
    .select("programada_para")
    .eq("id", piezaId)
    .single()
  if (errorDeLectura || !firmada.programada_para) throw new Error("La pieza firmada no quedó con fecha")
  // The Next dev indicator floats over the first nav link on a phone viewport, so go by URL.
  await page.goto(rutaDeCalendario({ semana: semanaDe(Date.parse(firmada.programada_para)).lunes }))
  const cuentaEnSemana = page.getByRole("region", { name: "Perfil E2E" })
  await expect(cuentaEnSemana.getByText("Una idea corta para probar la firma.")).toBeVisible()
})

test("a new piece arrives planned and, signed for the reserve, shows in the calendar", async ({ page, request }) => {
  const db = admin()
  const correo = correoUnico("e2e-reserva")
  const { marcaId } = await invitar(db, { correo, marca: `Marca ${correo}`, voz: "yo" })
  const { data: cuenta, error } = await db
    .from("cuentas")
    .insert({
      marca_id: marcaId,
      red: "linkedin",
      tipo: "persona",
      ruta: "api",
      nombre: "Perfil Reserva",
      ritmo_semanal: 3,
    })
    .select("id")
    .single()
  if (error) throw new Error(`No pude crear la cuenta de prueba: ${error.message}`)

  await entrar(page, request, correo)

  const dueno = await clienteDe(db, correo)
  const piezaId = await crearPiezaDeTexto(dueno, { cuentaId: cuenta.id, texto: "Una pieza para la reserva." })
  await page.goto(rutaDePieza(piezaId))

  await expect(page.locator("strong", { hasText: /^\p{L}+ \d+ de \p{L}+, \d{2}:\d{2}$/u })).toBeVisible()
  await leerHastaElFinal(page)
  await page.getByRole("button", { name: "Guardar en la reserva, sin fecha" }).click()
  await expect(page.getByText(/^En reserva: la app le pone fecha/)).toBeVisible()

  await page.goto("/calendario")
  await expect(page.getByRole("region", { name: "Perfil Reserva" }).getByText("Reserva: 1 de 3")).toBeVisible()
  await page.getByRole("link", { name: "Mes", exact: true }).click()
  await expect(page.getByRole("heading", { level: 2, name: /^\p{L}+ de \d{4}$/u })).toBeVisible()
})

test("a signed piece keeps the bottom bar and leads to the next one waiting; a missing piece says so in Spanish", async ({
  page,
  request,
}) => {
  const db = admin()
  const correo = correoUnico("e2e-siguiente")
  const { marcaId } = await invitar(db, { correo, marca: `Marca ${correo}`, voz: "yo" })
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

  await entrar(page, request, correo)
  const dueno = await clienteDe(db, correo)
  let piezaId = ""
  for (const texto of ["Primera pieza por firmar.", "Segunda pieza por firmar."]) {
    piezaId = await crearPiezaDeTexto(dueno, { cuentaId: cuenta.id, texto })
  }
  await page.goto(rutaDePieza(piezaId))
  await expect(page.getByRole("button", { name: /^Firmar para el / })).toBeVisible()

  await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Volver" })).toBeVisible()
  await leerHastaElFinal(page)
  await page.getByRole("button", { name: /^Firmar para el / }).click()
  await expect(page.getByText("Programada", { exact: true })).toBeVisible()
  await page.getByRole("link", { name: /^Siguiente: Perfil E2E.* \(quedan 1\)$/ }).click()
  await expect(page.getByText("Primera pieza por firmar.")).toBeVisible()

  await page.goto("/piezas/00000000-0000-0000-0000-000000000000")
  await expect(page.getByRole("heading", { name: "No encontré esta página" })).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible()
})

/** The same Chile wall-clock hour seven days later, as a datetime-local value: same weekday, free slot. */
function unaSemanaDespues(valor: string): string {
  const [dia, hora] = valor.split("T")
  const fecha = new Date(`${dia}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + 7)
  return `${fecha.toISOString().slice(0, 10)}T${hora}`
}
