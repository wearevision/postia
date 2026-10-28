import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createInterface } from "node:readline/promises"
import { parseArgs } from "node:util"
import { Falla } from "@/lib/dominio/falla"
import { leerPdf, pdfDePrueba } from "@/lib/fase0/pdf-de-prueba"
import { type PedidoDePrueba, publicarPrueba } from "@/lib/fase0/prueba-linkedin"
import { crearPost, estadoDelDocumento, RespuestaDudosa, subirDocumento } from "@/lib/linkedin/api"
import { createAdminClient } from "@/lib/supabase/admin"

const USO =
  "Uso: pnpm prueba:linkedin texto --texto <archivo> --visibilidad PUBLIC|CONNECTIONS\n" +
  "     pnpm prueba:linkedin carrusel --texto <archivo> (--laminas <archivo> | --pdf <archivo>) --titulo <texto>\n" +
  "                                   --visibilidad PUBLIC|CONNECTIONS"

async function firmar(resumen: string): Promise<boolean> {
  console.log(`\n${resumen}\n`)
  const consola = createInterface({ input: process.stdin, output: process.stdout })
  const respuesta = await consola.question(
    "Escribe PUBLICAR para firmar y publicar en tu LinkedIn (cualquier otra cosa cancela): ",
  )
  consola.close()
  return respuesta.trim() === "PUBLICAR"
}

async function credencial() {
  const db = createAdminClient()
  const { data: cuentas, error } = await db
    .from("cuentas")
    .select("id, nombre")
    .eq("red", "linkedin")
    .eq("tipo", "persona")
    .eq("ruta", "api")
    .not("conexion_id", "is", null)
  if (error) throw new Error(`No pude leer las cuentas: ${error.message}`)
  const [cuenta, ...otras] = cuentas
  if (!cuenta || otras.length > 0) throw new Falla("Debe haber exactamente un perfil de LinkedIn conectado por API.")
  const { data, error: errorDeCredencial } = await db.rpc("credencial_de_cuenta", { p_cuenta: cuenta.id }).single()
  if (errorDeCredencial) throw new Error(`No pude leer la conexión: ${errorDeCredencial.message}`)
  console.log(`Cuenta: ${cuenta.nombre}`)
  return { token: data.token, titular: data.titular, expiraEn: data.expira_en }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      texto: { type: "string" },
      laminas: { type: "string" },
      pdf: { type: "string" },
      titulo: { type: "string" },
      visibilidad: { type: "string" },
    },
  })
  const [paso] = positionals
  const visibilidad = values.visibilidad
  if (
    (paso !== "texto" && paso !== "carrusel") ||
    !values.texto ||
    (visibilidad !== "PUBLIC" && visibilidad !== "CONNECTIONS")
  ) {
    console.error(USO)
    process.exitCode = 1
    return
  }
  const texto = await readFile(values.texto, "utf8")
  let pedido: PedidoDePrueba = { paso: "texto", texto, visibilidad }
  if (paso === "carrusel") {
    // Exactly one source: slides to render, or a carousel already designed elsewhere.
    if (!values.titulo || Boolean(values.laminas) === Boolean(values.pdf)) {
      console.error(USO)
      process.exitCode = 1
      return
    }
    let pdf: Uint8Array
    if (values.pdf) {
      const leido = await leerPdf(new Uint8Array(await readFile(values.pdf)))
      pdf = leido.datos
      console.log(`PDF de ${leido.paginas} páginas: ${values.pdf}. Ábrelo antes de firmar.`)
    } else {
      const laminas = (await readFile(values.laminas ?? "", "utf8"))
        .split(/\n\s*\n/)
        .map((l) => l.trim())
        .filter(Boolean)
      pdf = await pdfDePrueba(laminas)
      await mkdir(".fase0", { recursive: true })
      await writeFile(".fase0/carrusel-de-prueba.pdf", pdf)
      console.log(`PDF de ${laminas.length} láminas en .fase0/carrusel-de-prueba.pdf: ábrelo antes de firmar.`)
    }
    pedido = { paso: "carrusel", texto, pdf, titulo: values.titulo, visibilidad }
  }

  const resultado = await publicarPrueba(
    {
      api: { crearPost, subirDocumento, estadoDelDocumento },
      confirmar: firmar,
      esperar: (ms) => new Promise((listo) => setTimeout(listo, ms)),
      ahora: Date.now,
    },
    await credencial(),
    pedido,
  )
  switch (resultado.estado) {
    case "cancelada":
      console.log("Cancelado. No salió nada.")
      break
    case "publicada":
      console.log(`Publicado: ${resultado.enlace}`)
      break
    default:
      console.log(
        `LinkedIn no dejó listo el documento (${resultado.estado}, ${resultado.documento}). No se creó el post.`,
      )
  }
}

main().catch((error: unknown) => {
  if (error instanceof RespuestaDudosa) {
    console.error(
      "LinkedIn no respondió claro: puede que el post haya salido. Revisa tu perfil y NO lo vuelvas a correr.",
    )
  } else {
    console.error(error instanceof Error ? error.message : error)
  }
  process.exitCode = 1
})
