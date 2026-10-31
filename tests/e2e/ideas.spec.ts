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
  await page.getByRole("link", { name: "Ideas y series" }).click()
  await expect(page.getByRole("heading", { name: "Ideas y series" })).toBeVisible()
  const serie = page.getByRole("region", { name: tema })
  await expect(serie.getByText("Salieron 2 de las 3 pedidas.")).toBeVisible()
  await expect(serie.getByRole("button", { name: "Aprobar la serie" })).toBeVisible()

  const primera = serie.getByRole("article", { name: "Los focus groups no mueren" })
  const segunda = serie.getByRole("article", { name: "Cuánto cuesta un focus group" })
  await expect(primera.getByText("Por qué: Habla de investigación, que es lo de WAV.")).toBeVisible()
  await expect(primera.getByRole("link", { name: "La Tercera · 20 de octubre de 2026" })).toHaveAttribute(
    "target",
    "_blank",
  )
  await expect(primera.getByRole("checkbox", { name: nombreDeCuenta })).toBeChecked()

  await primera.getByRole("button", { name: "Aprobar" }).click()
  const pieza = primera.getByRole("listitem", { name: nombreDeCuenta })
  await expect(pieza.getByText("Por escribir")).toBeVisible()
  await expect(pieza.getByRole("button", { name: "Mover fecha" })).toBeVisible()
  await expect(primera.getByRole("button", { name: "Aprobar" })).toHaveCount(0)

  await segunda.getByRole("button", { name: "Descartar" }).click()
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
