import { type APIRequestContext, expect, type Page } from "@playwright/test"

const MAILPIT = "http://127.0.0.1:54624"

export async function codigoPara(request: APIRequestContext, correo: string): Promise<string> {
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

export async function entrar(page: Page, request: APIRequestContext, correo: string): Promise<void> {
  await page.goto("/ingreso")
  await page.getByLabel("Tu correo").fill(correo)
  await page.getByRole("button", { name: "Mandar código" }).click()
  await page.getByLabel("Código de 6 números").fill(await codigoPara(request, correo))
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible()
}
