// PostIA service worker: shows each push as a notification and opens only the app's own routes.
// No fetch handler and no cache: the app is always online.
const TITULO_POR_DEFECTO = "PostIA"

function leerDatos(event) {
  if (!event.data) return {}
  try {
    return event.data.json()
  } catch {
    // A push that is not JSON (a test from the browser's devtools) is shown as plain text.
    return { cuerpo: event.data.text() }
  }
}

self.addEventListener("push", (event) => {
  const datos = leerDatos(event)
  const url = typeof datos.url === "string" ? datos.url : "/"
  event.waitUntil(
    self.registration.showNotification(datos.titulo || TITULO_POR_DEFECTO, {
      body: datos.cuerpo || "",
      icon: "/icon",
      data: { url },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const destino = new URL(event.notification.data?.url || "/", self.location.origin)
  // A push that names another site must not be able to send the person there.
  if (destino.origin !== self.location.origin) return
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const ventana of ventanas) {
        if ("focus" in ventana) {
          await ventana.navigate(destino.href)
          return ventana.focus()
        }
      }
      return self.clients.openWindow(destino.href)
    })(),
  )
})
