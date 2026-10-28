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

  // conexiones.conectada_por has no cascade: they go before their users.
  if (dePrueba.length > 0) {
    const { error: errorDeConexiones } = await db.from("conexiones").delete().in("conectada_por", dePrueba)
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

  for (const id of dePrueba) {
    const { error: errorDeUsuario } = await db.auth.admin.deleteUser(id)
    if (errorDeUsuario) throw new Error(`No pude borrar un usuario de prueba: ${errorDeUsuario.message}`)
  }
}

export default async function () {
  await limpiarDatosDePrueba()
  return limpiarDatosDePrueba
}
