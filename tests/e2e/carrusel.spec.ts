import { expect, test } from "@playwright/test"
import { pedirDiseno } from "@/lib/disenos/acciones"
import { invitar } from "@/lib/equipo/invitar"
import { carruselInicial } from "@/lib/plantillas/iniciales"
import { familiaDe } from "@/lib/plantillas/temas"
import { admin, correoUnico } from "../integration/entorno"
import { entrar } from "./ingreso"
import { clienteDe } from "./piezas"

test("a carousel asked for in the editor shows its slides at gate 1 and opens again to edit", async ({
  page,
  request,
}) => {
  const db = admin()
  const correo = correoUnico("e2e-carrusel")
  const { marcaId } = await invitar(db, { correo, marca: `Marca ${correo}`, voz: "nosotros" })
  const { data: cuenta, error } = await db
    .from("cuentas")
    .insert({ marca_id: marcaId, red: "linkedin", tipo: "empresa", ruta: "api", nombre: "Página E2E" })
    .select("id")
    .single()
  if (error) throw new Error(`No pude crear la cuenta de prueba: ${error.message}`)

  // Signed in first: opening the helper session before asking for the emailed code trips the per-address mail limit.
  await entrar(page, request, correo)

  // Carousels are asked for from approved ideas now, so the order is placed the way the editor's action does.
  const dueno = await clienteDe(db, correo)
  const pedido = await pedirDiseno(dueno, {
    cuentaId: cuenta.id,
    piezaId: null,
    tema: "wav-noche",
    titulo: "Portada: la pregunta que responde la guía",
    texto: "Un carrusel para probar el editor.",
    diseno: carruselInicial(familiaDe("wav-noche")),
  })
  if (!pedido.ok) throw new Error(`No pude pedir el carrusel: ${pedido.error}`)

  // No Trigger.dev in e2e: stand in for armar-carruseles with stub previews and its service-role RPCs.
  const { data: pedidoGuardado } = await db
    .from("pedidos_de_diseno")
    .select("id, diseno")
    .eq("id", pedido.pedidoId)
    .single()
  if (!pedidoGuardado) throw new Error("No quedó el pedido de carrusel")
  await db
    .from("pedidos_de_diseno")
    .update({ estado: "obsoleto" })
    .in("estado", ["pendiente", "trabajando"])
    .neq("id", pedidoGuardado.id)
  await db.rpc("tomar_pedidos_de_diseno")
  const base = `${marcaId}/${crypto.randomUUID()}`
  const laminas = (pedidoGuardado.diseno as { laminas: unknown[] }).laminas.length
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
    p_pedido: pedidoGuardado.id,
    p_archivo_ruta: `${base}.pdf`,
    p_archivo_sha256: "d".repeat(64),
  })
  if (guardado.error) throw new Error(`No pude guardar el carrusel: ${guardado.error.message}`)
  const piezaId = (guardado.data as { pieza: string }).pieza

  await page.goto(`/piezas/${piezaId}`)
  await expect(page.getByRole("list", { name: "Láminas del carrusel" }).getByRole("img")).toHaveCount(laminas)
  await expect(page.getByRole("img", { name: `Lámina 1 de ${laminas}` })).toBeAttached()
  await expect(page.getByRole("link", { name: "Descargar el PDF" })).toHaveCount(0)
  await expect(page.getByText("Un carrusel para probar el editor.")).toBeVisible()

  await page
    .locator("summary")
    .filter({ hasText: /^Cambiar$/ })
    .click()
  await page.getByRole("link", { name: "Editar el carrusel" }).click()
  await expect(page.getByRole("heading", { name: "Editar carrusel" })).toBeVisible()
  await expect(page.getByLabel("Texto del post")).toHaveValue("Un carrusel para probar el editor.")
  await expect(page.getByRole("combobox", { name: "Cuenta" })).toBeDisabled()
})

test("the empty carousel editor is gone", async ({ page, request }) => {
  const correo = correoUnico("e2e-sin-editor")
  await invitar(admin(), { correo, marca: `Marca ${correo}`, voz: "yo" })
  await entrar(page, request, correo)
  await page.goto("/piezas/carrusel")
  await expect(page.getByRole("heading", { name: "No encontré esta página" })).toBeVisible()
})
