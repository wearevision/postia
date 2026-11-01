import { expect, test } from "@playwright/test"
import { invitar } from "@/lib/equipo/invitar"
import { semanaDe } from "@/lib/piezas/calendario"
import { admin, correoUnico, literal } from "../integration/entorno"
import { entrar } from "./ingreso"

/** Random unit vector: nearly orthogonal to every other idea, so nothing reads as a repeat. */
function vectorAlAzar(): number[] {
  const v = Array.from({ length: 1024 }, () => Math.random() - 0.5)
  const norma = Math.hypot(...v)
  return v.map((x) => x / norma)
}

test("an owner reviews a series: approves one idea, discards the other, and sees it planned", async ({
  page,
  request,
}) => {
  const db = admin()
  const correo = correoUnico("e2e-ideas")
  const { userId, marcaId } = await invitar(db, { correo, marca: `Marca ${correo}`, voz: "nosotros" })
  const nombreDeCuenta = `Página ${crypto.randomUUID().slice(0, 8)}`
  const { data: cuenta, error: errorDeCuenta } = await db
    .from("cuentas")
    .insert({ marca_id: marcaId, red: "linkedin", tipo: "empresa", ruta: "a_mano", nombre: nombreDeCuenta })
    .select("id")
    .single()
  if (errorDeCuenta) throw errorDeCuenta

  // No Trigger.dev in e2e: an approved report and the series job's result, saved as the worker would.
  const tema = `Focus groups ${crypto.randomUUID().slice(0, 8)}`
  const { data: inv, error: errorDeInforme } = await db
    .from("investigaciones")
    .insert({ origen: "encargo", tema, cantidad: 3, formato: "texto", pedida_por: userId, estado: "aprobada" })
    .select("id")
    .single()
  if (errorDeInforme) throw errorDeInforme
  const enlace = `https://medio.cl/${crypto.randomUUID()}`
  const { data: hallazgo, error: errorDeHallazgo } = await db
    .from("hallazgos")
    .insert({
      resumen: "Un focus group cuesta menos de lo que se cree.",
      enlace,
      enlace_normalizado: enlace.replace(/^https:\/\//, ""),
      medio: "La Tercera",
      publicado_en: "2026-10-20",
      vector: literal(vectorAlAzar()),
      investigacion_id: inv.id,
      angulo: "Presupuesto",
    })
    .select("id")
    .single()
  if (errorDeHallazgo) throw errorDeHallazgo
  const idea = (gancho: string) => ({
    gancho,
    resumen: `Resumen de ${gancho}`,
    formato: "texto",
    esqueleto: [{ idea: "El mito" }, { idea: "Lo que dicen los datos" }],
    fuentes: [hallazgo.id],
    cuenta: cuenta.id,
    razon: "Habla de investigación, que es lo de WAV.",
    pilar: null,
    vector: literal(vectorAlAzar()),
  })
  const guardada = await db.rpc("guardar_serie", {
    p_investigacion: inv.id,
    p_ideas: [idea("Los focus groups no mueren"), idea("Cuánto cuesta un focus group")],
  })
  if (guardada.error) throw new Error(`No pude guardar la serie: ${guardada.error.message}`)

  await entrar(page, request, correo)
  await page.getByRole("link", { name: "Ideas", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Ideas y series" })).toBeVisible()
  // Ideas opens on what waits for a decision; «Todas» is a link to every state.
  await expect(page.getByRole("link", { name: "Por revisar", exact: true })).toHaveAttribute("aria-current", "page")
  await expect(page.getByRole("link", { name: "Todas", exact: true })).toHaveAttribute("href", "/ideas?estado=todas")
  const serie = page.getByRole("region", { name: tema })
  await expect(serie.getByText("Salieron 2 de las 3 pedidas.")).toBeVisible()
  await expect(serie.getByRole("button", { name: "Aprobar la serie" })).toBeVisible()

  const primera = serie.getByRole("article", { name: "Los focus groups no mueren" })
  const segunda = serie.getByRole("article", { name: "Cuánto cuesta un focus group" })
  // The card is compact: the «Para:» chip names the account and the rest sits behind «Ver detalle».
  await expect(primera.getByRole("button", { name: `Para: ${nombreDeCuenta}` })).toBeVisible()
  await expect(primera.getByText("Por qué: Habla de investigación, que es lo de WAV.")).toHaveCount(0)
  await primera.getByRole("button", { name: "Ver detalle" }).click()
  await expect(primera.getByText("Por qué: Habla de investigación, que es lo de WAV.")).toBeVisible()
  await expect(primera.getByRole("link", { name: "La Tercera · 20 de octubre de 2026" })).toHaveAttribute(
    "target",
    "_blank",
  )
  await expect(primera.getByRole("checkbox", { name: nombreDeCuenta })).toBeChecked()

  await primera.getByRole("button", { name: "Aprobar" }).click()
  await expect(primera.getByText(/Se aprueba en \d+ s/)).toBeVisible()
  // Approved, it leaves «Por revisar».
  await expect(primera).toHaveCount(0, { timeout: 15_000 })

  await segunda.getByRole("button", { name: "Descartar" }).click()
  await expect(segunda).toHaveCount(0)

  await page.getByRole("link", { name: "Todas", exact: true }).click()
  await expect(page).toHaveURL(/estado=todas/)
  const pieza = primera.getByRole("listitem", { name: nombreDeCuenta })
  await expect(pieza.getByText("Por escribir")).toBeVisible()
  await expect(pieza.getByRole("button", { name: "Mover fecha" })).toBeVisible()
  await expect(primera.getByRole("button", { name: "Aprobar" })).toHaveCount(0)
  await expect(segunda.getByText("Descartada")).toBeVisible()
  await expect(serie.getByRole("button", { name: "Aprobar la serie" })).toHaveCount(0)

  const { data: asignacion } = await db.from("asignaciones").select("planeada_para").eq("cuenta_id", cuenta.id).single()
  if (!asignacion) throw new Error("No quedó la asignación")
  await page.goto(`/calendario?semana=${semanaDe(Date.parse(asignacion.planeada_para)).lunes}`)
  const enCalendario = page
    .getByRole("region", { name: nombreDeCuenta })
    .getByRole("link", { name: /Por escribir · Los focus groups no mueren/ })
  await expect(enCalendario).toBeVisible()
  await enCalendario.click()
  await expect(page.getByRole("article", { name: "Los focus groups no mueren" })).toBeVisible()

  // Open assignments are leased globally by escribir-piezas: leave none behind. Local test database only.
  await db.from("asignaciones").update({ estado: "descartada" }).eq("cuenta_id", cuenta.id)
})

test("an owner sees a cross under «Cruces» with both of its sources and approves it", async ({ page, request }) => {
  const db = admin()
  const correo = correoUnico("e2e-cruces")
  const { marcaId } = await invitar(db, { correo, marca: `Marca ${correo}`, voz: "yo" })
  const nombreDeCuenta = `Perfil ${crypto.randomUUID().slice(0, 8)}`
  const { data: cuenta, error: errorDeCuenta } = await db
    .from("cuentas")
    .insert({ marca_id: marcaId, red: "linkedin", tipo: "persona", ruta: "a_mano", nombre: nombreDeCuenta })
    .select("id")
    .single()
  if (errorDeCuenta) throw errorDeCuenta

  // No Trigger.dev in e2e: two findings of the map and the crossing step's result, saved as the worker would.
  const hallazgo = async (medio: string, resumen: string) => {
    const enlace = `https://medio.cl/${crypto.randomUUID()}`
    const { data, error } = await db
      .from("hallazgos")
      .insert({
        resumen,
        enlace,
        enlace_normalizado: enlace.replace(/^https:\/\//, ""),
        medio,
        publicado_en: "2026-10-22",
        vector: literal(vectorAlAzar()),
      })
      .select("id, enlace")
      .single()
    if (error) throw error
    return data
  }
  const retail = await hallazgo("La Tercera", "El retail mide la experiencia en cada visita.")
  const mineria = await hallazgo("Diario Financiero", "La minería empieza a medir a sus comunidades.")
  const gancho = `Lo que el retail le enseña a la minería ${crypto.randomUUID().slice(0, 8)}`
  const guardada = await db.rpc("guardar_ideas_sueltas", {
    p_origen: "cruce",
    p_ideas: [
      {
        gancho,
        resumen: "Dos industrias que miden lo mismo sin saberlo.",
        formato: "texto",
        esqueleto: [{ idea: "Lo que dice uno" }, { idea: "Lo que dice el otro" }],
        fuentes: [retail.id, mineria.id],
        cuenta: cuenta.id,
        razon: "Es una mirada personal sobre investigación.",
        pilar: null,
        vector: literal(vectorAlAzar()),
      },
    ],
  })
  if (guardada.error) throw new Error(`No pude guardar el cruce: ${guardada.error.message}`)

  await entrar(page, request, correo)
  await page.getByRole("link", { name: "Ideas", exact: true }).click()
  const cruces = page.getByRole("region", { name: "Cruces" })
  const cruce = cruces.getByRole("article", { name: gancho })
  await expect(cruce).toBeVisible()
  await cruce.getByRole("button", { name: "Ver detalle" }).click()
  const origen = cruce.getByRole("list", { name: "Nace de:" })
  await expect(origen.getByRole("link", { name: "La Tercera · 22 de octubre de 2026" })).toHaveAttribute(
    "href",
    retail.enlace,
  )
  await expect(origen.getByRole("link", { name: "Diario Financiero · 22 de octubre de 2026" })).toHaveAttribute(
    "target",
    "_blank",
  )
  await expect(origen.getByText("La minería empieza a medir a sus comunidades.")).toBeVisible()

  await cruce.getByRole("button", { name: "Aprobar" }).click()
  await expect(cruce.getByText(/Se aprueba en \d+ s/)).toBeVisible()
  // Approved, it leaves «Por revisar»: «Todas» shows its slot.
  await expect(cruce).toHaveCount(0, { timeout: 15_000 })
  await page.getByRole("link", { name: "Todas", exact: true }).click()
  await expect(cruce.getByRole("listitem", { name: nombreDeCuenta }).getByText("Por escribir")).toBeVisible()
  await expect(cruce.getByRole("button", { name: "Aprobar" })).toHaveCount(0)

  // Open assignments are leased globally by escribir-piezas: leave none behind. Local test database only.
  await db.from("asignaciones").update({ estado: "descartada" }).eq("cuenta_id", cuenta.id)
})
