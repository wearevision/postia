"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/** While a task works, the server page is re-read every 15 seconds: no push for something Federico is waiting on. */
export function Refrescar({
  mensaje = "Claude está trabajando. Esta página se actualiza sola.",
}: {
  mensaje?: string
}) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 15_000)
    return () => clearInterval(id)
  }, [router])
  return <p className="text-sm text-apagado">{mensaje}</p>
}
