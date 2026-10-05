// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA BARRA DE PESTAÑAS DEL CELULAR, COMO EN iOS (2-oct-2026, propuesta).
//
// Daniel, viendo el botón redondo ☰: *«¿el botón ☰ va con Apple? ¿Hace
// sentido?»*. No: el botón flotante es de Android (Material), no de iOS. En el
// iPhone la navegación entre secciones es la barra de pestañas de abajo: hasta
// 4 destinos con ícono y texto, y un 5.º, «Más», con la lista completa.
//
// 🔑 QUÉ VA EN LA BARRA (Daniel, 2-oct-2026): **Inicio + los 3 módulos que
// más usa ESA PERSONA + «Más»**. Como en iOS, la barra muestra los destinos
// principales y NO cambia de pantalla en pantalla; las secciones de cada
// módulo siguen arriba, en el selector del título.
//
// 🔴 POR PERSONA, FIJO POR SEMANA. El orden lo calcula el SERVIDOR
// (`GET /api/visitas/mis-modulos`) con `visitas_modulo` del `user_id` de la
// cookie firmada, sobre las 4 semanas COMPLETAS antes del lunes de esta semana
// (`ventanaDeLaSemana`): toda la semana sale el mismo orden y los botones no
// saltan bajo el dedo. Primero cuenta el CELULAR —es donde vive la barra—.
// Sin datos de la persona, el uso medido de su ROL; y después, el menú.
//
// 🔴 La lista se FILTRA siempre con los módulos que la persona ya tiene
// (`gruposDelCajon`, la misma fuente del menú): la barra nunca ofrece un módulo
// que el menú no ofrece.
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

/** `false` = el botón redondo ☰ de hoy (y el menú del usuario dentro del ☰).
 *  Daniel aprobó el 2-oct-2026 la barra de pestañas y el avatar: prendida. */
export const TAB_BAR_2026_10 = true;

/** Cuántos módulos van en la barra: Inicio + 3 + «Más» = 5, el tope de iOS. */
export const PESTANAS_DE_MODULO = 3;

/** Alto de la barra (cápsula de iOS 26) y su separación del piso. */
export const ALTO_TAB_BAR = 60;
export const MARGEN_TAB_BAR = 8;

/**
 * El respaldo por ROL, para quien todavía no tiene visitas propias
 * (`visitas_modulo`, 25-sep → 2-oct-2026; primero el celular). Lo que falte se
 * completa con el orden del menú.
 */
export const USO_MEDIDO_POR_ROL: Readonly<Record<string, readonly string[]>> = {
  admin: ["asistencia", "catalogos", "multifashion", "ventas", "guias", "comisiones"],
  secretaria: ["cargar", "catalogos", "guias", "marketing", "comisiones", "cheques"],
  bodega: ["guias", "marcacion", "catalogos"],
  vendedor: ["catalogos"],
  contabilidad: ["asistencia", "prestamos"],
};

/**
 * 🔴 Lo que va FIJO en la barra de un rol, antes del uso medido (5-oct-2026):
 * Daniel le abrió Multifashion a la secretaria y pidió que esté en su barra.
 * Sin esto quedaba detrás de sus módulos más usados, solo en «Más».
 */
export const FIJAS_POR_ROL: Readonly<Record<string, readonly string[]>> = {
  secretaria: ["multifashion"],
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
 * Los módulos de la barra para esta persona (sin contar Inicio ni «Más»), o
 * `[]` si no lleva barra. Salen SIEMPRE de los módulos del menú
 * (`gruposDelCajon`): mismos candados. `ordenDeLaPersona` es lo que contestó
 * `/api/visitas/mis-modulos`; vacío = el orden del rol.
 */
export function pestanasDelRol(
  role: string | null | undefined,
  fgModules?: string[] | null,
  ordenDeLaPersona: readonly string[] = [],
  /** La casa del rol: ya es la pestaña «Inicio», no se repite. */
  casaHref = "/home",
): AppModule[] {
  if (!role || esRolMarcacion(role)) return [];
  const todos = gruposDelCajon(role, fgModules).flatMap((g) => g.modulos);
  if (todos.length <= 1) return [];
  const delMenu = todos.filter((m) => m.href !== casaHref);
  const uso = [...(FIJAS_POR_ROL[role] ?? []), ...ordenDeLaPersona, ...(USO_MEDIDO_POR_ROL[role] ?? [])];
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

/** Cuántas semanas completas se miran para ordenar la barra. */
export const SEMANAS_QUE_SE_MIRAN = 4;

/**
 * La ventana fija de la semana: desde 4 semanas antes del lunes de esta semana
 * (incluido) hasta ese lunes (excluido). Mientras no cambie el lunes, el
 * resultado es el mismo: la barra se recalcula una vez por semana.
 */
export function ventanaDeLaSemana(hoyYmd: string): { desde: string; hasta: string } {
  const t = Date.parse(`${hoyYmd}T00:00:00Z`);
  const diasDesdeLunes = (new Date(t).getUTCDay() + 6) % 7;
  const lunes = t - diasDesdeLunes * 86_400_000;
  const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { desde: dia(lunes - SEMANAS_QUE_SE_MIRAN * 7 * 86_400_000), hasta: dia(lunes) };
}

/** Una fila de `visitas_modulo`, lo justo para ordenar. */
export interface FilaUso {
  modulo: string;
  aparato: string;
  visitas: number;
}

/** Los módulos de la persona, de más a menos usado: primero el celular, después el total. */
export function ordenPorUso(filas: readonly FilaUso[]): string[] {
  const cel = new Map<string, number>();
  const total = new Map<string, number>();
  for (const f of filas) {
    const n = Number(f.visitas) || 0;
    total.set(f.modulo, (total.get(f.modulo) ?? 0) + n);
    if (f.aparato === "celular") cel.set(f.modulo, (cel.get(f.modulo) ?? 0) + n);
  }
  return [...total.keys()].sort(
    (a, b) => (cel.get(b) ?? 0) - (cel.get(a) ?? 0) || (total.get(b) ?? 0) - (total.get(a) ?? 0) || a.localeCompare(b),
  );
}
