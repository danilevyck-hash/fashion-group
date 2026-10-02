// ─────────────────────────────────────────────────────────────────────────────
// PLANTILLA SWITCH ESTILO APPLE (1-oct-2026, `PLANTILLA_APPLE_2026_10`).
// APAGADO hasta el «sí» de Daniel sobre el mockup; reglas en docs/diseno.md.
//
// Pregunta de la pantalla: «¿qué archivo convierto en plantilla de Switch?».
// Medido contra producción el 1-oct-2026 (solo lectura):
//   · 155 plantillas en 90 días (~12 por semana), todas desde computadora.
//   · «Tallas por bulto»: 0 descargas desde que el contador funciona (4-sep).
//   · Facturas de tienda: 0 descargas en toda la historia y 0 fórmulas de tienda.
//
// Lo que cambia (SOLO la pantalla):
//   1. Se van las dos filas de pestañas: la pantalla abre en la caja de soltar
//      el archivo, con «Configuración» como enlace arriba a la derecha.
//   2. Debajo de la caja, «Cargas recientes» (las 5 últimas, con Descargar) y
//      «Ver historial completo».
//   3. «Tallas por bulto» pasa a un enlace al pie.
//   4. Fórmulas: UNA lista de empresas. Se suman Active Shoes (Reebok Precio A
//      y B, las MISMAS filas que guarda la pantalla de Reebok) y Multifashion
//      (las fórmulas de facturas de tienda, que ya existían aparte).
//   (2-oct-2026, con el «sí» de Daniel: «Tallas por bulto» va arriba, junto a
//   «Configuración», y no al pie.)
//
// 🔴 El Excel de 25 columnas, las fórmulas, el registro del Historial y las
// direcciones (?tab= / ?vista=) NO cambian. `false` = la pantalla de hoy.
// ─────────────────────────────────────────────────────────────────────────────

import type { Tab, Vista } from "@/app/productos/cargar/pestanas";
import type { MarcaCatalogo, Redondeo } from "@/lib/depurador/logic";
import {
  REEBOK_EMPRESA, REEBOK_FORMULA_A_DEFAULT, REEBOK_FORMULA_B_DEFAULT, REEBOK_MARCA_A, REEBOK_MARCA_B,
} from "@/lib/depurador/reebok";

/** `false` = la pantalla de hoy, exactamente. */
// Daniel aprobó las capturas el 2-oct-2026: "sí".
export const PLANTILLA_APPLE_2026_10 = true;

/** Cuántas cargas se ven debajo de la caja. */
export const CARGAS_RECIENTES = 5;

/** Qué navegación se dibuja. Puro, para que el candado lo fije. */
export function navegacion(apple: boolean, tab: Tab, vista: Vista, nVistas: number) {
  if (!apple) {
    return { pestanas: true, vistas: nVistas > 1, volver: false, enlaces: false };
  }
  const inicio = tab === "plantilla" && vista === "nuevo";
  return {
    pestanas: false,
    // Solo Configuración conserva su fila (Fórmulas · Descripciones · Reglas).
    vistas: tab === "config" && nVistas > 1,
    volver: !inicio,
    enlaces: inicio,
  };
}

/** Fórmulas en UNA lista de empresas: se suma Active Shoes con sus dos fórmulas
 *  de Reebok. Multifashion la agrega la pantalla (son otras tablas). */
export function formulasApple<T extends { catalogo: MarcaCatalogo[]; grupos: { label: string; marca: string }[] }>(cfg: T): T {
  const otras = cfg.grupos.filter((g) => !g.label);
  return {
    ...cfg,
    catalogo: [
      ...cfg.catalogo,
      { marca: REEBOK_MARCA_A, empresa: REEBOK_EMPRESA },
      { marca: REEBOK_MARCA_B, empresa: REEBOK_EMPRESA },
    ],
    grupos: [...cfg.grupos.filter((g) => g.label), { label: REEBOK_EMPRESA, marca: "Reebok" }, ...otras],
  };
}

/** Lo que se ve en una marca sin fórmula guardada: el valor que el cálculo usa. */
export function valorInicialDeMarca(marca: string): { divisor: number; extra: number; redondeo: Redondeo } {
  if (marca === REEBOK_MARCA_A) return { ...REEBOK_FORMULA_A_DEFAULT };
  if (marca === REEBOK_MARCA_B) return { ...REEBOK_FORMULA_B_DEFAULT };
  return { divisor: 0, extra: 0, redondeo: "int" };
}
