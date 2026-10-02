// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA BARRA DE PESTAÑAS DEL CELULAR, COMO EN iOS (2-oct-2026, propuesta).
//
// Daniel, viendo el botón redondo ☰: *«¿el botón ☰ va con Apple? ¿Hace
// sentido?»*. No: el botón flotante es de Android (Material), no de iOS. En el
// iPhone la navegación entre secciones es la barra de pestañas de abajo: hasta
// 4 destinos con ícono y texto, y un 5.º, «Más», con la lista completa.
//
// 🔑 QUÉ VA EN LAS 4 PESTAÑAS: los módulos más usados del ROL, medidos en
// `visitas_modulo` (25-sep → 2-oct-2026, 121 filas). Se mide primero el
// CELULAR —es donde vive la barra— y después todo lo demás; sin datos, el orden
// del menú. La lista se FILTRA siempre con los módulos que la persona ya tiene
// (`gruposDelCajon`, la misma fuente del menú): la barra nunca ofrece un módulo
// que el menú no ofrece. Así, Rodrigo (bodega con Marcación por persona) ve
// Marcación y el resto de bodega no.
//
// ⚠️ POR ROL, NO POR PERSONA, A PROPÓSITO: en la medición las dos secretarias
// usan los mismos tres módulos (Plantilla Switch, Catálogos, Guías), y una
// barra que se reordena sola con el uso le cambia los botones de lugar al
// dedo —lo contrario de iOS, donde las pestañas no se mueven—.
//
// 🔴 SIN BARRA para quien tiene un solo módulo (Marcación, Gerente
// Multifashion): no hay a dónde ir.
//
// 🔴 PANTALLA CON ACCIÓN PRINCIPAL FIJA ABAJO («Guardar guía», «Nuevo
// reclamo», el carrito del catálogo): la barra SE ESCONDE —como iOS al entrar a
// redactar (`hidesBottomBarWhenPushed`): una barra de herramientas y una de
// pestañas nunca van juntas—. Lo decide CSS (`:has([data-barra-fija-abajo])`
// en `globals.css`), sin que ninguna pantalla tenga que avisar.
//
// Interruptor `TAB_BAR_2026_10`: en `false`, el ☰ redondo de siempre.
// ─────────────────────────────────────────────────────────────────────────────

import type { AppModule } from "@/lib/modules";
import { gruposDelCajon } from "@/lib/navegacion/cajon-por-grupos";
import { esRolMarcacion } from "@/lib/marcacion/rol";

/** `false` = el botón redondo ☰ de hoy. */
export const TAB_BAR_2026_10 = false;

/** Cuántos módulos van en la barra; el 5.º lugar es «Más». */
export const PESTANAS_DE_MODULO = 4;

/** Alto de la barra (cápsula de iOS 26) y su separación del piso. */
export const ALTO_TAB_BAR = 60;
export const MARGEN_TAB_BAR = 8;

/**
 * El uso medido por rol, de más a menos (`visitas_modulo`, 25-sep → 2-oct-2026;
 * primero el celular, después la computadora). Lo que falte se completa con el
 * orden del menú.
 */
export const USO_MEDIDO_POR_ROL: Readonly<Record<string, readonly string[]>> = {
  admin: ["asistencia", "catalogos", "multifashion", "ventas", "guias", "comisiones"],
  secretaria: ["cargar", "catalogos", "guias", "marketing", "comisiones", "cheques"],
  bodega: ["guias", "marcacion", "catalogos"],
  vendedor: ["catalogos"],
  contabilidad: ["asistencia", "prestamos"],
};

/** El rótulo corto de la pestaña: «Guías de despacho» no cabe en 78 px. */
const ROTULO_CORTO: Readonly<Record<string, string>> = {
  guias: "Guías",
  asistencia: "Asistencia",
  cxc: "Por cobrar",
  referencia: "Artículos",
  cargar: "Plantilla",
  caja: "Caja",
  "vista-general": "General",
  boston: "Boston",
};

export function rotuloDePestana(m: Pick<AppModule, "key" | "label">): string {
  return ROTULO_CORTO[m.key] ?? m.label;
}

/**
 * Los módulos de la barra para esta persona, o `[]` si no lleva barra.
 * Salen SIEMPRE de los módulos del menú (`gruposDelCajon`): mismos candados.
 */
export function pestanasDelRol(
  role: string | null | undefined,
  fgModules?: string[] | null,
): AppModule[] {
  if (!role || esRolMarcacion(role)) return [];
  const delMenu = gruposDelCajon(role, fgModules).flatMap((g) => g.modulos);
  if (delMenu.length <= 1) return [];
  const uso = USO_MEDIDO_POR_ROL[role] ?? [];
  const rango = (k: string) => {
    const i = uso.indexOf(k);
    return i === -1 ? uso.length : i;
  };
  return delMenu
    .map((m, i) => ({ m, i }))
    .sort((a, b) => rango(a.m.key) - rango(b.m.key) || a.i - b.i)
    .slice(0, PESTANAS_DE_MODULO)
    .map((x) => x.m);
}
