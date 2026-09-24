// ─────────────────────────────────────────────────────────────────────────────
// CUENTAS POR COBRAR EN EL CELULAR — «LA LISTA ES LA CARTERA» (24-sep-2026).
//
// 🩸 QUÉ REEMPLAZA, medido contra producción el 24-sep-2026 (100 clientes con
// saldo, $4.194.743,63 — el número que devuelve hoy `switch_estadocuenta_aging_mv`
// acotada a las 6 del grupo):
//   · **83 de 100 montos salían redondeados**: la fila decía «$44K» donde el
//     cliente debe $43.806,10, y sumando las 100 tarjetas el redondeo escondía
//     $20.794,51. El peor caso erraba un 29 %.
//   · **Abría por el que menos plata tiene**: los 10 primeros eran el 2,0 % de
//     la cartera y City Mall Paso Canoa ($650.276,18, el más grande) caía en la
//     posición 66 — 15 pantallazos de arrastre.
//   · **141 de 300 chips por cliente se dibujaban vacíos** (47 %), 64 px de los
//     191 de cada tarjeta.
//   · El cajón de documentos era la tabla de 5 columnas del escritorio a 390 px:
//     **105 de 695 celdas cortadas**, «1008$10,994.2».
//
// 🔴 LO QUE NO PUEDE CAMBIAR, y es lo que este archivo sostiene:
//   1. Los totales del celular son los MISMOS que los de la computadora, sobre
//      el mismo fixture. Nada se recalcula con otra regla.
//   2. La lista abre por plata y un chip ordena por SU tramo — con la función
//      del módulo (`ordenParaRiskFilter`), no con un comparador nuevo.
//   3. «Por empresa» suma exactamente el total de la portada.
//   4. Tocar la fila abre la MISMA `HojaCobrar`: acá no se manda nada.
//   5. En el celular no hay una sola `<table>` ni un solo deslizamiento de lado.
//   6. La computadora no se movió: `ORDEN_AL_ABRIR` sigue siendo «más viejo sin
//      pagar» y `PanelCxcMobile` —lo que se dibuja con el interruptor apagado—
//      está intacto.
//   7. Boston no entra por ningún lado.
//
// El fixture son CLIENTES REALES con sus cifras reales (leídas el 24-sep-2026):
// si alguien cambia una suma, los números dejan de cuadrar contra producción.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import React from "react";

vi.mock("@/components/shared/SyncStatus", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));

import PanelCxcCelular from "@/app/cxc/components/PanelCxcCelular";
import { HojaPorEmpresa } from "@/app/cxc/components/HojasCxcCelular";
import TiraTotales from "@/app/cxc/components/TiraTotales";
import type { ConsolidatedClient } from "@/lib/types";
import type { Company } from "@/lib/companies";
import { B2B_COMPANIES } from "@/lib/companies";
import { formatCompactCurrency } from "@/lib/ventas/format";
import { fmt } from "@/lib/format";
import { ORDEN_AL_ABRIR, ordenParaRiskFilter, ordenarClientes, pasaFiltroRiesgo } from "@/lib/cxc-orden";
import {
  carteraPorEmpresa,
  empresasDelCliente,
  haceCuanto,
  loQueUrge,
  montoExacto,
  ordenDelCelular,
  subtituloDeLaPortada,
  totalDeLaPortada,
  tramoDominante,
  ultimoPagoDelCliente,
} from "@/lib/cxc/lista-celular";
import { CXC_CELULAR } from "@/lib/cxc/celular";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

afterEach(cleanup);
beforeEach(() => {
  if (!("localStorage" in window) || !window.localStorage) {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// El fixture: cinco clientes de verdad, con las cifras de producción
// ─────────────────────────────────────────────────────────────────────────────

type Emp = ConsolidatedClient["companies"][string];

function emp(
  codigo: string,
  nombre: string,
  cur: number,
  watch: number,
  over: number,
  extra: Partial<Emp> = {},
): Emp {
  return {
    nombre,
    codigo,
    d0_30: cur, d31_60: 0, d61_90: 0,
    d91_120: watch,
    d121_180: over, d181_270: 0, d271_365: 0, mas_365: 0,
    total: Math.round((cur + watch + over) * 100) / 100,
    ...extra,
  };
}

function cliente(
  codigo: string,
  normalizado: string,
  nombre: string,
  porEmpresa: Record<string, Emp>,
): ConsolidatedClient {
  let total = 0, current = 0, watch = 0, overdue = 0;
  for (const d of Object.values(porEmpresa)) {
    total += d.total;
    current += d.d0_30 + d.d31_60 + d.d61_90;
    watch += d.d91_120;
    overdue += d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365;
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    nombre_normalized: normalizado,
    companies: porEmpresa,
    correo: `${codigo.toLowerCase()}@ejemplo.com`,
    telefono: "", celular: "", contacto: "",
    total: r(total), current: r(current), watch: r(watch), overdue: r(overdue),
    d0_30: r(current), d31_60: 0, d61_90: 0, d91_120: r(watch), d121_plus: r(overdue),
    hasOverride: false,
  } as ConsolidatedClient;
}

// D-25 · City Mall Paso Canoa · $650.276,18 en las SEIS (cifras de la base).
const PASO_CANOA = cliente("D-25", "CITY MALL PASO CANOA", "City Mall Paso Canoa", {
  fashion_wear: emp("D-25", "City Mall Paso Canoa", 218795.86, 5579.91, 0, {
    ultimoPagoFecha: "2026-08-20", ultimoPagoMonto: 63592.11,
    ultimaCompraFecha: "2026-09-23", ultimaCompraMonto: 20762.28,
  }),
  fashion_shoes: emp("D-25", "City Mall Paso Canoa", 98365.22, 23695.7, 43643.91, {
    ultimoPagoFecha: "2026-08-20", ultimoPagoMonto: 37561.4,
  }),
  active_shoes: emp("D-25", "City Mall Paso Canoa", 82167.6, 47692.93, 0, {
    ultimoPagoFecha: "2026-08-20", ultimoPagoMonto: 47227.35,
  }),
  vistana: emp("D-25", "City Mall Paso Canoa", 83044.84, 14390.84, 0, {
    ultimoPagoFecha: "2026-08-20", ultimoPagoMonto: 85808.35,
  }),
  active_wear: emp("D-25", "City Mall Paso Canoa", 7146.88, 15464.97, 2732.37, {
    ultimoPagoFecha: "2026-06-29", ultimoPagoMonto: 2732.37,
  }),
  joystep: emp("D-25", "City Mall Paso Canoa", 7555.15, 0, 0, {
    ultimoPagoFecha: "2026-06-29", ultimoPagoMonto: 3766.0,
  }),
});

// D-87 · La Frontera Duty Free · $380.732,79, casi todo de más de 120 días.
// Su deuda vieja va repartida entre 121-180 y MÁS DE UN AÑO a propósito: los
// cuatro tramos finos de Switch se suman en «más de 120», y olvidar uno es
// exactamente la clase de resta callada que este archivo tiene que cazar.
const FRONTERA = cliente("D-87", "LA FRONTERA DUTY FREE", "La Frontera Duty Free", {
  fashion_wear: emp("D-87", "La Frontera Duty Free", 10111.0, 0, 370621.79, {
    d121_180: 170621.79, mas_365: 200000.0,
  }),
});

// D-24 · City Mall David · $323.742,73.
const DAVID = cliente("D-24", "CITY MALL DAVID", "City Mall David", {
  vistana: emp("D-24", "City Mall David", 150000.0, 58529.12, 115213.61),
});

// D-170 · Nova Lux · $294.760,42, todo dentro del plazo y pagó hace poco.
const NOVA = cliente("D-170", "NOVA LUX, S.A.", "Nova Lux, S.A.", {
  fashion_shoes: emp("D-170", "Nova Lux, S.A.", 294760.42, 0, 0, {
    ultimoPagoFecha: "2026-09-23", ultimoPagoMonto: 5000,
  }),
});

// Un saldo A FAVOR: nunca se le cobra y siempre va al final.
const A_FAVOR = cliente("D-999", "TIENDA CON CREDITO", "Tienda Con Credito", {
  joystep: emp("D-999", "Tienda Con Credito", -1207.55, 0, 0),
});

const CARTERA = [PASO_CANOA, FRONTERA, DAVID, NOVA, A_FAVOR];
const TOTAL_CARTERA = 650276.18 + 380732.79 + 323742.73 + 294760.42 - 1207.55;

const EMPRESAS: Company[] = B2B_COMPANIES;
const HOY = "2026-09-24"; // fecha FIJA: Panamá es UTC−5 y `new Date()` rompería

const DIAS: Record<string, number | null> = {
  "CITY MALL PASO CANOA": 35,
  "LA FRONTERA DUTY FREE": 313,
  "CITY MALL DAVID": 142,
  "NOVA LUX, S.A.": 1,
  "TIENDA CON CREDITO": null,
};
const diasDe = (c: ConsolidatedClient) => DIAS[c.nombre_normalized] ?? null;

function pintar(extra: Partial<React.ComponentProps<typeof PanelCxcCelular>> = {}) {
  const risk = extra.riskFilter ?? "all";
  const filtrada = risk === "all" ? CARTERA : CARTERA.filter((c) => pasaFiltroRiesgo(c, risk));
  return render(
    <PanelCxcCelular
      filtered={filtrada}
      roleClients={CARTERA}
      cxcCompanies={EMPRESAS}
      search=""
      setSearch={vi.fn()}
      riskFilter="all"
      setRiskFilter={vi.fn()}
      companyFilter="all"
      setCompanyFilter={vi.fn()}
      onCobrar={vi.fn()}
      diasSinPagarDe={diasDe}
      canExport
      onDescargar={vi.fn()}
      empresaRestriction={null}
      avisoMontos={null}
      onBoston={null}
      {...extra}
    />,
  );
}

const filasDeLaLista = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-lista="cxc-celular"] > li')] as HTMLElement[];

// ═════════════════════════════════════════════════════════════════════════════
// 1 · El interruptor
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 1 · el interruptor `CXC_CELULAR`", () => {
  it("existe, está prendido, y es lo único que decide qué panel se dibuja", () => {
    expect(CXC_CELULAR).toBe(true);
    const pagina = sinComentarios(leer("src/app/cxc/page.tsx"));
    expect(pagina).toContain('import { CXC_CELULAR } from "@/lib/cxc/celular"');
    expect(pagina).toMatch(/\{CXC_CELULAR \? \(\s*<PanelCxcCelular/);
    expect(pagina, "apagado tiene que volver el panel de antes").toContain("<PanelCxcMobile");
  });

  it("🔴 apagado = la pantalla de antes INTACTA: `PanelCxcMobile` no se tocó", () => {
    const viejo = sinComentarios(leer("src/app/cxc/components/PanelCxcMobile.tsx"));
    // Las tres marcas que sus propios candados exigen desde el 20-sep-2026.
    expect(viejo).toContain("const sortedMobile = filtered;");
    expect(viejo).not.toContain("ordenarClientes");
    expect(viejo).not.toContain("ordenDelCelular");
    // Y no importa nada del celular nuevo.
    expect(viejo).not.toContain("lista-celular");
  });

  it("⚠️ y la computadora no se movió: sigue abriendo por «más viejo sin pagar»", () => {
    expect(ORDEN_AL_ABRIR).toEqual({ risk: "all", key: "sinPagar", dir: "desc" });
    expect(sinComentarios(leer("src/app/cxc/page.tsx")))
      .toContain("useState<OrdenOverride | null>(ORDEN_AL_ABRIR)");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · Los totales son los MISMOS que los de la computadora
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 2 · ningún total se recalcula en el navegador", () => {
  it("el número grande es el total EXACTO de la misma cartera", () => {
    const { container } = pintar();
    expect(container.textContent).toContain(montoExacto(TOTAL_CARTERA));
    expect(montoExacto(TOTAL_CARTERA)).toBe("$1,648,305");
  });

  it("🔴 los tres chips dicen lo MISMO que la tira de la computadora", () => {
    const { container } = pintar();
    const celular = container.textContent ?? "";
    const tira = render(
      <TiraTotales
        roleClients={CARTERA}
        riskFilter="all"
        onRiskFilterChange={vi.fn()}
        sinPagar={null}
        sinPagarActivo={false}
        onToggleSinPagar={vi.fn()}
      />,
    );
    // Las dos pantallas escriben el MISMO número (la tira con centavos, el chip
    // compacto, que es lo que cabe en 390 px). Si una de las dos sumara
    // distinto, una de las dos afirmaciones se cae.
    for (const k of ["current", "watch", "overdue"] as const) {
      const suma = CARTERA.reduce((s, c) => s + c[k], 0);
      expect(celular, `el celular no dice ${k}`).toContain(formatCompactCurrency(suma));
      expect(tira.container.textContent, `la computadora no dice ${k}`).toContain(`$${fmt(suma)}`);
    }
  });

  it("con un chip puesto, el número grande es el de ESE tramo", () => {
    const totals = {
      total: TOTAL_CARTERA,
      current: CARTERA.reduce((s, c) => s + c.current, 0),
      watch: CARTERA.reduce((s, c) => s + c.watch, 0),
      overdue: CARTERA.reduce((s, c) => s + c.overdue, 0),
    };
    expect(totalDeLaPortada(totals, "overdue")).toBeCloseTo(532211.68, 2);
    const { container } = pintar({ riskFilter: "overdue" });
    expect(container.textContent).toContain(montoExacto(totals.overdue));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · El orden: el que más debe, arriba
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 3 · el celular abre por plata", () => {
  it("la primera fila es la del que más debe, y el saldo a favor va al final", () => {
    const { container } = pintar();
    const filas = filasDeLaLista(container);
    expect(filas[0].textContent).toContain("City Mall Paso Canoa");
    expect(filas[filas.length - 1].textContent).toContain("Tienda Con Credito");
  });

  it("🩸 con el orden de la computadora, el más grande NO estaría primero", () => {
    const porDias = ordenarClientes(CARTERA, { orden: ORDEN_AL_ABRIR, diasSinPagar: diasDe });
    expect(porDias[0].nombre_normalized).toBe("LA FRONTERA DUTY FREE");
    const porPlata = ordenarClientes(CARTERA, { orden: ordenDelCelular("all") });
    expect(porPlata[0].nombre_normalized).toBe("CITY MALL PASO CANOA");
  });

  it("🔴 el orden del celular ES la regla del módulo, no una nueva", () => {
    expect(ordenDelCelular("all")).toEqual(ordenParaRiskFilter("all"));
    expect(ordenDelCelular("overdue")).toEqual(ordenParaRiskFilter("overdue"));
    expect(ordenDelCelular("all")).toEqual({ key: "total", dir: "desc" });
  });

  it("🔴 un chip ordena por la plata DE ESE TRAMO", () => {
    const { container } = pintar({ riskFilter: "overdue" });
    const filas = filasDeLaLista(container);
    // La Frontera debe MENOS en total que Paso Canoa, pero MÁS de 120 días.
    expect(filas[0].textContent).toContain("La Frontera Duty Free");
    expect(FRONTERA.total).toBeLessThan(PASO_CANOA.total);
    expect(FRONTERA.overdue).toBeGreaterThan(PASO_CANOA.overdue);
  });

  it("y el subtítulo dice cuántos son y de qué tramo, con «ver todo»", () => {
    const { container } = pintar({ riskFilter: "overdue" });
    expect(container.textContent).toContain("con más de 120 días");
    expect(screen.getByRole("button", { name: "ver todo" })).toBeTruthy();
    expect(subtituloDeLaPortada({ cuantos: 95, risk: "all", empresas: 6, unaEmpresa: null }))
      .toBe("95 clientes en las 6 empresas · el que más debe, arriba");
    expect(subtituloDeLaPortada({ cuantos: 40, risk: "overdue", empresas: 6, unaEmpresa: null }))
      .toBe("40 clientes con más de 120 días");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · La fila: dos renglones y el monto EXACTO
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 4 · cada fila son dos renglones y el monto va exacto", () => {
  it("🩸 el monto ya NO va redondeado al millar", () => {
    const { container } = pintar();
    const primera = filasDeLaLista(container)[0];
    expect(primera.textContent).toContain("$650,276");
    expect(primera.textContent, "volvió el redondeo").not.toContain("$650K");
  });

  it("el nombre es el que escribe Switch, no la llave de pareo en mayúsculas", () => {
    const { container } = pintar();
    expect(container.textContent).toContain("City Mall Paso Canoa");
    expect(container.textContent).not.toContain("CITY MALL PASO CANOA");
  });

  it("debajo del nombre va lo que urge, y nunca la palabra «vencido»", () => {
    const { container } = pintar();
    expect(container.textContent).toContain("con más de 120 días");
    expect(container.textContent?.toLowerCase(), "«vencido» está prohibido").not.toContain("vencid");
  });

  it("🩸 y se fueron los tres chips por cliente (47 % salían vacíos)", () => {
    const { container } = pintar();
    for (const fila of filasDeLaLista(container)) {
      expect(fila.textContent, "volvió un chip vacío a la fila").not.toContain("—");
      expect(fila.querySelectorAll("button")).toHaveLength(1); // la fila ENTERA
    }
  });

  it("«lo que urge» dice una sola cosa, la más urgente", () => {
    expect(loQueUrge(FRONTERA, 313)).toBe("$370,622 con más de 120 días");
    // 🔴 Paso Canoa debe en los TRES tramos: manda el de más de 120 días, que
    // es el que se reclama, aunque sea el más chico de los tres.
    expect(PASO_CANOA.watch).toBeGreaterThan(PASO_CANOA.overdue);
    expect(loQueUrge(PASO_CANOA, 35)).toBe("$46,376 con más de 120 días");
    expect(loQueUrge(NOVA, 1)).toBe("no paga hace 1 día");
    expect(loQueUrge(NOVA, 0)).toBe("al día");
    expect(loQueUrge({ ...NOVA, watch: 0, overdue: 0 } as ConsolidatedClient, null)).toBe("nunca ha pagado");
    expect(loQueUrge(A_FAVOR, null)).toBe("tiene saldo a favor");
  });

  it("la rayita es el tramo DONDE ESTÁ LA PLATA, no el peor con algo adentro", () => {
    // Paso Canoa tiene $46.376 de más de 120 días… sobre $650.276: es verde.
    expect(tramoDominante(PASO_CANOA)).toBe("current");
    expect(tramoDominante(FRONTERA)).toBe("overdue");
    expect(tramoDominante(A_FAVOR)).toBeNull();
  });

  it("el monto exacto se escribe sin centavos y con el signo adelante", () => {
    expect(montoExacto(650276.18)).toBe("$650,276");
    expect(montoExacto(43806.1)).toBe("$43,806");
    expect(montoExacto(-1207.55)).toBe("-$1,208");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · Tocar la fila abre la MISMA hoja «Cobrar»
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 5 · cobrar son dos toques, por la hoja de siempre", () => {
  it("tocar la fila llama a `onCobrar` con ese cliente", () => {
    const onCobrar = vi.fn();
    const { container } = pintar({ onCobrar });
    fireEvent.click(within(filasDeLaLista(container)[0]).getByRole("button"));
    expect(onCobrar).toHaveBeenCalledTimes(1);
    expect(onCobrar.mock.calls[0][0].nombre_normalized).toBe("CITY MALL PASO CANOA");
  });

  it("🔴 al que tiene saldo a favor no se le cobra: su fila no abre la hoja", () => {
    const onCobrar = vi.fn();
    const { container } = pintar({ onCobrar });
    const ultima = filasDeLaLista(container).at(-1)!;
    fireEvent.click(within(ultima).getByRole("button"));
    expect(onCobrar).not.toHaveBeenCalled();
  });

  it("🔴 el celular NO manda nada: no hay un segundo camino de cobro", () => {
    const src = sinComentarios(leer("src/app/cxc/components/PanelCxcCelular.tsx"));
    for (const prohibido of ["enviar-email", "waHref", "mailto:", "clipboard", "fetch("]) {
      expect(src, `el celular empezó a mandar por su cuenta: ${prohibido}`).not.toContain(prohibido);
    }
  });

  it("la hoja sigue siendo UNA sola, y sus cuatro salidas no cambiaron", () => {
    const hoja = leer("src/app/cxc/components/HojaCobrar.tsx");
    for (const titulo of ["Correo", "WhatsApp", "Copiar el mensaje", "Ver o bajar el PDF"]) {
      expect(hoja).toContain(`titulo="${titulo}"`);
    }
    // Lo que el celular le agregó son DOS líneas y un enlace — nada que se mande.
    expect(hoja).toContain("Ver los documentos ›");
    expect(hoja).toContain("hrefDocumentos");
    const pagina = sinComentarios(leer("src/app/cxc/page.tsx"));
    expect(pagina, "la computadora recibiría el enlace del celular")
      .toContain("cobrarDesdeCelular && cobrarClient");
  });

  it("«Último pago» sale del dato que ya está, sin pedir nada", () => {
    expect(ultimoPagoDelCliente(PASO_CANOA)).toEqual({ fecha: "2026-08-20", monto: 234189.21 });
    expect(ultimoPagoDelCliente(A_FAVOR)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6 · «Por empresa» suma exactamente lo mismo
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 6 · «Por empresa» cuadra con la portada", () => {
  const filas = carteraPorEmpresa(CARTERA, EMPRESAS.map((e) => ({ key: e.key, name: e.name })));

  it("las empresas del fixture suman el total de la portada, al centavo", () => {
    const suma = filas.reduce((s, f) => s + f.total, 0);
    expect(Math.round(suma * 100)).toBe(Math.round(TOTAL_CARTERA * 100));
  });

  it("y cada tramo también — incluidos los de más de un año", () => {
    expect(FRONTERA.companies.fashion_wear.mas_365).toBeGreaterThan(0);
    for (const k of ["current", "watch", "overdue"] as const) {
      const porEmpresa = filas.reduce((s, f) => s + f[k], 0);
      const porCliente = CARTERA.reduce((s, c) => s + c[k], 0);
      expect(Math.round(porEmpresa * 100), k).toBe(Math.round(porCliente * 100));
    }
  });

  it("van ordenadas por lo que se debe, y solo las que tienen clientes", () => {
    expect(filas.map((f) => f.key)).toEqual([...filas].sort((a, b) => b.total - a.total).map((f) => f.key));
    expect(filas.every((f) => f.clientes > 0)).toBe(true);
  });

  it("🔴 Boston no aparece: la lista de empresas la manda quien llama", () => {
    expect(filas.map((f) => f.key)).not.toContain("confecciones_boston");
    expect(EMPRESAS.map((e) => e.key)).not.toContain("confecciones_boston");
    const src = sinComentarios(leer("src/lib/cxc/lista-celular.ts"));
    expect(src).not.toContain("boston");
  });

  it("la hoja dice el pulso de cada empresa: quién pagó y cuándo", () => {
    const { container } = render(
      <HojaPorEmpresa
        clientes={CARTERA}
        empresas={EMPRESAS}
        onElegirEmpresa={vi.fn()}
        onCerrar={vi.fn()}
      />,
    );
    expect(container.textContent).toContain("pagó City Mall Paso Canoa");
    expect(container.textContent).toContain("vendió");
  });

  it("tocar una empresa deja la portada filtrada en ella", () => {
    const onElegirEmpresa = vi.fn();
    const { container } = render(
      <HojaPorEmpresa
        clientes={CARTERA}
        empresas={EMPRESAS}
        onElegirEmpresa={onElegirEmpresa}
        onCerrar={vi.fn()}
      />,
    );
    const filaFW = [...container.querySelectorAll('[data-lista="cxc-por-empresa"] > li button')]
      .find((b) => b.textContent?.includes("Fashion Wear"))!;
    fireEvent.click(filaFW);
    expect(onElegirEmpresa).toHaveBeenCalledWith("fashion_wear");
  });

  it("«ayer» y «hace N d» se dicen con el hoy de Panamá, nunca con el reloj", () => {
    expect(haceCuanto("2026-09-24", HOY)).toBe("hoy");
    expect(haceCuanto("2026-09-23", HOY)).toBe("ayer");
    expect(haceCuanto("2026-09-17", HOY)).toBe("hace 7 d");
    expect(haceCuanto(null, HOY)).toBeNull();
    expect(sinComentarios(leer("src/lib/cxc/lista-celular.ts"))).not.toContain("new Date()");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7 · Nada se desliza de lado, y no hay una sola tabla
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 7 · en el celular no hay tablas ni deslizamiento lateral", () => {
  it("la portada no dibuja ni un `<table>`", () => {
    const { container } = pintar();
    expect(container.querySelector("table")).toBeNull();
  });

  it("y la página de un cliente tampoco — es una lista de renglones", () => {
    const src = sinComentarios(leer("src/app/cxc/cliente/[codigo]/ClienteCxc.tsx"));
    expect(src).not.toContain("<table");
    expect(src).not.toContain("overflow-x");
    expect(src).not.toContain("grid-cols-12");
  });

  it("🔴 la página del cliente NO recalcula los tramos con los documentos", () => {
    const src = sinComentarios(leer("src/app/cxc/cliente/[codigo]/ClienteCxc.tsx"));
    expect(src).toContain("empresasDelCliente(client, nombrePorKey, docsPorKey)");
    // Del estado de cuenta se toma cuántos documentos son y cuál es el más
    // viejo; los tramos y los totales, del aging. Acá no se suma un tramo: la
    // única mención de las columnas finas es el adaptador a la hoja «Cobrar»,
    // que las pasa TAL CUAL.
    expect(src, "la página empezó a sumar tramos por su cuenta").not.toMatch(/d121_180\s*\+/);
    expect(src).not.toMatch(/d0_30\s*\+/);
  });

  it("los renglones por empresa del cliente suman su total", () => {
    const nombres = Object.fromEntries(EMPRESAS.map((e) => [e.key, e.name]));
    const filas = empresasDelCliente(PASO_CANOA, nombres, {});
    expect(filas).toHaveLength(6);
    const suma = filas.reduce((s, f) => s + f.total, 0);
    expect(Math.round(suma * 100)).toBe(Math.round(PASO_CANOA.total * 100));
    expect(Math.round(PASO_CANOA.total * 100)).toBe(65027618);
  });

  it("y la ficha del cliente dejó de cortar el monto a 390 px", () => {
    const ficha = leer("src/app/clientes/[codigo]/ClienteDetail.tsx");
    // 🩸 `$43,806.10` salía como `$43,806.1C`: `w-full` dentro de un
    // `overflow-x-auto` nunca desborda, así que la tabla se encogía.
    expect(ficha).toContain('<table className="w-full min-w-max text-sm">');
    expect(ficha).toContain("whitespace-nowrap");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8 · Boston, y lo que se fue de la pantalla
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 8 · Boston aparte, y la pantalla sin lo que estorbaba", () => {
  it("Boston es un botón, y solo para quien puede leer su cartera", () => {
    const { container } = pintar({ onBoston: null });
    expect(container.textContent).not.toContain("Boston");
    cleanup();
    const onBoston = vi.fn();
    pintar({ onBoston });
    fireEvent.click(screen.getByRole("button", { name: "Boston" }));
    expect(onBoston).toHaveBeenCalled();
    const pagina = sinComentarios(leer("src/app/cxc/page.tsx"));
    expect(pagina).toContain('pestanasCxc(userRole).some((p) => p.key === "boston")');
  });

  it("🩸 se fueron la tarjeta negra, «Ver detalle» y el segundo «Cobrar»", () => {
    const { container } = pintar();
    const texto = container.textContent ?? "";
    expect(texto).not.toContain("TOTAL PENDIENTE");
    expect(texto).not.toContain("Ver detalle");
    expect(texto).not.toContain("Ocultar detalle");
    expect(texto).not.toContain("Desglose por empresa");
  });

  it("🩸 «Actualizar ahora» ya no ocupa un renglón: vive en el «···»", () => {
    const { container } = pintar();
    expect(container.textContent).not.toContain("Actualizar ahora");
    expect(leer("src/app/cxc/components/HojasCxcCelular.tsx")).toContain("SyncNowButton");
  });

  it("el buscador se queda, y con él se limpian los filtros", () => {
    const setSearch = vi.fn();
    pintar({ setSearch });
    fireEvent.change(screen.getByLabelText("Buscar cliente"), { target: { value: "frontera" } });
    expect(setSearch).toHaveBeenCalledWith("frontera");
  });
});
