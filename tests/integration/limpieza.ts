import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { admin } from "./entorno"

const DOMINIO_DE_PRUEBA = "@prueba.postia.test"

/**
 * The integration tests share the local database with the dev app, so whatever they create is removed before and
 * after each run: only users with the test domain, their connections, and brands no real user belongs to.
 */
async function limpiarDatosDePrueba(): Promise<void> {
  const db = admin()
  const { data: lista, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`No pude listar usuarios de prueba: ${error.message}`, { cause: error })
  const dePrueba = lista.users.filter((u) => u.email?.endsWith(DOMINIO_DE_PRUEBA)).map((u) => u.id)
  const reales = lista.users.filter((u) => !u.email?.endsWith(DOMINIO_DE_PRUEBA)).map((u) => u.id)

  // Exceptions outlive their author (set null) and block their case (restrict): test ones go before both.
  const { error: errorDeExcepcionesDeCasos } = await db.from("excepciones").delete().like("caso_slug", "prueba-%")
  if (errorDeExcepcionesDeCasos) {
    throw new Error(`No pude borrar excepciones de prueba: ${errorDeExcepcionesDeCasos.message}`)
  }

  // The spend ledger has no foreign key to test users: test keys and test months are removed by name.
  const { error: errorDeGastos } = await db.from("gastos").delete().like("clave", "prueba:%")
  if (errorDeGastos) throw errorDeGastos
  const { error: errorDeAvisosDeTope } = await db.from("avisos_de_tope").delete().gte("mes", "2400-01-01")
  if (errorDeAvisosDeTope) throw errorDeAvisosDeTope
  const { error: errorDeTopes } = await db.from("topes").delete().gte("desde_mes", "2400-01-01")
  if (errorDeTopes) throw errorDeTopes

  // conexiones.conectada_por has no cascade: they go before their users. In batches: a full run leaves hundreds of
  // test users, too many ids for one URL.
  for (let i = 0; i < dePrueba.length; i += 50) {
    const lote = dePrueba.slice(i, i + 50)
    const { error: errorDeExcepciones } = await db.from("excepciones").delete().in("puesta_por", lote)
    if (errorDeExcepciones) throw new Error(`No pude borrar excepciones de prueba: ${errorDeExcepciones.message}`)
    const { error: errorDeTopesPuestos } = await db.from("topes").delete().in("puesto_por", lote)
    if (errorDeTopesPuestos) throw errorDeTopesPuestos
    // Research requests are not per brand (D17): they hang from their author, with no cascade. A series idea must keep
    // its research (serie_con_investigacion), so the ideas go first.
    const { data: investigaciones, error: errorAlLeerInvestigaciones } = await db
      .from("investigaciones")
      .select("id")
      .in("pedida_por", lote)
    if (errorAlLeerInvestigaciones) throw errorAlLeerInvestigaciones
    const idsDeInvestigaciones = investigaciones.map((i) => i.id)
    for (let j = 0; j < idsDeInvestigaciones.length; j += 50) {
      const { error: errorDeIdeas } = await db
        .from("ideas")
        .delete()
        .in("investigacion_id", idsDeInvestigaciones.slice(j, j + 50))
      if (errorDeIdeas) throw errorDeIdeas
    }
    const { error: errorDeInvestigaciones } = await db.from("investigaciones").delete().in("pedida_por", lote)
    if (errorDeInvestigaciones) throw errorDeInvestigaciones
    const { error: errorDeConexiones } = await db.from("conexiones").delete().in("conectada_por", lote)
    if (errorDeConexiones) throw new Error(`No pude borrar conexiones de prueba: ${errorDeConexiones.message}`)
  }

  const { data: miembrosReales, error: errorDeMiembros } = await db
    .from("miembros")
    .select("marca_id")
    .in("user_id", reales.length > 0 ? reales : ["00000000-0000-0000-0000-000000000000"])
  if (errorDeMiembros) throw new Error(`No pude leer las marcas reales: ${errorDeMiembros.message}`)
  const marcasReales = [...new Set(miembrosReales.map((m) => m.marca_id))]
  const borrarMarcas = db.from("marcas").delete()
  const { error: errorDeMarcas } = await (marcasReales.length > 0
    ? borrarMarcas.not("id", "in", `(${marcasReales.join(",")})`)
    : borrarMarcas.not("id", "is", null))
  if (errorDeMarcas) throw new Error(`No pude borrar marcas de prueba: ${errorDeMarcas.message}`)

  await borrarArchivosHuerfanos()

  // Cases are shared by every brand: test rows are told apart by slug, real ones loaded by pnpm cargar:casos stay.
  const { error: errorDeCasos } = await db.from("casos").delete().like("slug", "prueba-%")
  if (errorDeCasos) throw new Error(`No pude borrar casos de prueba: ${errorDeCasos.message}`)

  for (const id of dePrueba) {
    const { error: errorDeUsuario } = await db.auth.admin.deleteUser(id)
    if (errorDeUsuario) throw new Error(`No pude borrar un usuario de prueba: ${errorDeUsuario.message}`)
  }
}

/** Storage objects have no foreign key to brands: the folders of deleted test brands are removed through the API. */
async function borrarArchivosHuerfanos(): Promise<void> {
  const db = admin()
  const { data: marcas, error: errorDeMarcas } = await db.from("marcas").select("id")
  if (errorDeMarcas) throw new Error(`No pude leer las marcas: ${errorDeMarcas.message}`)
  const vigentes = new Set(marcas.map((m) => m.id))
  const bucket = db.storage.from("piezas")
  const { data: carpetas, error: errorDeCarpetas } = await bucket.list("", { limit: 1000 })
  if (errorDeCarpetas) throw new Error(`No pude listar los archivos de prueba: ${errorDeCarpetas.message}`)
  for (const carpeta of carpetas.filter((c) => !vigentes.has(c.name))) await borrarCarpeta(carpeta.name)
}

/** Slide previews live one level down (<marca>/<archivo>/NN.jpg); list() shows a subfolder as an entry without id. */
async function borrarCarpeta(ruta: string): Promise<void> {
  const bucket = admin().storage.from("piezas")
  const { data: entradas, error: errorDeArchivos } = await bucket.list(ruta, { limit: 1000 })
  if (errorDeArchivos) throw new Error(`No pude listar ${ruta}: ${errorDeArchivos.message}`)
  for (const subcarpeta of entradas.filter((e) => e.id === null)) await borrarCarpeta(`${ruta}/${subcarpeta.name}`)
  const archivos = entradas.filter((e) => e.id !== null)
  if (archivos.length === 0) return
  const { error: errorAlBorrar } = await bucket.remove(archivos.map((a) => `${ruta}/${a.name}`))
  if (errorAlBorrar) throw new Error(`No pude borrar archivos de prueba: ${errorAlBorrar.message}`)
}

const ARCHIVO_DE_CANDADO = join(tmpdir(), "postia-test-db.lock")

function procesoVive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (causa) {
    // EPERM: the process exists but belongs to someone else.
    if (causa instanceof Error && "code" in causa && causa.code === "EPERM") return true
    return false
  }
}

/** The cleanup deletes every test brand, so two runs at once would delete each other's data: one run at a time. */
function tomarCandado(): void {
  try {
    writeFileSync(ARCHIVO_DE_CANDADO, String(process.pid), { flag: "wx" })
    return
  } catch (causa) {
    if (!(causa instanceof Error && "code" in causa && causa.code === "EEXIST")) throw causa
  }
  const pid = Number(readFileSync(ARCHIVO_DE_CANDADO, "utf8"))
  if (Number.isInteger(pid) && pid > 0 && procesoVive(pid)) {
    throw new Error("Otra corrida de test:db está en curso; espera a que termine.")
  }
  // The previous run died without releasing it.
  rmSync(ARCHIVO_DE_CANDADO, { force: true })
  writeFileSync(ARCHIVO_DE_CANDADO, String(process.pid), { flag: "wx" })
}

export default async function () {
  tomarCandado()
  try {
    await limpiarDatosDePrueba()
  } catch (causa) {
    rmSync(ARCHIVO_DE_CANDADO, { force: true })
    throw causa
  }
  return async () => {
    try {
      await limpiarDatosDePrueba()
    } finally {
      rmSync(ARCHIVO_DE_CANDADO, { force: true })
    }
  }
}
