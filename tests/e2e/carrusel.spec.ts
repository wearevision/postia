import { expect, test } from "@playwright/test"
import { invitar } from "@/lib/equipo/invitar"
import { admin, correoUnico } from "../integration/entorno"
import { entrar } from "./ingreso"

test("an owner asks for a carousel from the defaults, and its piece shows the slides at gate 1", async ({
  page,
  request,
}) => {
  const db = admin()
  const correo = correoUnico("e2e-carrusel")
  const { marcaId } = await invitar(db, { correo, marca: `Marca ${correo}`, voz: "nosotros" })
  // A company account cannot publish by API (constraint api_solo_perfil).
  const { data: cuenta, error } = await db
    .from("cuentas")
    .insert({ marca_id: marcaId, red: "linkedin", tipo: "empresa", ruta: "a_mano", nombre: "Página E2E" })
    .select("id")
    .single()
  if (error) throw new Error(`No pude crear la cuenta de prueba: ${error.message}`)

  await entrar(page, request, correo)

  await page.getByRole("link", { name: "Nuevo carrusel" }).click()
  await expect(page.getByRole("heading", { name: "Nuevo carrusel" })).toBeVisible()
  await page.getByLabel("Texto del post").fill("Un carrusel para probar el editor.")
  await page.getByRole("button", { name: "Armar carrusel" }).click()
  const recientes = page.locator("section", { has: page.getByRole("heading", { name: "Carruseles recientes" }) })
  await expect(recientes.getByText(/· En cola$/)).toBeVisible()
  await expect(recientes.getByText("Se está armando el carrusel. Esta página se actualiza sola.")).toBeVisible()

  // No Trigger.dev in e2e: stand in for armar-carruseles with stub previews and its service-role RPCs.
  const { data: pedido } = await db.from("pedidos_de_diseno").select("id, diseno").eq("cuenta_id", cuenta.id).single()
  if (!pedido) throw new Error("No quedó el pedido de carrusel")
  await db
    .from("pedidos_de_diseno")
    .update({ estado: "obsoleto" })
    .in("estado", ["pendiente", "trabajando"])
    .neq("id", pedido.id)
  await db.rpc("tomar_pedidos_de_diseno")
  const base = `${marcaId}/${crypto.randomUUID()}`
  const laminas = (pedido.diseno as { laminas: unknown[] }).laminas.length
  await db.storage.from("piezas").upload(`${base}.pdf`, new TextEncoder().encode("%PDF-1.4"), {
    contentType: "application/pdf",
  })
  for (let n = 1; n <= laminas; n++)
    await db.storage
      .from("piezas")
      .upload(`${base}/${String(n).padStart(2, "0")}.jpg`, new Uint8Array([0xff, 0xd8, 0xff]), {
        contentType: "image/jpeg",
      })
  const guardado = await db.rpc("guardar_diseno", {
    p_pedido: pedido.id,
    p_archivo_ruta: `${base}.pdf`,
    p_archivo_sha256: "d".repeat(64),
  })
  if (guardado.error) throw new Error(`No pude guardar el carrusel: ${guardado.error.message}`)
  const piezaId = (guardado.data as { pieza: string }).pieza

  await page.goto(`/piezas/${piezaId}`)
  await expect(page.getByRole("list", { name: "Láminas del carrusel" }).getByRole("img")).toHaveCount(laminas)
  await expect(page.getByRole("img", { name: `Lámina 1 de ${laminas}` })).toBeAttached()
  await expect(page.getByRole("link", { name: "Descargar el PDF" })).toBeVisible()
  await expect(page.getByText("Un carrusel para probar el editor.")).toBeVisible()

  await page.getByRole("link", { name: "Editar el carrusel" }).click()
  await expect(page.getByRole("heading", { name: "Editar carrusel" })).toBeVisible()
  await expect(page.getByLabel("Texto del post")).toHaveValue("Un carrusel para probar el editor.")
  await expect(page.getByLabel("Cuenta")).toBeDisabled()
})
