// Lo que pide la LISTA de reclamos, en un solo lugar: `GET /api/reclamos` y el
// SSR de `reclamos/page.tsx` tienen que traer lo mismo, o la portada cambiaría
// de números al revalidar. Sin la URL de las fotos (el bucket es privado desde
// el 11-sep-2026 y solo el detalle firma): los ids alcanzan para contarlas. Con
// los settlements: la portada dice «Cobrado <año>» con lo que de verdad entró.
export const LISTA_SELECT =
  "*, reclamo_items(*), reclamo_fotos(id), reclamo_seguimiento(*), reclamo_settlements(monto, fecha, deleted)";
