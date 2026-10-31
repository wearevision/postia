import { execFileSync } from "node:child_process"
import { type APIRequestContext, expect, test } from "@playwright/test"

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

test("an invited person signs in with the six-digit code and lands on Inicio", async ({ page, request }) => {
  const correo = `e2e-${Date.now()}@prueba.postia.test`
  execFileSync("pnpm", ["invitar", "--correo", correo, "--marca", "Marca E2E", "--voz", "yo"], { stdio: "inherit" })

  await page.goto("/")
  await expect(page).toHaveURL(/\/ingreso$/)
  await page.getByLabel("Tu correo").fill(correo)
  await page.getByRole("button", { name: "Mandar código" }).click()
  await expect(page.getByText(/Si tu correo está invitado/)).toBeVisible()
  await page.getByLabel("Código de 6 números").fill(await codigoPara(request, correo))
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible()
  // Ideas and reports are shared by the whole team, so other specs may leave some «Por revisar»; a new person has no
  // pieces of their own to sign.
  await expect(page.getByRole("heading", { name: "Por firmar" })).toHaveCount(0)
})

test("a person who was not invited gets the same answer and no email", async ({ page, request }) => {
  const correo = `extrano-${Date.now()}@prueba.postia.test`
  await page.goto("/ingreso")
  await page.getByLabel("Tu correo").fill(correo)
  await page.getByRole("button", { name: "Mandar código" }).click()
  await expect(page.getByText(/Si tu correo está invitado/)).toBeVisible()
  await new Promise((listo) => setTimeout(listo, 2000))
  const busqueda = await request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:"${correo}"` } })
  expect(((await busqueda.json()) as { messages: unknown[] }).messages).toHaveLength(0)
})
