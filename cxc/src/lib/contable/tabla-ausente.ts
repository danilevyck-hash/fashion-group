/**
 * "Esa tabla todavía no existe" — el reconocimiento que sostiene la degradación
 * limpia de TODO el módulo contable.
 *
 * Las migraciones de este repo las corre Daniel A MANO, así que una tabla puede
 * no existir durante días y eso NO es un error: es el estado normal hasta que
 * corra. Las rutas lo reconocen y responden "todavía no instalado" en vez de un
 * 500 que dejaría la pantalla rota.
 *
 * 🩸 POR QUÉ VIVE ACÁ. Estaba en `lib/mayor/leer.ts` y lo importaban SEIS
 * módulos que sobreviven al retiro del mayor: `cuentas/leer`, `egresos/leer`,
 * `inventario/leer`, `sync-cuentas-contables`, `sync-egresos-varios` y la ruta
 * de egresos. Retirar el mayor sin mudarlo primero se habría llevado por
 * delante la degradación limpia de las tres tablas que SÍ siguen vivas.
 *
 * ⚠️ Es un reconocimiento ESTRECHO a propósito: un timeout o un permiso denegado
 * NO son "no instalado" y tienen que seguir siendo un error. Cuerpo movido tal
 * cual, sin reescribir.
 */

/**
 * ¿El error de PostgREST dice que la tabla/relación no existe?
 *
 * Postgres devuelve `42P01`; PostgREST, cuando el schema cache todavía no la
 * conoce, `PGRST205`. Se miran también los textos porque `leerTodoPaginado` sólo
 * propaga el mensaje. Es un reconocimiento ESTRECHO a propósito: un timeout o un
 * permiso denegado NO son "no instalado" y tienen que seguir siendo un error.
 */
export function esTablaAusente(err: unknown): boolean {
  if (!err) return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const msg = (e.message ?? String(err)).toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    msg.includes("42p01") ||
    msg.includes("pgrst205")
  );
}
