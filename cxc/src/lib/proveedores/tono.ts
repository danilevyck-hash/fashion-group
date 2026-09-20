// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EN PROVEEDORES NO SE PINTA DE ROJO. UN SOLO TONO (20-sep-2026).
//
// 🩸 La lista y la ficha de un proveedor pintaban los tramos de edad con el
// vocabulario de color del CXC: verde «por vencer», ámbar «vencido reciente»,
// rojo «vencido crítico». Medido el 20-sep-2026, eso dejaba **$3.035.153 en
// rojo** en una pantalla que no puede sostener esa afirmación.
//
// 🔑 **En CxP no existe ni plazo ni fecha de vencimiento en el dato.** Switch
// manda la EDAD del documento desde su emisión —`0-30`, `271-365`, `Mas de
// 365`— y nada sobre cuándo hay que pagarlo. Un documento de 400 días con 18
// meses de crédito no está vencido; uno de 40 con pago contra entrega, sí. El
// color decía lo segundo sin tener con qué.
//
// Es la MISMA regla que ya rige el papel que lee el cliente en el CXC
// (`cxc-papel-vocabulario`): ahí «vencido» está prohibido por escrito, por esta
// misma razón. Acá el que hablaba era el color.
//
// ── LO QUE QUEDA ───────────────────────────────────────────────────────────
//   · un solo tono para todo lo que se debe, sea de un mes o de tres años;
//   · el TRAMO MÁS VIEJO en negrita, que es el peso que el rojo daba de más;
//   · el cero en gris claro y dibujado como «—», que ya era así;
//   · y el NEGATIVO en azul, porque eso no es edad: es saldo a favor, el mismo
//     azul con el que el CXC nombra el crédito de un cliente.
//
// La edad se sigue leyendo donde siempre se leyó: en el encabezado de cada
// columna.
// ─────────────────────────────────────────────────────────────────────────────

/** El único tono de los montos que se deben. */
export const TONO_MONTO = "text-gray-700";
/** El cero, que además se dibuja como «—». */
export const TONO_CERO = "text-gray-300";
/** Saldo a favor. No es un tramo de edad: es crédito, y va en el azul del CXC. */
export const TONO_A_FAVOR = "text-blue-600";

/** Clase de color de un monto de CxP. Nunca rojo, nunca ámbar. */
export function tonoDeMonto(valor: number): string {
  if (valor === 0) return TONO_CERO;
  if (valor < 0) return TONO_A_FAVOR;
  return TONO_MONTO;
}

/** Cómo se escribe un monto de tramo: cero es «—», negativo lleva su signo. */
export function textoDeMonto(valor: number, fmt: (n: number) => string): string {
  if (valor === 0) return "—";
  if (valor < 0) return `-$${fmt(Math.abs(valor))}`;
  return `$${fmt(valor)}`;
}
