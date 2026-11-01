import { expect, test } from "@playwright/test"
import { invitar } from "@/lib/equipo/invitar"
import { admin, correoUnico, literal } from "../integration/entorno"
import { entrar } from "./ingreso"

/** Random unit vector: nearly orthogonal to anything already in the map, so guardar_hallazgo never calls it a repeat. */
function vectorAlAzar(): number[] {
  const v = Array.from({ length: 1024 }, () => Math.random() - 0.5)
  const norma = Math.hypot(...v)
  return v.map((x) => x / norma)
}

test("an owner asks for research, and approves its report after discarding a finding", async ({ page, request }) => {
  const db = admin()
  // The open limit and the job queue are global: start with nothing open. Local test database only.
  await db
    .from("trabajos_de_investigacion")
    .update({ estado: "fallo", motivo: "Cerrado entre pruebas.", arrendado_hasta: null })
    .in("estado", ["pendiente", "trabajando"])
  await db
    .from("investigaciones")
    .update({ estado: "fallo", motivo: "Cerrada entre pruebas." })
    .in("estado", ["en_cola", "investigando"])

  const correo = correoUnico("e2e-investigar")
  await invitar(db, { correo, marca: `Marca ${correo}`, voz: "nosotros" })
  const tema = `Focus groups ${crypto.randomUUID().slice(0, 8)}`

  await entrar(page, request, correo)
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Investigar" }).click()
  await expect(page.getByRole("heading", { name: "Investigar" })).toBeVisible()
  // The form sits behind «Nueva investigación» unless the list is empty.
  const nueva = page.getByRole("button", { name: "Nueva investigación" })
  if (await nueva.isVisible()) await nueva.click()
  await expect(page.getByText("Cada investigación busca en la web y cuesta cerca de US$1.")).toBeVisible()
  await page.getByLabel("¿Qué quieres investigar?").fill(tema)
  await page.getByRole("button", { name: "Investigar", exact: true }).click()
  const lista = page.locator("section", { has: page.getByRole("heading", { name: "Investigaciones" }) })
  const item = page.getByRole("link", { name: new RegExp(tema) })
  await expect(item).toContainText("En cola")
  await expect(lista.getByText("Se está investigando. Esta página se actualiza sola.")).toBeVisible()

  // No Trigger.dev in e2e: stand in for atender-investigaciones with its service-role RPCs.
  const { data: investigacion } = await db.from("investigaciones").select("id").eq("tema", tema).single()
  if (!investigacion) throw new Error("No quedó la investigación")
  const tomado = await db.rpc("tomar_trabajo_de_investigacion")
  if (tomado.error || tomado.data[0]?.investigacion_id !== investigacion.id)
    throw new Error(`No pude tomar el trabajo: ${tomado.error?.message ?? "tomé otro"}`)
  for (const [n, resumen] of [
    [1, "Un focus group cuesta menos de lo que se cree."],
    [2, "Los grupos online crecen cada año."],
  ] as const) {
    const enlace = `https://medio${n}.cl/${crypto.randomUUID()}`
    const guardado = await db.rpc("guardar_hallazgo", {
      p_resumen: resumen,
      p_enlace: enlace,
      p_enlace_normalizado: enlace.replace(/^https?:\/\//, ""),
      p_medio: `Medio ${n}`,
      p_vector: literal(vectorAlAzar()),
      p_umbral_repetido: 0.95,
      p_umbral_tema: 0.8,
      p_cita: n === 1 ? "Menos de lo que se cree" : undefined,
      p_publicado_en: "2026-10-20",
      p_investigacion: investigacion.id,
      p_angulo: "Presupuesto",
    })
    if (guardado.error) throw new Error(`No pude guardar el hallazgo: ${guardado.error.message}`)
  }
  const cierre = await db.rpc("cerrar_investigacion", {
    p_investigacion: investigacion.id,
    p_angulos: [{ nombre: "Presupuesto", por_que: "Lo que cuesta un focus group." }],
    p_repetidos: 3,
    p_descartados: 2,
  })
  if (cierre.error) throw new Error(`No pude cerrar la investigación: ${cierre.error.message}`)
  const fin = await db.rpc("terminar_trabajo_de_investigacion", { p_trabajo: tomado.data[0].id, p_estado: "hecho" })
  if (fin.error) throw new Error(`No pude terminar el trabajo: ${fin.error.message}`)

  await page.reload()
  // A report waiting for approval leads the page, above the form and the list.
  const porAprobar = page.locator("section", { has: page.getByRole("heading", { name: "Por aprobar" }) })
  await expect(porAprobar.getByRole("link", { name: new RegExp(tema) })).toContainText("Informe listo")
  await expect(item).toContainText("2 hallazgos")
  await item.click()
  await expect(page.getByRole("heading", { name: tema })).toBeVisible()
  const angulo = page.getByRole("region", { name: "Presupuesto" })
  await expect(angulo.getByRole("heading", { name: "Presupuesto" })).toBeVisible()
  await expect(angulo.getByText("Lo que cuesta un focus group.")).toBeVisible()
  await expect(angulo.getByText("«Menos de lo que se cree»")).toBeVisible()
  const enlace = angulo.getByRole("link", { name: "Medio 1 · 20 de octubre de 2026" })
  await expect(enlace).toHaveAttribute("target", "_blank")
  await expect(enlace).toHaveAttribute("rel", "noopener noreferrer")
  await expect(angulo.getByRole("listitem", { name: "Hallazgo" })).toHaveCount(2)
  await expect(page.getByText("3 ya estaban en el mapa")).toBeVisible()
  await expect(page.getByText("2 fuentes descartadas (inventadas o de LinkedIn)")).toBeVisible()

  await angulo
    .getByRole("listitem", { name: "Hallazgo" })
    .filter({ hasText: "Los grupos online crecen cada año." })
    .getByRole("button", { name: "Descartar" })
    .click()
  const descartado = angulo.getByRole("listitem", { name: "Hallazgo descartado" })
  await expect(descartado).toContainText("Los grupos online crecen cada año.")
  await expect(descartado).toContainText("Descartado")
  await expect(angulo.getByRole("listitem").last()).toContainText("Los grupos online crecen cada año.")

  await expect(page.getByText(/^PostIA arma \d+ propuestas? \(cerca de US\$\d+,\d{2}\)\.$/)).toBeVisible()
  await page.getByRole("button", { name: "Aprobar informe" }).click()
  await expect(page.getByText("Aprobada", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Aprobar informe" })).toHaveCount(0)
  // Approving queued its series: the report now leads to it.
  await expect(page.getByRole("link", { name: "Ver la serie" })).toHaveAttribute(
    "href",
    `/ideas?serie=${investigacion.id}`,
  )
})
