import { createHash } from "node:crypto"
import { type APIRequestContext, expect, test } from "@playwright/test"
import { invitar } from "@/lib/equipo/invitar"
import { admin, correoUnico } from "../integration/entorno"

const MAILPIT = "http://127.0.0.1:54624"

async function codigoPara(request: APIRequestContext, correo: string): Promise<string> {
  for (let intento = 0; intento < 20; intento++) {
    const busqueda = await request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:"${correo}"` } })
    const { messages } = (await busqueda.json()) as { messages: { ID: string }[] }
    const ultimo = messages[0]
    if (ultimo) {
      const mensaje = (await (await request.get(`${MAILPIT}/api/v1/message/${ultimo.ID}`)).json()) as { Text: string }
      const codigo = /\b(\d{6})\b/.exec(mensaje.Text)?.[1]
      if (codigo) return codigo
    }
    await new Promise((listo) => setTimeout(listo, 500))
  }
  throw new Error(`No llegó el código a ${correo}`)
}

test("an owner creates a text piece, signs it with the proposed date and finds it under Próximas", async ({
  page,
  request,
}) => {
  const db = admin()
  const correo = correoUnico("e2e-piezas")
  const { marcaId } = await invitar(db, { correo, marca: `Marca ${correo}`, voz: "yo" })
  const { error } = await db.from("cuentas").insert({
    marca_id: marcaId,
    red: "linkedin",
    tipo: "persona",
    ruta: "api",
    nombre: "Perfil E2E",
    ritmo_semanal: 3,
  })
  if (error) throw new Error(`No pude crear la cuenta de prueba: ${error.message}`)

  await page.goto("/ingreso")
  await page.getByLabel("Tu correo").fill(correo)
  await page.getByRole("button", { name: "Mandar código" }).click()
  await page.getByLabel("Código de 6 números").fill(await codigoPara(request, correo))
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible()

  await page.getByRole("link", { name: "Nueva", exact: true }).click()
  await page.getByRole("textbox", { name: "Texto" }).fill("Una idea corta para probar la firma.")
  await expect(page.getByText("36 / 3000")).toBeVisible()
  await page.getByRole("button", { name: "Crear pieza" }).click()

  await expect(page.getByRole("button", { name: "Firmar y programar" })).toBeVisible()
  await page.getByRole("button", { name: "Firmar y programar" }).click()
  await expect(page.getByText("Programada", { exact: true })).toBeVisible()

  // The Next dev indicator floats over the first nav link on a phone viewport, so go by URL.
  await page.goto("/")
  const proximas = page.locator("section", { has: page.getByRole("heading", { name: "Próximas" }) })
  await expect(proximas.getByText("Una idea corta para probar la firma.")).toBeVisible()
})

test("an owner uploads a carousel PDF, and the piece keeps the file the server hashed", async ({ page, request }) => {
  const db = admin()
  const correo = correoUnico("e2e-carrusel")
  const { marcaId } = await invitar(db, { correo, marca: `Marca ${correo}`, voz: "nosotros" })
  const { error } = await db.from("cuentas").insert({
    marca_id: marcaId,
    red: "linkedin",
    tipo: "empresa",
    ruta: "a_mano",
    nombre: "Página E2E",
    ritmo_semanal: 3,
  })
  if (error) throw new Error(`No pude crear la cuenta de prueba: ${error.message}`)

  await page.goto("/ingreso")
  await page.getByLabel("Tu correo").fill(correo)
  await page.getByRole("button", { name: "Mandar código" }).click()
  await page.getByLabel("Código de 6 números").fill(await codigoPara(request, correo))
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible()

  await page.goto("/piezas/nueva")
  await page.getByRole("radio", { name: "Carrusel PDF" }).check()
  await page.getByLabel("Título del carrusel").fill("Carrusel de prueba")
  const pdf = Buffer.from("%PDF-1.4\n% PostIA E2E\n%%EOF\n")
  await page.getByLabel(/PDF \(hasta/).setInputFiles({ name: "prueba.pdf", mimeType: "application/pdf", buffer: pdf })
  await page.getByRole("textbox", { name: "Texto" }).fill("Un carrusel para probar la subida.")
  await page.getByRole("button", { name: "Crear pieza" }).click()

  await expect(page.getByRole("button", { name: /Firmar/ })).toBeVisible()
  await expect(page.getByRole("link", { name: "Ver el PDF" })).toBeVisible()
  const { data: version } = await db
    .from("versiones")
    .select("archivo_sha256, piezas!inner(cuentas!inner(marca_id))")
    .eq("piezas.cuentas.marca_id", marcaId)
    .single()
  expect(version?.archivo_sha256).toBe(createHash("sha256").update(pdf).digest("hex"))
})
