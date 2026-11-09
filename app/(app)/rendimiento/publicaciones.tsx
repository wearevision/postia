"use client"

import Link from "next/link"
import { useState } from "react"
import { fechaCorta } from "@/lib/piezas/fechas"
import {
  CAMPOS_DE_ORDEN,
  type CampoDeOrden,
  cifra,
  ordenarPublicaciones,
  porcentajeDeTasa,
} from "@/lib/rendimiento/formato"
import type { PublicacionConRendimiento } from "@/lib/rendimiento/lectura"
import { rutaDePieza } from "@/lib/sesion/rutas"

const CHIP = "rounded-full border px-2 py-0.5 text-xs"

function Dato({ nombre, valor }: { nombre: string; valor: string }) {
  return (
    <div>
      <dt className="text-apagado">{nombre}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  )
}

export function Publicaciones({ publicaciones }: { publicaciones: PublicacionConRendimiento[] }) {
  const [campo, setCampo] = useState<CampoDeOrden>("fecha")
  return (
    <section aria-labelledby="titulo-publicaciones" className="space-y-3">
      <h2 id="titulo-publicaciones" className="text-lg font-semibold">
        Publicaciones
      </h2>
      <label className="block space-y-1 text-sm">
        <span>Ordenar por</span>
        <select
          value={campo}
          onChange={(e) => setCampo(e.target.value as CampoDeOrden)}
          className="campo min-h-11 w-full"
        >
          {CAMPOS_DE_ORDEN.map((c) => (
            <option key={c.campo} value={c.campo}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>
      <ul aria-label="Publicaciones" className="space-y-3">
        {ordenarPublicaciones(publicaciones, campo).map((p) => (
          <li key={p.id} className="tarjeta space-y-2 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-apagado">{fechaCorta(p.publicadaEl)}</span>
              {p.marca === "mejor" && <span className={`${CHIP} border-exito text-exito`}>Mejor</span>}
              {p.marca === "peor" && <span className={`${CHIP} border-peligro text-peligro`}>Peor</span>}
            </div>
            {p.piezaId ? (
              <Link href={rutaDePieza(p.piezaId)} className="block min-h-11 py-2 underline">
                {p.texto}
              </Link>
            ) : (
              <p>{p.texto}</p>
            )}
            <dl className="grid grid-cols-3 gap-2">
              <Dato nombre="Impresiones" valor={cifra(p.impresiones)} />
              <Dato nombre="Interacciones" valor={cifra(p.interacciones)} />
              <Dato nombre="Tasa" valor={porcentajeDeTasa(p.tasa)} />
              {p.clics !== null && <Dato nombre="Clics" valor={cifra(p.clics)} />}
              {p.seguidoresNuevos !== null && <Dato nombre="Nuevos seguidores" valor={cifra(p.seguidoresNuevos)} />}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  )
}
