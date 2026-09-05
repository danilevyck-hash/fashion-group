import { describe, it, expect } from "vitest";
import {
  ordenParaRiskFilter,
  ordenEfectivo,
  ordenAlTocarTitulo,
  siguienteRiskFilter,
  pasaFiltroRiesgo,
  ordenarClientes,
  etiquetaOrden,
  type ClienteOrdenable,
  type OrdenOverride,
  type RiskFilter,
} from "@/lib/cxc-orden";

// Candado del pedido de Daniel (27-jul-2026): "los card de cxc por buckets al
// tocarlo debe de acomodar las cxc en orden de la deuda del bucket no?".
// Antes la píldora filtraba pero NO reordenaba: quedaban los clientes del tramo
// pero ordenados por saldo total, así que el que más debía EN ESE TRAMO podía no
// quedar arriba. Acá se prueba en las dos direcciones: que ordene por el tramo, y
// que el orden por título de columna siga vivo y nunca contradiga a la píldora.

function cliente(nombre: string, current: number, watch: number, overdue: number): ClienteOrdenable {
  return { nombre_normalized: nombre, current, watch, overdue, total: current + watch + overdue };
}


// Cartera de prueba: el orden por TOTAL y el orden por cada TRAMO son distintos
// a propósito — si no, el test pasaría con la implementación vieja.
//                          nombre       0-90d   91-120d   121d+     total
const ANA = cliente("ANA", 10_000, 0, 500);       // 10.500
const BETO = cliente("BETO", 0, 3_000, 4_000);    //  7.000
const CARLA = cliente("CARLA", 100, 900, 9_000);  // 10.000
const DIEGO = cliente("DIEGO", 5_000, 0, 0);      //  5.000
const CARTERA = [ANA, BETO, CARLA, DIEGO];

describe("orden derivado del tramo tocado", () => {
  it("cada píldora de tramo ordena por ESE tramo, de mayor a menor", () => {
    expect(ordenParaRiskFilter("current")).toEqual({ key: "current", dir: "desc" });
    expect(ordenParaRiskFilter("watch")).toEqual({ key: "watch", dir: "desc" });
    expect(ordenParaRiskFilter("overdue")).toEqual({ key: "overdue", dir: "desc" });
  });

  it('"Total pendiente" vuelve al orden por total', () => {
    expect(ordenParaRiskFilter("all")).toEqual({ key: "total", dir: "desc" });
  });

  it("tocar 121d+ filtra a los del tramo Y los ordena por ese monto descendente", () => {
    const orden = ordenParaRiskFilter("overdue");
    const visibles = ordenarClientes(
      CARTERA.filter((c) => pasaFiltroRiesgo(c, "overdue")),
      { orden }
    );
    expect(visibles.map((c) => c.nombre_normalized)).toEqual(["CARLA", "BETO", "ANA"]);
    // Descendente por el monto DEL TRAMO, no por el total.
    expect(visibles.map((c) => c.overdue)).toEqual([9_000, 4_000, 500]);
    // Y es distinto del orden por total: ANA es la que más debe en total y queda última.
    const porTotal = ordenarClientes(CARTERA, { orden: ordenParaRiskFilter("all") });
    expect(porTotal[0].nombre_normalized).toBe("ANA");
  });

  it("un cliente sin deuda en el tramo elegido NO aparece", () => {
    const visibles = CARTERA.filter((c) => pasaFiltroRiesgo(c, "overdue"));
    expect(visibles.map((c) => c.nombre_normalized)).not.toContain("DIEGO");
    expect(visibles.every((c) => c.overdue > 0)).toBe(true);

    const enWatch = CARTERA.filter((c) => pasaFiltroRiesgo(c, "watch"));
    expect(enWatch.map((c) => c.nombre_normalized)).toEqual(["BETO", "CARLA"]);
    expect(enWatch.every((c) => c.watch > 0)).toBe(true);
  });

  it('"Por vencer" es el que tiene TODA la deuda dentro del plazo, no el que tiene algo ahí', () => {
    // ANA tiene 10.000 en 0-90d pero también 500 en 121d+ → no es "por vencer".
    expect(pasaFiltroRiesgo(ANA, "current")).toBe(false);
    expect(pasaFiltroRiesgo(DIEGO, "current")).toBe(true);
    // Saldo a favor (total negativo) no es "por vencer".
    expect(pasaFiltroRiesgo({ ...cliente("CREDITO", 0, 0, 0), total: -500 }, "current")).toBe(false);
  });

  it('"Total pendiente" no filtra a nadie', () => {
    expect(CARTERA.filter((c) => pasaFiltroRiesgo(c, "all"))).toHaveLength(4);
  });
});

describe("apagar el filtro tocando la misma píldora", () => {
  it("tocar la píldora activa vuelve a Total pendiente", () => {
    expect(siguienteRiskFilter("overdue", "overdue")).toBe("all");
    expect(siguienteRiskFilter("watch", "watch")).toBe("all");
    expect(siguienteRiskFilter("current", "current")).toBe("all");
  });

  it("tocar otra píldora cambia de tramo (no apaga)", () => {
    expect(siguienteRiskFilter("overdue", "watch")).toBe("watch");
    expect(siguienteRiskFilter("all", "overdue")).toBe("overdue");
  });

  it("al apagar, la lista vuelve completa y ordenada por total", () => {
    const risk = siguienteRiskFilter("overdue", "overdue");
    const visibles = ordenarClientes(
      CARTERA.filter((c) => pasaFiltroRiesgo(c, risk)),
      { orden: ordenParaRiskFilter(risk) }
    );
    expect(visibles.map((c) => c.nombre_normalized)).toEqual(["ANA", "CARLA", "BETO", "DIEGO"]);
  });
});

describe("orden por título de columna: sigue funcionando y no se desincroniza", () => {
  it("sin override, el orden lo manda la píldora", () => {
    expect(ordenEfectivo("overdue", null)).toEqual({ key: "overdue", dir: "desc" });
    expect(ordenEfectivo("all", null)).toEqual({ key: "total", dir: "desc" });
  });

  it("clic en un título ordena sin tocar el filtro", () => {
    const override: OrdenOverride = { risk: "all", ...ordenAlTocarTitulo(ordenParaRiskFilter("all"), "watch") };
    expect(ordenEfectivo("all", override)).toEqual({ key: "watch", dir: "desc" });
    // El filtro no cambió: siguen los 4 clientes.
    expect(CARTERA.filter((c) => pasaFiltroRiesgo(c, "all"))).toHaveLength(4);
  });

  it("clic repetido en el mismo título invierte el sentido", () => {
    let orden = ordenParaRiskFilter("all");
    orden = ordenAlTocarTitulo(orden, "overdue");
    expect(orden).toEqual({ key: "overdue", dir: "desc" });
    orden = ordenAlTocarTitulo(orden, "overdue");
    expect(orden).toEqual({ key: "overdue", dir: "asc" });
    orden = ordenAlTocarTitulo(orden, "overdue");
    expect(orden).toEqual({ key: "overdue", dir: "desc" });
  });

  it("el nombre arranca A→Z y los montos de mayor a menor", () => {
    expect(ordenAlTocarTitulo({ key: "total", dir: "desc" }, "name")).toEqual({ key: "name", dir: "asc" });
    expect(ordenAlTocarTitulo({ key: "name", dir: "asc" }, "total")).toEqual({ key: "total", dir: "desc" });
  });

  it("cambiar de píldora DESCARTA el override — la flecha no puede quedar en una columna y la tabla en otro orden", () => {
    // El usuario ordenó a mano por nombre estando en "Total pendiente"…
    const override: OrdenOverride = { risk: "all", key: "name", dir: "asc" };
    expect(ordenEfectivo("all", override)).toEqual({ key: "name", dir: "asc" });
    // …y después toca la píldora de 121d+: manda el tramo nuevo, no el override viejo.
    expect(ordenEfectivo("overdue", override)).toEqual({ key: "overdue", dir: "desc" });
  });

  it("el orden efectivo es UNO solo: lo que dice la flecha es lo que ordena la tabla", () => {
    // Recorre todas las combinaciones y verifica que la lista realmente sale
    // ordenada por la clave/sentido que el encabezado va a dibujar.
    const risks: RiskFilter[] = ["all", "current", "watch", "overdue"];
    const overrides: (OrdenOverride | null)[] = [
      null,
      { risk: "all", key: "name", dir: "asc" },
      { risk: "overdue", key: "total", dir: "asc" },
      { risk: "watch", key: "current", dir: "desc" },
    ];
    for (const risk of risks) {
      for (const override of overrides) {
        const orden = ordenEfectivo(risk, override);
        const lista = ordenarClientes(
          CARTERA.filter((c) => pasaFiltroRiesgo(c, risk)),
          { orden }
        );
        for (let i = 1; i < lista.length; i++) {
          const prev = lista[i - 1];
          const cur = lista[i];
          if (orden.key === "name") {
            const cmp = prev.nombre_normalized.localeCompare(cur.nombre_normalized, "es", { sensitivity: "base" });
            expect(orden.dir === "asc" ? cmp <= 0 : cmp >= 0).toBe(true);
          } else {
            const va = orden.key === "total" ? prev.total : prev[orden.key];
            const vb = orden.key === "total" ? cur.total : cur[orden.key];
            expect(orden.dir === "asc" ? va <= vb : va >= vb).toBe(true);
          }
        }
      }
    }
  });
});

describe("reglas que mandan antes del orden elegido (no se tocaron)", () => {
  // 🩸 Acá vivía «los favoritos ⭐ van arriba aunque deban menos en el tramo».
  // La regla se retiró el 4-sep-2026 con la estrella (Daniel: «quita
  // favoritos»; `cxc_favorites` tuvo 0 filas en toda su historia), así que hoy
  // se mide lo contrario: el tramo manda solo, sin nadie colado arriba.
  it("🔴 nada se cuela arriba del tramo: manda el monto de ese tramo", () => {
    const lista = ordenarClientes(CARTERA.filter((c) => pasaFiltroRiesgo(c, "overdue")), {
      orden: ordenParaRiskFilter("overdue"),
    });
    expect(lista.map((c) => c.nombre_normalized)).toEqual(["CARLA", "BETO", "ANA"]);
    expect(ordenarClientes).toHaveLength(2); // (lista, opts) — sin un 3.º de favoritos
  });

  it("los saldos a favor (negativos) quedan al final", () => {
    const credito: ClienteOrdenable = { nombre_normalized: "ZETA", current: 0, watch: 0, overdue: 200, total: -800 };
    const lista = ordenarClientes([credito, ...CARTERA], {
      orden: ordenParaRiskFilter("overdue")
    });
    expect(lista[lista.length - 1].nombre_normalized).toBe("ZETA");
  });

  it("montos empatados desempatan por nombre (orden estable)", () => {
    const a = cliente("BBB", 0, 0, 1_000);
    const b = cliente("AAA", 0, 0, 1_000);
    const lista = ordenarClientes([a, b], { orden: ordenParaRiskFilter("overdue") });
    expect(lista.map((c) => c.nombre_normalized)).toEqual(["AAA", "BBB"]);
  });

  it("ordenar no muta la lista original", () => {
    const original = [...CARTERA];
    ordenarClientes(CARTERA, { orden: ordenParaRiskFilter("overdue") });
    expect(CARTERA).toEqual(original);
  });

  it("no cambia ningún número: los montos salen intactos", () => {
    const lista = ordenarClientes(CARTERA, { orden: ordenParaRiskFilter("watch") });
    const sumar = (xs: ClienteOrdenable[], k: "current" | "watch" | "overdue" | "total") =>
      xs.reduce((s, c) => s + c[k], 0);
    for (const k of ["current", "watch", "overdue", "total"] as const) {
      expect(sumar(lista, k)).toBe(sumar(CARTERA, k));
    }
  });
});

describe("etiqueta del orden en pantalla", () => {
  it("usa los mismos rangos que las columnas (0-90 / 91-120 / 121+, los de Daniel)", () => {
    expect(etiquetaOrden("current")).toBe("0-90d");
    expect(etiquetaOrden("watch")).toBe("91-120d");
    expect(etiquetaOrden("overdue")).toBe("121d+");
    expect(etiquetaOrden("total")).toBe("total");
    expect(etiquetaOrden("name")).toBe("nombre");
  });
});
