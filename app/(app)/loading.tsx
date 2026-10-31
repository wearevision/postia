import { Loader2 } from "lucide-react"

export default function Cargando() {
  return (
    <output className="mx-auto flex max-w-md items-center gap-2 text-apagado">
      <Loader2 aria-hidden="true" strokeWidth={1.75} className="size-4 animate-spin motion-reduce:animate-none" />
      Cargando…
    </output>
  )
}
