import { createClient } from "@supabase/supabase-js"
import { HttpResponse, http } from "msw"
import { describe, expect, test, vi } from "vitest"
import { paginasParaPieza, ponerDestino } from "@/lib/destino/acciones"
import type { Database } from "@/lib/supabase/database.types"
import { servidor } from "../msw"

const BASE = "http://127.0.0.1:1"
const PIEZA = "11111111-1111-4111-8111-111111111111"
const db = () => createClient<Database>(BASE, "clave", { auth: { persistSession: false, autoRefreshToken: false } })
const lector = vi.fn(async () => [])

describe("destination actions when the piece cannot be read", () => {
  test("answer with an error instead of throwing, and log the cause", async () => {
    servidor.use(
      http.get(`${BASE}/rest/v1/piezas`, () => HttpResponse.json({ message: "base caída" }, { status: 500 })),
    )
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = { ok: false, error: "No pude leer la pieza. Inténtalo de nuevo." }
    expect(await paginasParaPieza(db(), { piezaId: PIEZA, web: "wr3" }, lector)).toEqual(error)
    expect(await ponerDestino(db(), { piezaId: PIEZA, web: null, url: null }, lector)).toEqual(error)
    expect(registro).toHaveBeenCalledWith("No pude leer la pieza", PIEZA, "base caída")
    expect(lector).not.toHaveBeenCalled()
    registro.mockRestore()
  })
})
