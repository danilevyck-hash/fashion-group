// Cuando la lectura de los descuentos falla, la tabla sale igual (falla ABIERTO)
// pero NO como definitiva: la pantalla lo dice y el PDF y el Excel no se bajan.
// La respuesta lo marca con `descuentos_no_leidos: true`.
export const AVISO_DESCUENTOS_NO_LEIDOS =
  "No se pudieron leer los descuentos: el total a pagar no es definitivo.";
