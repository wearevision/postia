import { expect, test } from "@playwright/test"
import { invitar } from "@/lib/equipo/invitar"
import { rutaDePieza } from "@/lib/sesion/rutas"
import { admin, correoUnico } from "../integration/entorno"
import { entrar } from "./ingreso"
import { leerHastaElFinal } from "./lectura"
import { crearPiezaDeTexto } from "./piezas"

test("an owner creates a text piece, signs it with the proposed date and finds it under Próximas", async ({
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

  const piezaId = await crearPiezaDeTexto(db, {
    cuentaId: cuenta.id,
    texto: "Una idea corta para probar la firma.",
    correo,
  })
  await page.goto(rutaDePieza(piezaId))

  await expect(page.getByRole("button", { name: /^Firmar (?!para).+ · / })).toBeVisible()
  await leerHastaElFinal(page)
  await page.getByRole("button", { name: /^Firmar (?!para).+ · / }).click()
  await expect(page.getByText("Programada", { exact: true })).toBeVisible()

  // The Next dev indicator floats over the first nav link on a phone viewport, so go by URL.
  await page.goto("/")
  const proximas = page.locator("section", { has: page.getByRole("heading", { name: "Próximas" }) })
  await expect(proximas.getByText("Una idea corta para probar la firma.")).toBeVisible()
})

test("a new piece arrives planned, signed for the reserve it shows in Inicio and in the calendar", async ({
  page,
  request,
}) => {
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

  const piezaId = await crearPiezaDeTexto(db, { cuentaId: cuenta.id, texto: "Una pieza para la reserva.", correo })
  await page.goto(rutaDePieza(piezaId))

  const plan = page.locator("section section", { has: page.getByRole("heading", { name: "Fecha planeada" }) })
  await expect(plan.getByText(/^\p{L}+ \d+ de \p{L}+, \d{2}:\d{2}$/u)).toBeVisible()
  await leerHastaElFinal(page)
  await page.getByRole("button", { name: "Firmar para la reserva" }).click()
  await expect(page.getByText(/^En reserva: la app le pone fecha/)).toBeVisible()

  await page.goto("/")
  const reserva = page.locator("section", { has: page.getByRole("heading", { name: "En reserva" }) })
  await expect(reserva.getByText("Una pieza para la reserva.")).toBeVisible()

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
  let piezaId = ""
  for (const texto of ["Primera pieza por firmar.", "Segunda pieza por firmar."]) {
    piezaId = await crearPiezaDeTexto(db, { cuentaId: cuenta.id, texto, correo })
  }
  await page.goto(rutaDePieza(piezaId))
  await expect(page.getByRole("button", { name: /^Firmar (?!para).+ · / })).toBeVisible()

  await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Volver" })).toBeVisible()
  await leerHastaElFinal(page)
  await page.getByRole("button", { name: /^Firmar (?!para).+ · / }).click()
  await expect(page.getByText("Programada", { exact: true })).toBeVisible()
  await page.getByRole("link", { name: "Siguiente por firmar" }).click()
  await expect(page.getByText("Primera pieza por firmar.")).toBeVisible()

  await page.goto("/piezas/00000000-0000-0000-0000-000000000000")
  await expect(page.getByRole("heading", { name: "No encontré esta página" })).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible()
})
