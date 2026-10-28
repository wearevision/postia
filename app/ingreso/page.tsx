import { pedirCodigoAccion, verificarCodigoAccion } from "./acciones"
import { FormularioIngreso } from "./formulario-ingreso"

const AVISOS: Record<string, string> = {
  sin_acceso: "Tu correo no tiene marcas asignadas. Pídele acceso a Federico.",
}

export default async function Ingreso({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-[max(2rem,env(safe-area-inset-top))]">
      <h1 className="mb-6 text-3xl font-semibold">PostIA</h1>
      <FormularioIngreso
        pedirCodigo={pedirCodigoAccion}
        verificarCodigo={verificarCodigoAccion}
        aviso={motivo ? AVISOS[motivo] : undefined}
      />
    </main>
  )
}
