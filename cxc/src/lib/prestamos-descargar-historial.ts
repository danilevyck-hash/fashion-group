// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «DESCARGAR HISTORIAL» DE PRÉSTAMOS — UNA SOLA FUNCIÓN (29-sep-2026).
//
// Vivía adentro de `app/prestamos/PrestamosClient.tsx`. Daniel pidió el mismo
// botón en Asistencia › Préstamos (*«solo quiero descargar»*), así que se mudó
// aquí TAL CUAL y la llaman las dos pantallas: misma ruta
// (`/api/prestamos/export-excel`), mismas dos opciones («deben» · «todos») y
// mismo nombre de archivo. El servidor sigue decidiendo el alcance de cada rol.
//
// Y ahora se ANOTA (`descarga_excel`, módulo `prestamos`), como las descargas
// de Ventas: así se sabe si alguien la usa.
// ─────────────────────────────────────────────────────────────────────────────

import { logActivityClient } from "@/lib/logActivityClient";

export type AmbitoHistorial = "deben" | "todos";

/**
 * Baja el Excel del historial. `empresa` es el NOMBRE que guarda
 * `prestamos_empleados.empresa` («Fashion Wear»); `null` = todas.
 * Devuelve `false` si no se pudo: quien llama lo dice en pantalla.
 */
export async function descargarHistorialPrestamos(
  ambito: AmbitoHistorial,
  empresa: string | null,
  hoy: string,
): Promise<boolean> {
  try {
    const emp = empresa ? `&empresa=${encodeURIComponent(empresa)}` : "";
    const res = await fetch(`/api/prestamos/export-excel?ambito=${ambito}${emp}`);
    if (!res.ok) return false;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const ymd = hoy.replace(/-/g, "");
    const slug = empresa ? empresa.toLowerCase().replace(/\s+/g, "_") : "todas_las_empresas";
    link.download = `historial_prestamos_${ambito}_${slug}_${ymd}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    logActivityClient({ action: "descarga_excel", module: "prestamos", details: { ambito, empresa } });
    return true;
  } catch {
    return false;
  }
}
