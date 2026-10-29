import { anotarAviso } from "@/lib/avisos/repositorio-de-avisos"
import { horariosOcupados, leerTipo } from "@/lib/piezas/lectura"
import { BYTES_MAXIMOS_DEL_CARRUSEL } from "@/lib/piezas/limites"
import type { Db } from "@/lib/supabase/database"
import type { PendienteSinFirma, PiezaParaPublicar, PuertosDePublicacion } from "./publicar"
import type { Ruta } from "./revision"

type PuertosDeBase = Pick<
  PuertosDePublicacion,
  | "tomarPendientes"
  | "sinRespuesta"
  | "credencial"
  | "descargar"
  | "reservarEnvio"
  | "cerrarEnvio"
  | "mover"
  | "vencidasSinFirma"
  | "horariosOcupados"
  | "cubrirConReserva"
  | "anotarAviso"
>

const LARGO_DE_EXTRACTO = 40
const PENDIENTES_POR_CORRIDA = 10

const MOTIVO_ILEGIBLE = "No pude leer la pieza para publicarla. Revísala y fírmala de nuevo."

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

function extractoDe(texto: string): string {
  const letras = [...texto.replace(/\s+/g, " ").trim()]
  return letras.length > LARGO_DE_EXTRACTO ? `${letras.slice(0, LARGO_DE_EXTRACTO - 1).join("")}…` : letras.join("")
}

function comoRuta(valor: string): Ruta {
  if (valor === "api" || valor === "metricool" || valor === "a_mano") return valor
  throw new Error(`Ruta de cuenta desconocida: ${valor}`)
}

function comoFormato(valor: string): PiezaParaPublicar["formato"] {
  if (valor === "texto" || valor === "carrusel_pdf") return valor
  throw new Error(`Formato de pieza desconocido: ${valor}`)
}

/** The publisher's ports over the service role. The state guard still applies: an illegal move throws. */
export function repositorioDePublicacion(db: Db): PuertosDeBase {
  async function mover(piezaId: string, a: "por_aprobar" | "a_mano" | "envio_dudoso", motivo: string) {
    if (a === "por_aprobar") {
      // A piece that came out of the reserve goes back to it; the database decides, atomically.
      const { error } = await db.rpc("devolver_pieza", { p_pieza: piezaId, p_motivo: motivo })
      if (error) fallo("No pude devolver la pieza a la puerta 1", error)
      return
    }
    const { error } = await db
      .from("piezas")
      .update({ estado: a, motivo, arrendada_hasta: null })
      .eq("id", piezaId)
      .select("id")
      .single()
    if (error) fallo(`No pude mover la pieza a ${a}`, error)
  }

  return {
    async tomarPendientes() {
      const { data: arrendadas, error } = await db.rpc("tomar_para_publicar")
      if (error) fallo("No pude tomar las piezas por publicar", error)
      if (arrendadas.length === 0) return []
      const { data: piezas, error: errorDeLectura } = await db
        .from("piezas")
        .select(
          "id, formato, programada_para, ventana_minutos, cuentas!inner(id, nombre, ruta, marca_id), versiones(id, numero, texto, titulo, archivo_ruta, archivo_sha256, huella), firmas(id, huella, vigente)",
        )
        .in(
          "id",
          arrendadas.map((a) => a.id),
        )
        .order("programada_para")
      if (errorDeLectura) fallo("No pude leer las piezas por publicar", errorDeLectura)
      const listas: PiezaParaPublicar[] = []
      for (const p of piezas) {
        try {
          const ultima = [...p.versiones].sort((a, b) => b.numero - a.numero)[0]
          if (!ultima) throw new Error("no tiene versiones")
          if (!p.programada_para) throw new Error("está arrendada sin fecha")
          const firma = p.firmas.find((f) => f.vigente)
          listas.push({
            id: p.id,
            marcaId: p.cuentas.marca_id,
            cuentaId: p.cuentas.id,
            cuentaNombre: p.cuentas.nombre,
            ruta: comoRuta(p.cuentas.ruta),
            formato: comoFormato(p.formato),
            programadaPara: p.programada_para,
            ventanaMinutos: p.ventana_minutos,
            version: {
              id: ultima.id,
              texto: ultima.texto,
              titulo: ultima.titulo,
              archivoRuta: ultima.archivo_ruta,
              archivoSha256: ultima.archivo_sha256,
              huella: ultima.huella,
            },
            firma: firma ? { id: firma.id, huella: firma.huella } : null,
          })
        } catch (error) {
          // One unreadable piece must not block the others: a person looks at it, and it leaves the lease.
          console.error(`No pude leer la pieza ${p.id}: ${error instanceof Error ? error.message : String(error)}`)
          try {
            await mover(p.id, "por_aprobar", MOTIVO_ILEGIBLE)
          } catch (errorAlMover) {
            const causa = errorAlMover instanceof Error ? errorAlMover.message : String(errorAlMover)
            console.error(`No pude apartar la pieza ${p.id}: ${causa}`)
          }
        }
      }
      return listas
    },

    async sinRespuesta(desde) {
      const { data, error } = await db
        .from("publicaciones")
        .select("pieza_id, firmas!inner(vigente), piezas!inner(estado, cuentas!inner(nombre, marca_id))")
        // Only the open send of the current signature: an older orphan row must not mark a fresh send doubtful.
        .eq("firmas.vigente", true)
        .is("post_urn", null)
        .lt("enviado_en", desde)
        .eq("piezas.estado", "publicando")
      if (error) fallo("No pude buscar los envíos sin respuesta", error)
      const porPieza = new Map(
        data.map((fila) => [
          fila.pieza_id,
          { id: fila.pieza_id, marcaId: fila.piezas.cuentas.marca_id, cuentaNombre: fila.piezas.cuentas.nombre },
        ]),
      )
      return [...porPieza.values()]
    },

    async credencial(cuentaId) {
      const { data, error } = await db.rpc("credencial_de_cuenta", { p_cuenta: cuentaId })
      if (error) fallo("No pude leer la conexión de la cuenta", error)
      const fila = data[0]
      return fila ? { token: fila.token, titular: fila.titular, expiraEn: fila.expira_en } : null
    },

    async descargar(ruta) {
      const { data, error } = await db.storage.from("piezas").download(ruta)
      if (error) fallo("No pude bajar el archivo de la pieza", error)
      if (data.size > BYTES_MAXIMOS_DEL_CARRUSEL) throw new Error("El archivo de la pieza supera el máximo permitido.")
      return new Uint8Array(await data.arrayBuffer())
    },

    async reservarEnvio(pieza) {
      if (!pieza.firma) throw new Error(`La pieza ${pieza.id} no tiene firma vigente.`)
      const { data, error } = await db.rpc("reservar_envio", {
        p_pieza: pieza.id,
        p_version: pieza.version.id,
        p_firma: pieza.firma.id,
      })
      if (error) fallo("No pude reservar el envío", error)
      if (data === "reservado" || data === "ya_enviado") return data
      throw new Error(`Respuesta inesperada al reservar el envío: ${data}`)
    },

    async cerrarEnvio(piezaId, urn, enlace) {
      const { error } = await db.rpc("cerrar_envio", { p_pieza: piezaId, p_urn: urn, p_enlace: enlace })
      if (error) fallo("No pude cerrar el envío", error)
    },
    mover,

    async vencidasSinFirma() {
      const { data, error } = await db
        .from("piezas")
        .select("id, planeada_para, cuentas!inner(id, nombre, tipo, marca_id), versiones(numero, texto)")
        .eq("estado", "por_aprobar")
        .lte("planeada_para", new Date().toISOString())
        .order("planeada_para")
        .limit(PENDIENTES_POR_CORRIDA)
      if (error) fallo("No pude buscar las piezas sin firma vencidas", error)
      return data.flatMap((p): PendienteSinFirma[] => {
        const ultima = [...p.versiones].sort((a, b) => b.numero - a.numero)[0]
        if (!p.planeada_para || !ultima) return []
        return [
          {
            id: p.id,
            marcaId: p.cuentas.marca_id,
            cuentaId: p.cuentas.id,
            cuentaNombre: p.cuentas.nombre,
            tipo: leerTipo(p.cuentas.tipo),
            planeadaPara: p.planeada_para,
            extracto: extractoDe(ultima.texto),
          },
        ]
      })
    },

    horariosOcupados: (cuentaId, desde) => horariosOcupados(db, cuentaId, desde),

    async cubrirConReserva(pendienteId, siguiente) {
      const { data, error } = await db.rpc("cubrir_con_reserva", { p_pendiente: pendienteId, p_siguiente: siguiente })
      if (error) fallo("No pude cubrir el espacio con la reserva", error)
      return data
    },

    anotarAviso: (marcaId, aviso) => anotarAviso(db, marcaId, aviso),
  }
}
