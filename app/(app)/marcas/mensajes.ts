const MENSAJES: Record<string, string> = {
  conectada: "LinkedIn quedó conectado.",
  cancelada: "Cancelaste la conexión en LinkedIn.",
  estado: "La conexión expiró o se abrió en otra pestaña. Vuelve a intentarlo.",
  // The profile and the page flows both return «permisos».
  permisos: "LinkedIn no dio permiso para publicar. Vuelve a conectar y acepta todos los permisos.",
  rechazada: "LinkedIn no aceptó la conexión. Vuelve a intentarlo.",
  sin_app: "Falta configurar la app de LinkedIn en el servidor.",
  sin_app_pagina: "Falta configurar la app de la página de LinkedIn en el servidor.",
  sin_pagina:
    "Tu cuenta de LinkedIn no administra ninguna página. Pide el rol de administrador en la página de WAV y vuelve a conectar.",
  fallo: "No pude conectar LinkedIn. Inténtalo de nuevo en un rato.",
}

/** The text for the `?linkedin=` word the OAuth routes send back, or null for anything else. */
export function mensajeDeLinkedin(clave: string | undefined): string | null {
  return clave && Object.hasOwn(MENSAJES, clave) ? MENSAJES[clave] : null
}
