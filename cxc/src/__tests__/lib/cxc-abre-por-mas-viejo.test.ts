// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CUENTAS POR COBRAR ABRE POR «MÁS VIEJO SIN PAGAR» (20-sep-2026).
//
// Lo que pidió Daniel, en dos frases: que la lista **abra ordenada por días sin
// pagar, el más viejo arriba**, y que **los días se vean SIEMPRE en la fila** —
// no solo con el filtro de «+90 d» encendido.
//
// 🩸 QUÉ PASABA. Abría por MONTO. Medido contra producción: de los 10 clientes
// más grandes —el **63 % de la plata**— **nueve** habían pagado en los últimos
// **80 días**, y el que lleva **313 días sin pagar** ($143.713) salía en el
// **puesto 8**. O sea: la lista ponía arriba a los que ya estaban pagando.
//
// Y el dato que ahora ordena estaba ESCONDIDO: `avisoSinPagarDe` devolvía `null`
// mientras el filtro estuviera apagado, así que la pantalla quedaba ordenada por
// una antigüedad que no se podía leer en ninguna fila.
//
// ⚠️ LO QUE NO CAMBIÓ, y este candado lo sostiene: las tres píldoras de tramo
// siguen ordenando por SU tramo (27-jul-2026), un toque en el título «Total»
// vuelve al orden por monto, y los saldos a favor siguen yendo al final.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ORDEN_AL_ABRIR,
  ordenEfectivo,
  ordenAlTocarTitulo,
  ordenParaRiskFilter,
  ordenarClientes,
  etiquetaOrden,
  type ClienteOrdenable,
} from "@/lib/cxc-orden";
import { diasSinPagar, textoSinPagar } from "@/lib/cxc/sin-pagar";

const RAIZ = process.cwd();
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const plano = (rel: string) => sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

const PAGINA = "src/app/cxc/page.tsx";
const FILA = "src/app/cxc/components/ClientRow.tsx";
const CELULAR = "src/app/cxc/components/PanelCxcMobile.tsx";

const HOY = "2026-09-20"; // fecha FIJA: Panamá es UTC−5 y `new Date()` rompería

// ── La cartera de prueba: los cuatro casos que importan ──────────────────────
//
// El orden por MONTO y el orden por DÍAS son distintos a propósito: si fueran
// iguales, este candado pasaría con la implementación vieja.
//
//                       nombre          monto    último pago        días
const GRANDE = fila("GRANDE", 500_000, "2026-09-10"); //   10 d — el que más debe
const VIEJO = fila("VIEJO", 143_713, "2025-11-11");   //  313 d — el de Daniel
const MEDIO = fila("MEDIO", 200_000, "2026-06-01");   //  111 d
const NUNCA = fila("NUNCA", 1_000, null);             //  nunca pagó

const CARTERA = [GRANDE, VIEJO, MEDIO, NUNCA];
const PAGOS = new Map<string, string | null>(CARTERA.map((c) => [c.nombre_normalized, c.ultimoPago]));
const diasDe = (c: ClienteOrdenable) => diasSinPagar(PAGOS.get(c.nombre_normalized) ?? null, HOY);

interface FilaCartera extends ClienteOrdenable {
  ultimoPago: string | null;
}

function fila(nombre: string, total: number, ultimoPago: string | null): FilaCartera {
  return { nombre_normalized: nombre, current: total, watch: 0, overdue: 0, total, ultimoPago };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Con qué orden ABRE la pantalla
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 1 · la lista abre por días sin pagar, el más viejo arriba", () => {
  it("el orden de apertura es por `sinPagar`, de mayor a menor", () => {
    expect(ORDEN_AL_ABRIR).toEqual({ risk: "all", key: "sinPagar", dir: "desc" });
  });

  it("🔴 y la pantalla ARRANCA con él, no en `null`", () => {
    const src = plano(PAGINA);
    expect(src).toContain("useState<OrdenOverride | null>(ORDEN_AL_ABRIR)");
    expect(src, "volvió a arrancar sin orden").not.toContain("useState<OrdenOverride | null>(null)");
  });

  it("🩸 el de 313 días queda PRIMERO, y el que más debe deja de estarlo", () => {
    const lista = ordenarClientes(CARTERA, {
      orden: ordenEfectivo("all", ORDEN_AL_ABRIR),
      diasSinPagar: diasDe,
    });
    expect(lista.map((c) => c.nombre_normalized)).toEqual(["NUNCA", "VIEJO", "MEDIO", "GRANDE"]);
    // El defecto medido: por monto, el de 313 días quedaba debajo de los grandes.
    const porMonto = ordenarClientes(CARTERA, { orden: ordenParaRiskFilter("all") });
    expect(porMonto[0].nombre_normalized).toBe("GRANDE");
    expect(porMonto.map((c) => c.nombre_normalized).indexOf("VIEJO")).toBeGreaterThan(0);
  });

  it("🔴 el que NUNCA pagó va primero: es el más grave, no el desconocido", () => {
    const lista = ordenarClientes([GRANDE, NUNCA], {
      orden: ORDEN_AL_ABRIR,
      diasSinPagar: diasDe,
    });
    expect(lista[0].nombre_normalized).toBe("NUNCA");
    expect(diasDe(NUNCA)).toBeNull();
  });

  it("al revés (asc) el más reciente queda arriba y el que nunca pagó al final", () => {
    const lista = ordenarClientes(CARTERA, {
      orden: { key: "sinPagar", dir: "asc" },
      diasSinPagar: diasDe,
    });
    expect(lista.map((c) => c.nombre_normalized)).toEqual(["GRANDE", "MEDIO", "VIEJO", "NUNCA"]);
  });

  it("🔴 FALLA ABIERTO: sin los días, nadie se cuela — desempata el nombre", () => {
    const lista = ordenarClientes(CARTERA, { orden: ORDEN_AL_ABRIR });
    expect(lista.map((c) => c.nombre_normalized)).toEqual(["GRANDE", "MEDIO", "NUNCA", "VIEJO"]);
  });

  it("los saldos a favor siguen yendo al final, antes que cualquier orden", () => {
    const credito: FilaCartera = { ...fila("CREDITO", -800, null), current: 0 };
    const lista = ordenarClientes([credito, ...CARTERA], {
      orden: ORDEN_AL_ABRIR,
      diasSinPagar: diasDe,
    });
    expect(lista[lista.length - 1].nombre_normalized).toBe("CREDITO");
  });

  it("no cambia ni un monto: la plata sale intacta", () => {
    const antes = CARTERA.reduce((s, c) => s + c.total, 0);
    const lista = ordenarClientes(CARTERA, { orden: ORDEN_AL_ABRIR, diasSinPagar: diasDe });
    expect(lista.reduce((s, c) => s + c.total, 0)).toBe(antes);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Volver al orden por monto con UN toque
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 2 · un toque en «Total» vuelve al orden por monto", () => {
  it("el clic en el título «Total» deja el orden por total, de mayor a menor", () => {
    const orden = ordenAlTocarTitulo(ordenEfectivo("all", ORDEN_AL_ABRIR), "total");
    expect(orden).toEqual({ key: "total", dir: "desc" });
    const lista = ordenarClientes(CARTERA, { orden, diasSinPagar: diasDe });
    expect(lista.map((c) => c.nombre_normalized)).toEqual(["GRANDE", "MEDIO", "VIEJO", "NUNCA"]);
  });

  it("y el override manda sobre el orden de apertura", () => {
    const override = { risk: "all" as const, key: "total" as const, dir: "desc" as const };
    expect(ordenEfectivo("all", override)).toEqual({ key: "total", dir: "desc" });
  });

  it("⚠️ las tres píldoras de tramo NO cambiaron: siguen ordenando por SU tramo", () => {
    expect(ordenParaRiskFilter("current")).toEqual({ key: "current", dir: "desc" });
    expect(ordenParaRiskFilter("watch")).toEqual({ key: "watch", dir: "desc" });
    expect(ordenParaRiskFilter("overdue")).toEqual({ key: "overdue", dir: "desc" });
    // El override de apertura está anclado a «Total pendiente»: al tocar un
    // tramo se descarta solo, como cualquier otro override.
    expect(ordenEfectivo("overdue", ORDEN_AL_ABRIR)).toEqual({ key: "overdue", dir: "desc" });
  });

  it("el orden nuevo se lee con palabras, como los otros", () => {
    expect(etiquetaOrden("sinPagar")).toBe("días sin pagar");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Los días se ven SIEMPRE en la fila
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 3 · los días sin pagar se ven siempre, no solo con el filtro", () => {
  it("🩸 `avisoSinPagarDe` ya NO pregunta por el filtro", () => {
    const src = plano(PAGINA);
    expect(src).toContain("textoSinPagar(diasSinPagarDe(c))");
    expect(src, "volvió a esconder los días detrás del filtro")
      .not.toMatch(/sinPagarActivo\s*\?\s*textoSinPagar/);
  });

  it("la fila dibuja el texto que le llega, sin preguntar nada", () => {
    expect(plano(FILA)).toContain("{avisoSinPagar}");
  });

  it("el texto es el de siempre — la regla no se copió", () => {
    expect(textoSinPagar(313)).toBe("no paga hace 313 d");
    expect(textoSinPagar(null)).toBe("nunca ha pagado");
    expect(diasSinPagar("2025-11-11", HOY)).toBe(313);
  });

  it("⚠️ el filtro de «+90 d» sigue existiendo y sigue filtrando", () => {
    const src = plano(PAGINA);
    expect(src).toContain("sinPagarActivo");
    expect(src).toMatch(/if \(sinPagarActivo\) result = result\.filter/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · El celular abre con el MISMO primer cliente
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 4 · el celular muestra el orden que ya viene", () => {
  it("🩸 dejó de reordenar con una regla propia", () => {
    const src = plano(CELULAR);
    expect(src).toContain("const sortedMobile = filtered;");
    expect(src, "el celular volvió a ordenar por su cuenta").not.toContain("ordenParaRiskFilter");
    expect(src, "el celular volvió a ordenar por su cuenta").not.toContain("ordenarClientes");
  });

  it("y la pantalla le pasa la lista YA ordenada por el comparador único", () => {
    const src = plano(PAGINA);
    expect(src).toContain("diasSinPagar: diasSinPagarDe");
    expect(src).toContain("compararClientes(a, b, {");
  });
});
