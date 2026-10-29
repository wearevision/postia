import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { Falla } from "@/lib/dominio/falla"
import { leerPdf } from "@/lib/fase0/pdf-de-prueba"
import { fechaLarga } from "@/lib/piezas/fechas"
import { proponerFecha } from "@/lib/piezas/horarios"
import { huellaDe, sha256 } from "@/lib/piezas/huella"
import { type EntradaDeCopy, leerCopy } from "@/lib/piezas/importar"
import { horariosOcupados, leerTipo } from "@/lib/piezas/lectura"
import { BYTES_MAXIMOS_DEL_CARRUSEL } from "@/lib/piezas/limites"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Db } from "@/lib/supabase/database"

const CARPETA_POR_DEFECTO = join(homedir(), "Projects/wr3-web/social/linkedin/out")
const MARCA = "WAV"
const CUENTA = "Página de WAV"

interface Cuenta {
  id: string
  marcaId: string
  tipo: "persona" | "empresa"
}

interface Plan {
  ocupados: number[]
  ahora: number
}

async function main() {
  const { values } = parseArgs({
    options: { correo: { type: "string" }, carpeta: { type: "string" } },
  })
  const correo = (values.correo ?? "federico@wearevision.cl").trim().toLowerCase()
  const carpeta = values.carpeta ?? CARPETA_POR_DEFECTO
  const db = createAdminClient()

  const entradas = leerCopy(await leer(join(carpeta, "copy.md")))
  const cuenta = await buscarCuenta(db)
  const userId = await buscarUsuario(db, correo)

  // Each piece takes the next free slot of the page: slots already held count, and so do the ones taken in this run.
  const plan: Plan = { ocupados: await horariosOcupados(db, cuenta.id, Date.now()), ahora: Date.now() }

  for (const entrada of entradas) {
    const { resultado, planeadaPara } = await cargar(db, cuenta, userId, entrada, carpeta, plan)
    const cuando = planeadaPara ? fechaLarga(planeadaPara) : "sin fecha"
    console.log(`${resultado === "nueva" ? "nueva    " : "ya estaba"}  ${cuando}  ${entrada.titulo}`)
  }
}

async function leer(ruta: string): Promise<string> {
  try {
    return await readFile(ruta, "utf8")
  } catch (error) {
    throw new Falla(`No pude leer ${ruta}: ${error instanceof Error ? error.message : "sin detalle"}`)
  }
}

async function buscarCuenta(db: Db): Promise<Cuenta> {
  const { data: marca, error } = await db.from("marcas").select("id").eq("nombre", MARCA).maybeSingle()
  if (error) throw new Error(`No pude buscar la marca ${MARCA}: ${error.message}`, { cause: error })
  if (!marca) throw new Falla(`No existe la marca «${MARCA}». Créala con pnpm invitar antes de cargar.`)
  const { data: cuenta, error: errorDeCuenta } = await db
    .from("cuentas")
    .select("id, tipo")
    .eq("marca_id", marca.id)
    .eq("nombre", CUENTA)
    .maybeSingle()
  if (errorDeCuenta)
    throw new Error(`No pude buscar la cuenta ${CUENTA}: ${errorDeCuenta.message}`, { cause: errorDeCuenta })
  if (!cuenta) throw new Falla(`La marca «${MARCA}» no tiene la cuenta «${CUENTA}».`)
  return { id: cuenta.id, marcaId: marca.id, tipo: leerTipo(cuenta.tipo) }
}

async function buscarUsuario(db: Db, correo: string): Promise<string> {
  // The admin API has no lookup by email; the team is a handful of people, so one page holds everyone.
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`No pude listar usuarios: ${error.message}`, { cause: error })
  const usuario = data.users.find((u) => u.email?.toLowerCase() === correo)
  if (!usuario) throw new Falla(`No existe un usuario con el correo ${correo}.`)
  return usuario.id
}

interface PiezaExistente {
  id: string
  estado: string
  planeadaPara: string | null
}

async function piezaExistente(db: Db, cuentaId: string, hash: string): Promise<PiezaExistente | null> {
  const { data: piezas, error } = await db.from("piezas").select("id, estado, planeada_para").eq("cuenta_id", cuentaId)
  if (error) throw new Error(`No pude leer las piezas: ${error.message}`, { cause: error })
  if (piezas.length === 0) return null
  const { data, error: errorDeVersiones } = await db
    .from("versiones")
    .select("pieza_id")
    .eq("archivo_sha256", hash)
    .in(
      "pieza_id",
      piezas.map((p) => p.id),
    )
    .limit(1)
  if (errorDeVersiones)
    throw new Error(`No pude leer las versiones: ${errorDeVersiones.message}`, { cause: errorDeVersiones })
  const pieza = piezas.find((p) => p.id === data[0]?.pieza_id)
  return pieza ? { id: pieza.id, estado: pieza.estado, planeadaPara: pieza.planeada_para } : null
}

/** The next free slot of the page. It is reserved in `plan` so the next piece of this run takes the one after. */
function siguienteHueco(cuenta: Cuenta, plan: Plan): string {
  const hueco = proponerFecha(cuenta.tipo, plan.ocupados, plan.ahora)
  plan.ocupados.push(hueco.getTime())
  return hueco.toISOString()
}

async function cargar(
  db: Db,
  cuenta: Cuenta,
  userId: string,
  entrada: EntradaDeCopy,
  carpeta: string,
  plan: Plan,
): Promise<{ resultado: "nueva" | "ya estaba"; planeadaPara: string | null }> {
  let datos: Uint8Array
  try {
    datos = new Uint8Array(await readFile(join(carpeta, entrada.pdf)))
  } catch (error) {
    throw new Falla(
      `«${entrada.titulo}»: no pude leer ${entrada.pdf} (${error instanceof Error ? error.message : "sin detalle"}).`,
    )
  }
  if (datos.byteLength > BYTES_MAXIMOS_DEL_CARRUSEL) {
    throw new Falla(
      `«${entrada.titulo}»: ${entrada.pdf} pasa el tope de ${BYTES_MAXIMOS_DEL_CARRUSEL / 1024 / 1024} MB.`,
    )
  }
  await leerPdf(datos)
  const hash = sha256(datos)
  const existente = await piezaExistente(db, cuenta.id, hash)
  if (existente) {
    // Only a piece still waiting for its signature and with no slot gets one; the guard watches state, not this column.
    if (existente.estado === "por_aprobar" && existente.planeadaPara === null) {
      const planeadaPara = siguienteHueco(cuenta, plan)
      const { error } = await db.from("piezas").update({ planeada_para: planeadaPara }).eq("id", existente.id)
      if (error) throw new Error(`«${entrada.titulo}»: no pude planear la pieza: ${error.message}`, { cause: error })
      return { resultado: "ya estaba", planeadaPara }
    }
    return { resultado: "ya estaba", planeadaPara: existente.planeadaPara }
  }

  const ruta = `${cuenta.marcaId}/${randomUUID()}.pdf`
  const { error: errorDeSubida } = await db.storage
    .from("piezas")
    .upload(ruta, datos, { contentType: "application/pdf" })
  if (errorDeSubida)
    throw new Error(`«${entrada.titulo}»: no pude subir el PDF: ${errorDeSubida.message}`, { cause: errorDeSubida })

  const planeadaPara = siguienteHueco(cuenta, plan)
  try {
    await crearPieza(db, cuenta.id, userId, entrada, ruta, hash, planeadaPara)
  } catch (error) {
    const { error: errorAlBorrar } = await db.storage.from("piezas").remove([ruta])
    console.error(
      errorAlBorrar
        ? `No pude borrar el PDF subido ${ruta}: ${errorAlBorrar.message}`
        : `Borré el PDF subido ${ruta} porque la pieza no se creó.`,
    )
    throw error
  }
  return { resultado: "nueva", planeadaPara }
}

async function crearPieza(
  db: Db,
  cuentaId: string,
  userId: string,
  entrada: EntradaDeCopy,
  ruta: string,
  hash: string,
  planeadaPara: string,
): Promise<void> {
  const { data: pieza, error } = await db
    .from("piezas")
    .insert({ cuenta_id: cuentaId, formato: "carrusel_pdf", creada_por: userId, planeada_para: planeadaPara })
    .select("id")
    .single()
  if (error) throw new Error(`«${entrada.titulo}»: no pude crear la pieza: ${error.message}`, { cause: error })
  const { error: errorDeVersion } = await db.from("versiones").insert({
    pieza_id: pieza.id,
    numero: 1,
    texto: entrada.texto,
    titulo: entrada.titulo,
    archivo_ruta: ruta,
    archivo_sha256: hash,
    // The trigger recomputes it; the generated insert type just requires the column.
    huella: huellaDe({ formato: "carrusel_pdf", titulo: entrada.titulo, archivoSha256: hash, texto: entrada.texto }),
    creada_por: userId,
  })
  if (errorDeVersion) {
    // Without its version the piece is an empty shell: remove it so a retry starts clean.
    const { error: errorAlBorrar } = await db.from("piezas").delete().eq("id", pieza.id)
    if (errorAlBorrar) console.error(`No pude borrar la pieza ${pieza.id} sin versión: ${errorAlBorrar.message}`)
    throw new Error(`«${entrada.titulo}»: no pude crear la versión: ${errorDeVersion.message}`, {
      cause: errorDeVersion,
    })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Falla ? error.message : error)
  process.exitCode = 1
})
