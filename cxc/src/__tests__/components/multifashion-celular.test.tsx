// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — MULTIFASHION EN EL CELULAR: «un número y cuatro renglones»
// (24-sep-2026, mockup aprobado por Daniel).
//
// Lo que este archivo congela:
//   1. Al abrir, el MES es el número: «$32,946», con «▲ 29 % contra septiembre
//      2025 · cierra en $47,117». Ninguno de esos números se calcula acá.
//   2. «‹ Agosto» cambia de mes y «Octubre ›» solo si el mes elegido no es el
//      actual. 🔴 NUNCA se navega al futuro.
//   3. CUATRO renglones con su texto: Año · Vendedoras · Productos · Clientes.
//   4. Vendedoras: una fila por vendedora, con «tienda · redes» en Sheynee, y
//      la meta como UN renglón.
//   5. En el celular NO hay banda «HOY», ni desplegable de 57 meses, ni las
//      cuatro pestañas.
//   6. 🔴 NINGÚN NÚMERO SE MUEVE: con el MISMO fixture, el total del mes, el %
//      contra el año pasado, «cierra en», el año y cada vendedora dicen lo
//      mismo en la pantalla de antes y en la nueva.
//   7. Con el interruptor apagado (o sin la prop `celular`), el DOM es el de
//      antes: ni un nodo `data-celular`.
//
// Los números son los MEDIDOS en producción el 24-sep-2026 (ver la auditoría
// «Multifashion en el celular»): septiembre $32.945,68 · ▲+29,3 % · cierra en
// $47.117,38 · año $391.231,84 ▲+16,0 % · cuatro vendedoras por $32.649,26.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/multifashion",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { SWRConfig } from "swr";
import {
  MULTIFASHION_CELULAR, barrasDelMes, contraDeVendedoras, deltaCorto, detalleVendedora,
  diasDelMesMirado, encabezadoCelular, esElMesDeHoy, esPantallaCelular, etiquetaMesCorto,
  lineaDelMes, lineaVendedora, mesAnterior, mesSiguiente, montoCorto, renglonMeta,
  renglonesDelInicio, subtituloDelMes, subtituloVendedoras,
} from "@/lib/multifashion/celular";
import { formatDeltaRatio } from "@/lib/ventas/formatDelta";
import { MultifashionResumenView } from "@/components/multifashion/MultifashionResumenView";
import { MultifashionView } from "@/components/multifashion/MultifashionView";
import { VendedorasSubtab } from "@/components/multifashion/VendedorasSubtab";
import type { MetaConAvance } from "@/lib/multifashion/metas-lectura";
import type { Periodo } from "@/lib/multifashion/periodo";

const raiz = process.cwd();
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CORTE = { anio: 2026, mes: 9 };
const SEPTIEMBRE: Periodo = { tipo: "mes", anio: 2026, mes: 9 };
const AGOSTO: Periodo = { tipo: "mes", anio: 2026, mes: 8 };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ═════════════════════════════════════════════════════════════════════════════
// 1 · LAS PIEZAS PURAS
// ═════════════════════════════════════════════════════════════════════════════

describe("1 · el interruptor y los números del celular", () => {
  it("el interruptor está PRENDIDO", () => {
    expect(MULTIFASHION_CELULAR).toBe(true);
  });

  it("🔴 el monto del celular es el redondeo que YA existía: $32,945.68 → «$32,946»", () => {
    expect(montoCorto(32945.68)).toBe("$32,946");
    expect(montoCorto(391231.84)).toBe("$391,232");
    expect(montoCorto(47117.38)).toBe("$47,117");
    expect(montoCorto(756973.75)).toBe("$756,974");
  });

  it("🔴 el cambio dice el MISMO entero y el MISMO color que la tabla de computadora", () => {
    for (const d of [0.293, -0.12, 0.39, -0.4, 0.16, 0.004, -0.049]) {
      const viejo = formatDeltaRatio(d);
      const nuevo = deltaCorto(d)!;
      const enteroViejo = Math.abs(Number(viejo.displayValue.replace("%", "")));
      const enteroNuevo = Number(nuevo.texto.replace(/[▲▼=\s%]/g, ""));
      expect(enteroNuevo, `entero de ${d}`).toBe(enteroViejo);
      const esperado = viejo.tone === "emerald" ? "sube" : viejo.tone === "orange" ? "baja" : "neutro";
      expect(nuevo.tono, `tono de ${d}`).toBe(esperado);
    }
    expect(deltaCorto(0.293)!.texto).toBe("▲ 29 %");
    expect(deltaCorto(-0.12)!.texto).toBe("▼ 12 %");
    expect(deltaCorto(0.39)!.texto).toBe("▲ 39 %");
    // Sin con qué comparar no se dibuja nada — no un «n/a» al lado del monto.
    expect(deltaCorto(null)).toBeNull();
  });

  it("🔴 NUNCA hacia el futuro: septiembre (el mes de corte) no ofrece «Octubre ›»", () => {
    expect(mesSiguiente(SEPTIEMBRE, CORTE)).toBeNull();
    expect(mesSiguiente(AGOSTO, CORTE)).toEqual(SEPTIEMBRE);
    expect(mesSiguiente({ tipo: "mes", anio: 2025, mes: 12 }, CORTE)).toEqual({ tipo: "mes", anio: 2026, mes: 1 });
    expect(mesAnterior(SEPTIEMBRE)).toEqual(AGOSTO);
    expect(mesAnterior({ tipo: "mes", anio: 2026, mes: 1 })).toEqual({ tipo: "mes", anio: 2025, mes: 12 });
    // Un rango no es un mes: no hay flechas.
    expect(mesAnterior({ tipo: "ultimos", n: 3 })).toBeNull();
    expect(mesSiguiente({ tipo: "anio", anio: 2026 }, CORTE)).toBeNull();
  });

  it("el mes del año en curso va sin año; el de otro año lo lleva", () => {
    expect(etiquetaMesCorto(SEPTIEMBRE, CORTE)).toBe("Septiembre");
    expect(etiquetaMesCorto({ tipo: "mes", anio: 2025, mes: 9 }, CORTE)).toBe("Septiembre 2025");
  });

  it("🔴 el encabezado: el mes con sus dos flechas, y las otras pantallas vuelven al mes", () => {
    expect(encabezadoCelular({ tab: "resumen", pantalla: "inicio", periodo: SEPTIEMBRE, corte: CORTE }))
      .toEqual({ titulo: "Septiembre", atras: "Agosto", adelante: null });
    expect(encabezadoCelular({ tab: "resumen", pantalla: "inicio", periodo: AGOSTO, corte: CORTE }))
      .toEqual({ titulo: "Agosto", atras: "Julio", adelante: "Septiembre" });
    expect(encabezadoCelular({ tab: "resumen", pantalla: "anio", periodo: SEPTIEMBRE, corte: CORTE }))
      .toEqual({ titulo: "Año 2026", atras: "Septiembre", adelante: null });
    expect(encabezadoCelular({ tab: "vendedoras", pantalla: "inicio", periodo: SEPTIEMBRE, corte: CORTE }))
      .toEqual({ titulo: "Vendedoras", atras: "Septiembre", adelante: null });
    expect(encabezadoCelular({ tab: "productos", pantalla: "inicio", periodo: SEPTIEMBRE, corte: CORTE }).titulo).toBe("Productos");
    expect(encabezadoCelular({ tab: "clientes", pantalla: "inicio", periodo: SEPTIEMBRE, corte: CORTE }).titulo).toBe("Clientes");
    expect(esPantallaCelular("anio")).toBe("anio");
    expect(esPantallaCelular("basura")).toBe("inicio");
    expect(esPantallaCelular(undefined)).toBe("inicio");
  });

  it("🩸 LO DE HOY SOLO EN EL MES DE HOY (la banda vieja hablaba de hoy mirando agosto)", () => {
    expect(esElMesDeHoy(SEPTIEMBRE, CORTE)).toBe(true);
    expect(esElMesDeHoy(AGOSTO, CORTE)).toBe(false);
    expect(diasDelMesMirado(SEPTIEMBRE, CORTE, "2026-09-23")).toBe(23);
    expect(diasDelMesMirado(AGOSTO, CORTE, "2026-09-23")).toBe(31);
    expect(diasDelMesMirado({ tipo: "mes", anio: 2026, mes: 2 }, CORTE, "2026-09-23")).toBe(28);

    expect(subtituloDelMes({ dias: 23, hoy: { hayVentas: false, ventas: 0 } }))
      .toBe("23 días · hoy sin ventas todavía");
    expect(subtituloDelMes({ dias: 23, hoy: { hayVentas: true, ventas: 1234.45 } }))
      .toBe("23 días · hoy $1,234");
    // Mes cerrado: ni una palabra de hoy.
    expect(subtituloDelMes({ dias: 31, hoy: null })).toBe("31 días");
    // Todavía no llegó el dato: tampoco se inventa.
    expect(subtituloDelMes({ dias: 23 })).toBe("23 días");
  });

  it("la línea bajo el número grande", () => {
    expect(lineaDelMes({ periodo: SEPTIEMBRE, deltaAnioPasado: 0.29335, cierraEn: 47117.38 })).toEqual({
      delta: { texto: "▲ 29 %", tono: "sube" },
      contra: "contra septiembre 2025",
      cierra: "cierra en $47,117",
    });
    // Mes cerrado (sin proyección): no se escribe «cierra en».
    expect(lineaDelMes({ periodo: AGOSTO, deltaAnioPasado: null, cierraEn: null }))
      .toEqual({ delta: null, contra: null, cierra: null });
  });

  it("🔴 los CUATRO renglones, con el texto del mockup", () => {
    const r = renglonesDelInicio({
      anioDelPeriodo: 2026,
      anio: { anio: 2026, ventas: 391231.84, cierra: 756973.75, delta: 0.16025 },
      vendedoras: { cuantas: 4, tiquetes: 690, ventas: 32649.26 },
      productos: { piezas: 1237, deja: 10491.95, margen: 0.318 },
      clientes: { frecuentes: 99, noVuelven: 723 },
    });
    expect(r.map((x) => x.clave)).toEqual(["anio", "vendedoras", "productos", "clientes"]);
    expect(r[0]).toEqual({
      clave: "anio", titulo: "Año 2026", detalle: "retail · cierra en $756,974",
      monto: "$391,232", delta: { texto: "▲ 16 %", tono: "sube" },
    });
    expect(r[1]).toMatchObject({ titulo: "Vendedoras", detalle: "4 · 690 tiquetes", monto: "$32,649" });
    expect(r[2]).toMatchObject({ titulo: "Productos", detalle: "1,237 piezas · deja $10,492", monto: "margen 32 %" });
    expect(r[3]).toMatchObject({ titulo: "Clientes", detalle: "99 frecuentes · 723 no vuelven", monto: null });
  });

  it("🔴 un dato que no llegó deja el renglón sin número — nunca un $0 inventado", () => {
    const r = renglonesDelInicio({
      anioDelPeriodo: 2026, anio: null, vendedoras: null, productos: null, clientes: null,
    });
    expect(r).toHaveLength(4);
    expect(r[0]).toMatchObject({ titulo: "Año 2026", detalle: null, monto: null });
    for (const x of r) expect(x.monto === null || x.monto.length > 0).toBe(true);
    expect(r.some((x) => x.monto === "$0")).toBe(false);
  });

  it("las barras son el día por día normalizado, y el futuro va apagado", () => {
    const dias = [{ dia: 1, ventas: 500 }, { dia: 2, ventas: 1000 }, { dia: 3, ventas: 0 }];
    const b = barrasDelMes({ dias, esMesActual: true, diaActual: 2 });
    expect(b.map((x) => x.alto)).toEqual([0.5, 1, 0]);
    expect(b.map((x) => x.futuro)).toEqual([false, false, true]);
    // Un mes entero en cero no rompe la división.
    expect(barrasDelMes({ dias: [{ dia: 1, ventas: 0 }], esMesActual: false, diaActual: 30 })[0].alto).toBe(0);
  });

  it("las piezas de Vendedoras", () => {
    expect(contraDeVendedoras("vs agosto 2026", 2026)).toBe("agosto");
    expect(contraDeVendedoras("vs agosto 2025", 2026)).toBe("agosto 2025");
    expect(contraDeVendedoras(null, 2026)).toBeNull();
    expect(subtituloVendedoras({ ventas: 32649.26, tiquetes: 690, rotuloDelta: "vs agosto 2026", anio: 2026, parcial: true }))
      .toBe("$32,649 · 690 tiquetes · contra agosto, mismos días");
    expect(subtituloVendedoras({ ventas: 32649.26, tiquetes: 690, rotuloDelta: "vs agosto 2026", anio: 2026, parcial: false }))
      .toBe("$32,649 · 690 tiquetes · contra agosto");
    // El desglose ya llega con el nombre adelante y «Redes» en mayúscula
    // (24-sep-2026); acá solo se recortan los centavos.
    expect(lineaVendedora({ desglose: "Sheynee $11,419.55 · Redes $135.65", tiquetes: 263, ticketPromedio: 43.94, gerente: false }))
      .toBe("Sheynee $11,420 · Redes $136 · 263 tiquetes");
    expect(lineaVendedora({ desglose: null, tiquetes: 101, ticketPromedio: 67.21, gerente: true }))
      .toBe("gerente · 101 tiquetes · $67.21 promedio");
    expect(detalleVendedora({ comision: 56.71, ticketPromedio: 43.94 }))
      .toBe("Comisión $56.71 · tiquete promedio $43.94");
  });

  it("🔴 la meta es UN renglón, con los mismos números de la tarjeta", () => {
    expect(renglonMeta({ vendido: 32945.68, objetivo: 420000, proyeccion: 440643.43, pctVendido: 0.07844, cerrada: false }))
      .toEqual({ titulo: "$32,946 de $420,000", detalle: "así como van cierran en $440,643", pct: "8 %" });
    expect(renglonMeta({ vendido: 1, objetivo: 2, proyeccion: null, pctVendido: 0.5, cerrada: false }).detalle).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · LA PANTALLA: el número grande y los cuatro renglones
// ═════════════════════════════════════════════════════════════════════════════

const DETALLE = {
  year: 2026, mes: 9, mes_label: "Septiembre", is_mes_actual: true,
  dia_actual: 23, dias_en_mes: 30,
  dias: Array.from({ length: 30 }, (_, i) => ({
    dia: i + 1, ventas: i + 1 <= 23 ? 1400 : 0, utilidad: null,
    n_tickets: i + 1 <= 23 ? 30 : 0, ventas_mes_anterior: 1300, ventas_anio_anterior: 1100,
  })),
  totales: {
    ventas: 32945.68, mayoreo: null, ventas_total: null, utilidad: null,
    n_tickets: 691, ticket_promedio: 47.68, margen: null,
    proyeccion_cierre: 47117.38, proyeccion_dias: 23, proyeccion_dias_mes: 30, proyeccion_base: "temporada",
  },
  mes_anterior: { ventas: 40662, utilidad: null, n_tickets: 800, tiene_data: true },
  yoy: { ventas: 25473.08, utilidad: null, n_tickets: 600, tiene_data: true },
  mejor_dia: { fecha: "2026-09-19", ventas: 4064.3 },
  peor_dia: { fecha: "2026-09-07", ventas: 967.22 },
  heatmap_dia_semana: [],
  horas: [], hora_pico: null, hora_pico_ventas: null,
  anio_anterior: 2025, anio_anterior_tiene_data: true, anio_anterior_mes_completo: 36430.41,
  feriados: [],
  patrones: {
    dow: [{ dow: 6, dow_label: "Sáb", ventas_promedio: 2770.2, count_dias: 12 }],
    mejorDow: { dow: 6, dow_label: "Sáb", ventas_promedio: 2770.2, count_dias: 12 },
    horas: [{ hora: 17, ventas: 19651 }], horaPico: 17, horaPicoVentas: 19651,
    mesesUsados: 3, n_meses: 3, desde: "2026-07", hasta: "2026-09",
  },
};

const MESES_LABEL = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const OVERVIEW = {
  tienda: "American Classics", ubicacion: "Chiriquí", manager: "Jennifer Miranda",
  metaAnual: 800000, expectedTodayPct: 0.49,
  retail: {
    ytdVentas: 391231.84, ytdTickets: 8503, ticketProm: 45.88, margen: null, margenPrev: null,
    meses: MESES_LABEL.map((m, i) => ({
      mes: m, ventas: i === 8 ? 32945.68 : 40000, tickets: 100, ticketProm: 0, vs2025: 0.1,
      fecha_corte: null, es_periodo_parcial: i === 8, dia_corte_anio_anterior: null,
    })),
  },
  total: { ytdVentas: 391231.84, ytdTickets: 8508, margen: 0.3329, margenPrev: 0.3317 },
  wholesale: {
    ytdVentas: 0, ytdTickets: 0, totalClientes: 0, topClienteName: null,
    meses: MESES_LABEL.map((m) => ({ mes: m, ventas: 0, tickets: 0 })),
  },
  proyeccionCierre: {
    year: 2026, tiene_proyeccion: true, proyeccion: 756973.75, cierre_prev: 652420.19,
    delta_pct: 0.16025, ytd_actual: 391231.84, ytd_prev: 337194.72,
  },
  serieActual: { year: 2026, corte: "2026-09-24", es_anio_actual: true, dias: [{ fecha: "2026-09-23", ventas: 1000, acumulado: 391231.84 }], meses: [] },
  seriePrevio: { year: 2025, corte: "2025-12-31", es_anio_actual: false, dias: [{ fecha: "2025-09-23", ventas: 900, acumulado: 337194.72 }], meses: [] },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const VENDEDORAS = {
  vendedoras: [
    { nombre: "SHEYNEE BATISTA", tickets: 263, ventas: 11555.20, ticket_promedio: 43.94, comision: 56.71, manager: false, top: true, delta_ventas_pct: -0.12, delta_tickets_pct: null, por_canal: { redes: 135.65 } },
    { nombre: "JAILINE", tickets: 165, ventas: 7446.10, ticket_promedio: 45.13, comision: 35.80, manager: false, top: false, delta_ventas_pct: -0.40, delta_tickets_pct: null, por_canal: null },
    { nombre: "MILAGROS TORRES", tickets: 161, ventas: 6859.95, ticket_promedio: 42.61, comision: 33.82, manager: false, top: false, delta_ventas_pct: -0.32, delta_tickets_pct: null, por_canal: null },
    { nombre: "JENNIFER MIRANDA", tickets: 101, ventas: 6788.01, ticket_promedio: 67.21, comision: 31.63, manager: true, top: false, delta_ventas_pct: 0.39, delta_tickets_pct: null, por_canal: null },
  ],
  total_vendedoras_periodo: 4, ventas_total: 32649.26, tickets_total: 690,
  ventas_total_prev: 0, tickets_total_prev: 0,
  fecha_corte: "2026-09-23", es_periodo_parcial: true, dia_corte_periodo_anterior: "2026-08-23",
};

const PRODUCTOS = {
  year: 2026, mes: 9, periodo: "mes", desde: "2026-09-01", hasta: "2026-09-23",
  filasLeidas: 0, marcaDisponible: false,
  totales: { unidades: 1237, venta: 32945.68, articulos: 400 },
  marcas: [], sinMarca: { articulos: 0, venta: 0 }, porMarca: null,
  ranking: {
    totales: { unidades: 1237, venta: 32945.68, costo: 22453.73, utilidad: 10491.95, margen: 0.318, grupos: 93 },
    categorias: [], codigos: [],
  },
  comparativo: null,
};

// 99 frecuentes y 723 «no vuelven», los dos números medidos el 24-sep.
const cliente = (id: number, dormido: boolean) => ({
  cliente_switch_id: id, nombre: `CLIENTE ${id}`, visitas: 1, dormido,
  primera_compra_este_mes: false, dias_sin_comprar: dormido ? 200 : 3,
});
const FIDELIZACION = {
  hoy: "2026-09-24", detalle_activo: true,
  cards: { frecuentes: 99, nuevos_mes: 47, dormidos: 723, cinco_pendiente: 859 },
  clientes: [
    ...Array.from({ length: 723 }, (_, i) => cliente(i + 1, true)),
    ...Array.from({ length: 40 }, (_, i) => cliente(2000 + i, false)),
  ],
};

function metaViajePlaya(): MetaConAvance {
  return {
    id: "m1", nombre: "Viaje playa", desde: "2026-09-01", hasta: "2026-12-31",
    objetivo: 420000, tipo: "grupal", premio: "Un viaje para todas", premioMonto: null, activa: true,
    participantes: [], porVendedora: [], aporteNoAsignado: 0, fuente: "rpc", temporadaDisponible: true,
    avance: {
      vendido: 32945.68, objetivo: 420000, falta: 387054.32, pctVendido: 0.0784421,
      diasTotales: 122, diasTranscurridos: 23, diasQueFaltan: 99, fraccionTranscurrida: 0.0748,
      base: "temporada", proyeccion: 440643.43, motivoSinProyeccion: null, alcanza: true,
      brechaProyectada: 20643.43, estado: "en-curso", cumplida: false,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const respuesta = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

function fetchPorUrl(rutas: Record<string, unknown>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const clave = Object.keys(rutas).find((k) => url.includes(k));
    if (!clave) return { ok: false, status: 404, json: async () => ({ error: `sin ruta para ${url}` }) };
    return respuesta(rutas[clave]);
  });
}

const montar = (ui: React.ReactElement) =>
  render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>);

const RUTAS = {
  "/api/multifashion/detalle-mensual": DETALLE,
  "/api/multifashion/vendedoras": VENDEDORAS,
  "/api/multifashion/productos": PRODUCTOS,
  "/api/multifashion/fidelizacion": FIDELIZACION,
  "/api/multifashion/metas": { instalado: true, puedeEditar: true, metas: [metaViajePlaya()], vendedoras: [] },
  "/api/multifashion/bonos": { mes_evaluado: { year: 2026, mes: 9 }, es_elegible: false, gerente: { nombre: "JENNIFER MIRANDA", bono: 0 }, vendedoras: [] },
};

async function pintarInicio(pantalla: "inicio" | "anio" = "inicio", periodo: Periodo = SEPTIEMBRE) {
  vi.stubGlobal("fetch", fetchPorUrl(RUTAS));
  const r = montar(
    <MultifashionResumenView
      overview={OVERVIEW}
      selectedYear={2026}
      isClosedYear={false}
      mes={periodo.tipo === "mes" ? periodo.mes : 9}
      celular={{ periodo, corte: CORTE, pantalla, onAbrir: vi.fn() }}
    />,
  );
  await screen.findByText("Ventas del mes");
  return r;
}

describe("2 · al abrir: el mes es el número", () => {
  it("🔴 el número grande es el del mes, y la línea dice el cambio y el cierre", async () => {
    const { container } = await pintarInicio();
    const inicio = container.querySelector('[data-celular="inicio"]') as HTMLElement;
    expect(inicio).not.toBeNull();
    expect(inicio.querySelector('[data-celular="numero-del-mes"]')!.textContent).toBe("$32,946");
    const linea = inicio.querySelector('[data-celular="linea-del-mes"]')!.textContent;
    expect(linea).toContain("▲ 29 %");
    expect(linea).toContain("contra septiembre 2025");
    expect(linea).toContain("cierra en $47,117");
  });

  it("las barras son 30 y las 7 que faltan van apagadas; los hábitos son la línea de siempre", async () => {
    const { container } = await pintarInicio();
    const barras = container.querySelector('[data-celular="barras"]')!;
    expect(barras.children).toHaveLength(30);
    expect([...barras.children].filter((b) => b.className.includes("opacity-20"))).toHaveLength(7);
    expect(container.querySelector('[data-celular="habitos"]')!.textContent)
      .toContain("mejor día del mes: 19 sep, $4,064");
  });

  it("🔴 CUATRO renglones, con su texto y su número", async () => {
    const { container } = await pintarInicio();
    const lista = container.querySelector('[data-celular="renglones"]') as HTMLElement;
    const filas = [...lista.querySelectorAll("[data-renglon]")];
    expect(filas.map((f) => f.getAttribute("data-renglon")))
      .toEqual(["anio", "vendedoras", "productos", "clientes"]);
    expect(filas[0].textContent).toContain("Año 2026");
    expect(filas[0].textContent).toContain("retail · cierra en $756,974");
    expect(filas[0].textContent).toContain("$391,232");
    expect(filas[0].textContent).toContain("▲ 16 %");
    expect(await screen.findByText("4 · 690 tiquetes")).toBeTruthy();
    expect(filas[1].textContent).toContain("$32,649");
    expect(await screen.findByText("1,237 piezas · deja $10,492")).toBeTruthy();
    expect(filas[2].textContent).toContain("margen 32 %");
    expect(await screen.findByText("99 frecuentes · 723 no vuelven")).toBeTruthy();
  });

  it("cada renglón abre su pantalla", async () => {
    vi.stubGlobal("fetch", fetchPorUrl(RUTAS));
    const onAbrir = vi.fn();
    const { container } = montar(
      <MultifashionResumenView
        overview={OVERVIEW} selectedYear={2026} isClosedYear={false} mes={9}
        celular={{ periodo: SEPTIEMBRE, corte: CORTE, pantalla: "inicio", onAbrir }}
      />,
    );
    await screen.findByText("Ventas del mes");
    for (const clave of ["anio", "vendedoras", "productos", "clientes"]) {
      fireEvent.click(container.querySelector(`[data-renglon="${clave}"]`)!);
      expect(onAbrir).toHaveBeenCalledWith(clave);
    }
  });

  it("el renglón «Año» abre la tarjeta de año que YA existe (no una nueva)", async () => {
    const { container } = await pintarInicio("anio");
    const anio = container.querySelector('[data-celular="anio"]') as HTMLElement;
    expect(anio).not.toBeNull();
    expect(anio.querySelector('[data-elemento="anio"]')).not.toBeNull();
    expect(within(anio).getByText("Año 2026 · retail")).toBeTruthy();
    // En la pantalla del año no hay renglones ni número del mes.
    expect(container.querySelector('[data-celular="renglones"]')).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · NINGÚN NÚMERO SE MUEVE (la misma pantalla dibuja las dos vistas)
// ═════════════════════════════════════════════════════════════════════════════

/** «$32,945.68» → 32945.68. El «−» de los negativos es el U+2212 de la casa. */
function plata(texto: string): number {
  const m = /−?\$[\d,]+(?:\.\d{2})?/.exec(texto);
  if (!m) throw new Error(`sin monto en «${texto}»`);
  const n = Number(m[0].replace(/[−$,]/g, ""));
  return m[0].startsWith("−") ? -n : n;
}

describe("3 · 🔴 ningún número se mueve entre la vista de antes y la nueva", () => {
  it("el mes, el %, «cierra en» y el año dicen lo mismo en las dos", async () => {
    const { container } = await pintarInicio();

    // La vista de antes (la de computadora) sigue en el mismo árbol.
    const vieja = container.querySelector('[data-pestana="resumen-minimo"]') as HTMLElement;
    const mesViejo = plata(vieja.querySelector('[data-elemento="ventas-del-mes"]')!.textContent!);
    const cierreViejo = plata(vieja.querySelector('[data-elemento="cierra-en"]')!.textContent!);
    const anioViejo = plata(vieja.querySelector('[data-elemento="anio"]')!.textContent!);
    expect(mesViejo).toBe(32945.68);

    const nueva = container.querySelector('[data-celular="inicio"]') as HTMLElement;
    expect(nueva.querySelector('[data-celular="numero-del-mes"]')!.textContent).toBe(montoCorto(mesViejo));
    expect(nueva.querySelector('[data-celular="linea-del-mes"]')!.textContent)
      .toContain(`cierra en ${montoCorto(cierreViejo)}`);
    const filaAnio = nueva.querySelector('[data-renglon="anio"]')!.textContent!;
    expect(filaAnio).toContain(montoCorto(anioViejo));

    // El % contra el año pasado: la tarjeta vieja dice «▲ +29.3%», el celular
    // «▲ 29 %» — el MISMO delta, un redondeo distinto y el mismo sentido.
    const viejoPct = /▲ \+29\.3%/.test(vieja.querySelector('[data-elemento="ventas-del-mes"]')!.textContent!);
    expect(viejoPct).toBe(true);
    expect(nueva.querySelector('[data-celular="linea-del-mes"]')!.textContent).toContain("▲ 29 %");
    // Y el año: «▲ +16.0% vs 2025» arriba, «▲ 16 %» en el renglón.
    expect(vieja.querySelector('[data-elemento="anio"]')!.textContent).toContain("▲ +16.0% vs 2025");
    expect(filaAnio).toContain("▲ 16 %");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · VENDEDORAS
// ═════════════════════════════════════════════════════════════════════════════

async function pintarVendedoras() {
  vi.stubGlobal("fetch", fetchPorUrl(RUTAS));
  const r = montar(
    <VendedorasSubtab selectedYear={2026} periodo={SEPTIEMBRE} corte={CORTE} conMetas enCelular />,
  );
  await screen.findAllByText("Sheynee Batista");
  return r;
}

describe("4 · Vendedoras en el celular", () => {
  it("🔴 una fila por vendedora, con «Sheynee · Redes» en Sheynee y el cambio al lado del monto", async () => {
    const { container } = await pintarVendedoras();
    const lista = container.querySelector('[data-celular="vendedoras-lista"]') as HTMLElement;
    const filas = [...lista.querySelectorAll("[data-vendedora]")];
    expect(filas).toHaveLength(4);
    expect(filas.map((f) => f.getAttribute("data-vendedora")))
      .toEqual(["SHEYNEE BATISTA", "JAILINE", "MILAGROS TORRES", "JENNIFER MIRANDA"]);
    // 🔴 El rótulo es el PRIMER nombre de la vendedora, no «tienda» (24-sep-2026).
    expect(filas[0].textContent).toContain("Sheynee $11,420 · Redes $136 · 263 tiquetes");
    expect(filas[0].textContent).toContain("$11,555");
    expect(filas[0].textContent).toContain("▼ 12 %");
    expect(filas[1].textContent).toContain("165 tiquetes · $45.13 promedio");
    expect(filas[3].textContent).toContain("gerente · 101 tiquetes");
    expect(filas[3].textContent).toContain("▲ 39 %");
    // Las demás NO llevan desglose de canal: no se inventa una línea vacía.
    expect(filas[1].textContent).not.toContain("Redes ");
    expect(filas[1].textContent).not.toContain("tienda $");
  });

  it("el subtítulo y la comisión a un toque", async () => {
    const { container } = await pintarVendedoras();
    expect(container.querySelector('[data-celular="vendedoras-subtitulo"]')!.textContent)
      .toBe("$32,649 · 690 tiquetes · contra agosto, mismos días");
    expect(container.querySelector('[data-celular="vendedora-detalle"]')).toBeNull();
    fireEvent.click(container.querySelector('[data-vendedora="SHEYNEE BATISTA"]')!);
    expect(container.querySelector('[data-celular="vendedora-detalle"]')!.textContent)
      .toBe("Comisión $56.71 · tiquete promedio $43.94");
  });

  it("🔴 la meta es UN renglón, y al tocarlo se abre la tarjeta de metas de siempre", async () => {
    const { container } = await pintarVendedoras();
    const renglon = await screen.findByText("$32,946 de $420,000");
    expect(renglon.parentElement!.textContent).toContain("así como van cierran en $440,643");
    const boton = container.querySelector('[data-celular="meta-renglon"]') as HTMLElement;
    expect(boton.textContent).toContain("8 %");
    const cajon = container.querySelector('[data-celular="metas"]') as HTMLElement;
    expect(cajon.className).toContain("hidden sm:block");
    fireEvent.click(boton);
    expect((container.querySelector('[data-celular="metas"]') as HTMLElement).className)
      .not.toContain("hidden");
  });

  it("🔴 los montos de cada vendedora son los MISMOS que en la tarjeta de antes", async () => {
    const { container } = await pintarVendedoras();
    const viejas = [...container.querySelectorAll('[data-vista="tarjetas"] > div')];
    expect(viejas).toHaveLength(4);
    const nuevas = [...container.querySelectorAll("[data-vendedora]")];
    for (let i = 0; i < 4; i++) {
      // La tarjeta vieja ya usaba `fmtMoneyCompact`: el monto es idéntico.
      expect(nuevas[i].textContent).toContain(plata(viejas[i].textContent!).toLocaleString("en-US"));
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · EN EL CELULAR NO HAY BANDA «HOY», NI DESPLEGABLE, NI PESTAÑAS
// ═════════════════════════════════════════════════════════════════════════════

describe("5 · lo que se va del celular", () => {
  it("🔴 las cuatro pestañas quedan en `hidden sm:flex`", () => {
    vi.stubGlobal("fetch", fetchPorUrl(RUTAS));
    const { container } = montar(
      <MultifashionView
        data={OVERVIEW} tab="resumen" onTabChange={vi.fn()} periodo={SEPTIEMBRE}
        corte={CORTE} isClosedYear={false}
        celular={{ pantalla: "inicio", onAbrir: vi.fn() }}
      />,
    );
    const tabs = container.querySelector('[role="tablist"]') as HTMLElement;
    expect(tabs.className).toContain("hidden sm:flex");
    cleanup();
    // Sin la prop `celular` (la pestaña espejo, y el interruptor apagado) la
    // tira se dibuja como siempre.
    const { container: c2 } = montar(
      <MultifashionView
        data={OVERVIEW} tab="resumen" onTabChange={vi.fn()} periodo={SEPTIEMBRE}
        corte={CORTE} isClosedYear={false}
      />,
    );
    expect((c2.querySelector('[role="tablist"]') as HTMLElement).className).not.toContain("hidden");
  });

  it("🩸 la banda «HOY» y el desplegable de 57 meses viven en `hidden sm:block` / `hidden sm:flex`", () => {
    const shell = sinComentarios(leer("src/app/multifashion/MultifashionShell.tsx"));
    // El encabezado de computadora (título + PeriodoSelect) se esconde en celular.
    expect(shell).toContain('MULTIFASHION_CELULAR ? "hidden sm:flex" : "flex"');
    expect(shell).toMatch(/hidden sm:block[\s\S]{0,200}<VentaHoyCard/);
    // Y en su lugar va el encabezado del celular, con sus dos flechas.
    expect(shell).toContain('data-celular="encabezado"');
    expect(shell).toContain('data-celular="atras"');
    expect(shell).toContain('data-celular="adelante"');
    expect(shell).toContain("irAdelante");
    // 🔴 La flecha de adelante SOLO sale cuando hay mes siguiente.
    expect(shell).toContain("{encabezado.adelante && (");
  });

  it("🔴 la venta de HOY se pide UNA sola vez para las dos pantallas", () => {
    const hook = sinComentarios(leer("src/lib/multifashion/venta-hoy-cliente.ts"));
    expect(hook).toContain('["multifashion-venta-hoy", syncTick]');
    const card = sinComentarios(leer("src/components/multifashion/VentaHoyCard.tsx"));
    expect(card).toContain("useVentaHoy(syncTick, habilitado)");
    expect(card).not.toContain("useSWR");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6 · CON EL INTERRUPTOR APAGADO, EL DOM ES EL DE ANTES
// ═════════════════════════════════════════════════════════════════════════════

describe("6 · `MULTIFASHION_CELULAR = false` = la pantalla de antes", () => {
  it("sin la prop `celular` no hay un solo nodo del celular, y el Resumen no se esconde", async () => {
    vi.stubGlobal("fetch", fetchPorUrl(RUTAS));
    const { container } = montar(
      <MultifashionResumenView overview={OVERVIEW} selectedYear={2026} isClosedYear={false} mes={9} />,
    );
    await screen.findByText("Ventas del mes");
    expect(container.querySelectorAll("[data-celular]")).toHaveLength(0);
    const pestana = container.querySelector('[data-pestana="resumen-minimo"]')!;
    expect((pestana.parentElement as HTMLElement).className).not.toContain("hidden");
    // Los 6 elementos de siempre, en su orden.
    expect([...pestana.querySelectorAll("[data-elemento]")].map((e) => e.getAttribute("data-elemento")))
      .toEqual(["ventas-del-mes", "cierra-en", "anio", "grafico", "habitos", "ver-mes-a-mes"]);
  });

  it("Vendedoras sin `enCelular` es la pestaña de siempre", async () => {
    vi.stubGlobal("fetch", fetchPorUrl(RUTAS));
    montar(<VendedorasSubtab selectedYear={2026} periodo={SEPTIEMBRE} corte={CORTE} conMetas />);
    await screen.findAllByText("Sheynee Batista");
    expect(document.querySelectorAll("[data-celular]")).toHaveLength(0);
    expect(document.querySelectorAll("[data-vendedora]")).toHaveLength(0);
  });

  it("cada pantalla tocada conserva su rama vieja detrás del interruptor", () => {
    const resumen = sinComentarios(leer("src/components/multifashion/MultifashionResumenView.tsx"));
    expect(resumen).toContain("MULTIFASHION_CELULAR && celular");
    expect(resumen).toContain('MULTIFASHION_CELULAR && celular ? "hidden sm:block" : undefined');
    const vista = sinComentarios(leer("src/components/multifashion/MultifashionView.tsx"));
    expect(vista).toContain("const enCelular = MULTIFASHION_CELULAR && celular != null;");
    const vendedoras = sinComentarios(leer("src/components/multifashion/VendedorasSubtab.tsx"));
    expect(vendedoras).toContain("const celular = MULTIFASHION_CELULAR && enCelular === true;");
  });

  it("🔴 nada de lo que se GUARDA cambia: el celular no escribe en la base", () => {
    for (const rel of [
      "src/lib/multifashion/celular.ts",
      "src/lib/multifashion/venta-hoy-cliente.ts",
      "src/components/multifashion/celular/InicioCelular.tsx",
      "src/components/multifashion/celular/VendedorasCelular.tsx",
    ]) {
      const src = sinComentarios(leer(rel));
      expect(src, rel).not.toMatch(/\.(insert|update|upsert|delete)\(/);
      expect(src, rel).not.toMatch(/method:\s*"(POST|PUT|PATCH|DELETE)"/);
    }
  });
});
