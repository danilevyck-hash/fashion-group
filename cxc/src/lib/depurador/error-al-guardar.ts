/**
 * El texto que se le muestra a la persona cuando un guardado falla: el `error`
 * que manda el servidor (ya escrito para ella) o, si no viene, el de respaldo.
 */
export async function mensajeDelServidor(res: Response, respaldo: string): Promise<string> {
  const d = await res.json().catch(() => null);
  return d && typeof d.error === "string" && d.error.trim() ? d.error : respaldo;
}
