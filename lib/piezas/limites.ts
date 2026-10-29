// Worker memory (128 MB) and a realistic carousel size; LinkedIn itself allows 100 MB.
// Apart from archivo.ts because the browser form imports it and archivo.ts needs node:crypto.
export const BYTES_MAXIMOS_DEL_CARRUSEL = 30 * 1024 * 1024

export const CARACTERES_MAXIMOS_DEL_TEXTO = 3000
