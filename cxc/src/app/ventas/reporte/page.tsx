import { redirect } from "next/navigation";

// /ventas/reporte fue retirado (sprint de limpieza). El dashboard de /ventas
// cubre resumen, metas y proyección. Redirige para no romper bookmarks viejos.
export default function VentasReporteRedirect() {
  redirect("/ventas");
}
