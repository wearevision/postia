/** SHA-256 in hex, computed in the browser (no node:crypto): the Worker has only a few ms of CPU per request. */
export async function sha256Hex(archivo: { arrayBuffer(): Promise<ArrayBuffer> }): Promise<string> {
  const resumen = await crypto.subtle.digest("SHA-256", await archivo.arrayBuffer())
  return Array.from(new Uint8Array(resumen), (byte) => byte.toString(16).padStart(2, "0")).join("")
}
