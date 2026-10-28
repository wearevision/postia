# Fase 0: prueba de publicación en LinkedIn

## 2026-10-28: carrusel PDF en el perfil de Federico

- **Cuenta:** LinkedIn de Federico (perfil), app «Estudio WAV Perfil», permisos `openid profile w_member_social`.
- **Pieza:** carrusel 01 de WR3, «¿Qué es un focus group?» (PDF de 9 páginas, 2,1 MB, 810×1013), con el copy adaptado a la voz de Federico (`docs/fase-0/post-de-prueba.md`).
- **Visibilidad:** CONNECTIONS.
- **Firma:** Federico escribió `PUBLICAR` en su terminal después de leer el texto exacto.
- **Resultado:** publicado. https://www.linkedin.com/feed/update/urn:li:ugcPost:7521314831665098752/
- **Ruta técnica:** Documents API (`initializeUpload` con dueño `urn:li:person:{sub}`, PUT del archivo, espera de `AVAILABLE`) y luego `POST /rest/posts` con `content.media` (documento y título), `Linkedin-Version: 202610`.

## Lo que esto responde

- **D2, plan B:** Share on LinkedIn (`w_member_social`) sí acepta documentos PDF por `/rest/posts`. El perfil de Federico publica carruseles PDF por API; no hace falta multiimagen ni publicar a mano.
- **Autor del post:** el `sub` de OpenID Connect (`/v2/userinfo`) sirve como `urn:li:person:{sub}`.

## Pendiente

- Federico actualiza en el plano la fase 0 («primera publicación real de un carrusel PDF por API») y la decisión D2 con este resultado.
- No se probó un post solo de texto. Usa el mismo endpoint sin `content`, así que el riesgo es bajo.
- La página de WAV sigue a mano hasta que LinkedIn apruebe Community Management.
