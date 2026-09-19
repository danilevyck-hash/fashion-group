/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 SOLO SE CIERRAN QUINCENAS — el candado (18-sep-2026).
 *
 * Daniel, textual, cuando se le preguntó si el sistema debía FRENAR ante un
 * período que no es una quincena: *«si frenalo, quitalo y quita la opcion de
 * poner rango»*.
 *
 * 🩸 POR QUÉ. La pantalla avisaba en gris y dejaba cerrar igual, y pasó:
 * `asistencia_planilla_guardada` tiene dos cabeceras de «15–28 de agosto»
 * (Fashion Wear `5bc68925…` y Vistana `b7923fbf…`), que no es ninguna quincena
 * — pruebas de Roxana que quedaron guardadas y hubo que reabrir el 16-sep. En un
 * rango así el sueldo se prorratea, los montos a mano no se aplican, y el cierre
 * anotaba igual los pagos de préstamo: plata sobre un período que nadie paga.
 *
 * 🔴 LO QUE SE PROTEGE:
 *
 *   A. La regla pura (`frenoSoloQuincenas`): una quincena pasa; cualquier otro
 *      rango se rechaza con un texto que dice qué llegó, en palabras.
 *   B. El SERVIDOR rechaza (400) un período que no es quincena en el POST que
 *      cierra — antes de leer la base, antes de pedir el cuadro y sin escribir
 *      nada. Da igual por qué empresa llegue. Una quincena de verdad pasa.
 *   C. Las otras cinco pantallas (Reporte, Aprobaciones, Justificaciones,
 *      Vacaciones y la planilla de Boston) CONSERVAN su rango libre: ahí mirar
 *      cualquier rango sigue siendo válido. Y la Planilla no lo recupera.
 *   D. La ruta que GENERA (`/api/asistencia/planilla`) NO lleva el freno: de
 *      eso vive `medirAjusteAnterior`. El freno es del CIERRE.
 *   E. Lo ya guardado no se reescribe: ninguna migración borra ni edita las dos
 *      cabeceras de «15–28 ago»; esto impide que vuelva a pasar, no cambia el
 *      pasado.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { frenoSoloQuincenas } from "@/lib/asistencia/planilla-guardada";
import { periodoDesdeRango, periodoDeQuincena, quincena } from "@/lib/asistencia/planilla";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const sinComentarios = (p: string) =>
  leer(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-solo-quincenas"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

// ── La base y el cálculo, de mentira: se CUENTA cuántas veces se tocan ────────
const llamadas = { leerCabeceras: 0, calcular: 0, cerrar: 0, prestamos: 0 };

// 🔴 La base no se toca en este archivo. Si algo la llama, revienta.
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: { from: () => { throw new Error("este candado no toca la base"); } },
}));

vi.mock("@/lib/log-activity", () => ({ logActivity: async () => {} }));

vi.mock("@/lib/asistencia/planilla-guardada-server", () => ({
  leerCabeceras: async () => { llamadas.leerCabeceras += 1; return { cabeceras: [] }; },
  cerrarPlanilla: async () => { llamadas.cerrar += 1; return { id: "nueva", version: 1, totales: {} }; },
  leerCabecera: async () => ({ cabecera: null }),
  leerLineasGuardadas: async () => [],
  reabrirPlanilla: async () => ({ ok: true }),
  eliminarPlanilla: async () => ({ ok: true }),
  pagosDePrestamoDe: async () => 0,
}));

vi.mock("@/lib/asistencia/cierre-prestamo-server", () => ({
  planearCierre: async () => { llamadas.prestamos += 1; return []; },
  escribirPagosDelCierre: async () => ({ escritos: 0, total: 0 }),
  revertirPagosDelCierre: async () => ({ revertidos: 0 }),
}));

vi.mock("@/lib/asistencia/dia-libre-empresa-server", () => ({
  escribirPagosDiaLibre: async () => ({ escritos: 0, total: 0 }),
  revertirPagosDiaLibre: async () => ({ revertidos: 0 }),
}));

/** Una línea que pasa los frenos de aprobación (copiada del candado de la ruta). */
const LINEA = {
  codigo: "40", etiqueta: "KEVIN LUBO", nombre: "KEVIN LUBO",
  empresa: "vistana", empresaEtiqueta: "Vistana International",
  salarioMensual: 523.47, jornadaSemanal: 48,
  horas: {
    extraDiurnoMin: 40, extraNocturnoMin: 0, extraNoAprobadaMin: 0, excedenteMin: 0,
    domingoMin: 0, feriadoMin: 0, tardanzaMin: 15.75, tardanzaGraveMin: 0,
    tardanzaGraveDias: 0, ausenciaMin: 480, ausenciaDias: 1, ausenciaJustificadaDias: 0,
    vacacionesYaPagadasMin: 0, vacacionesYaPagadasDias: 0, vacacionesDias: 0,
    sabadoMin: 0, diasTrabajados: 11, diasARevisar: 0,
    tardanzaDeDiasARevisarMin: 0, jornadaDiariaMin: 480,
  },
  faltaConfigurar: [], fueraDePlanilla: false, pagaSeguros: true, baseSeguros: null,
  noMarcaReloj: false, parte: null, decidirAMano: null, quincenalReferencia: null,
  extraMedido: { minutos: 40, diurnoMin: 40, nocturnoMin: 0, monto: 12.58 },
  extraNoAprobada: null, extraAprobada: true,
  dinero: {
    rataHora: 3.02, valorMinuto: 0.0503, salarioQuincenal: 261.74,
    extraDiurno: 12.58, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
    ausencias: 24.16, ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 24.16,
    vacacionesYaPagadas: 0, tardanzas: 0.79, totalBruto: 249.37, baseSeguros: null,
    seguroSocial: 24.31, seguroEducativo: 3.12, isr: 0, prestamo: 0, terceros: 0,
    mercancia: 0, totalDeducciones: 27.43, otrosServicios: 0, netoPagar: 221.94,
  },
  manuales: { isr: 0, prestamo: 0, terceros: 0, mercancia: 0, otrosServicios: 0 },
};

// El cálculo devuelve un cuadro coherente con lo que se le pidió: así lo que se
// prueba acá es SOLO la puerta, no los guards de empresa/período de la ruta.
vi.mock("@/app/api/asistencia/planilla/route", () => ({
  GET: async (req: NextRequest) => {
    llamadas.calcular += 1;
    const sp = req.nextUrl.searchParams;
    const empresa = sp.get("empresa") ?? "";
    const desde = sp.get("desde") ?? "";
    const hasta = sp.get("hasta") ?? "";
    const p = periodoDesdeRango(desde, hasta);
    return NextResponse.json({
      empresa,
      periodo: { desde, hasta, claveManuales: p?.claveManuales ?? null, factorBase: p?.factorBase ?? 1 },
      lineas: [{ ...LINEA, empresa }],
      prestamos: [],
    });
  },
}));

const { POST } = await import("@/app/api/asistencia/planilla-guardada/route");

function cerrar(body: unknown) {
  const cookie = signSession({
    role: "contabilidad", userId: "u1", userName: "Contabilidad", sessionToken: "t1",
    modules: ["asistencia"],
  });
  return POST(new NextRequest("https://fashiongr.com/api/asistencia/planilla-guardada", {
    method: "POST",
    headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  llamadas.leerCabeceras = 0; llamadas.calcular = 0; llamadas.cerrar = 0; llamadas.prestamos = 0;
});

// ═════════════════════════════════════════════════════════════════════════════
describe("A. 🔴 la regla pura: una quincena pasa, cualquier otro rango se rechaza", () => {
  it("las dos quincenas de agosto pasan (1–15 y 16–30)", () => {
    expect(frenoSoloQuincenas(periodoDesdeRango("2026-08-01", "2026-08-15")!)).toBeNull();
    expect(frenoSoloQuincenas(periodoDesdeRango("2026-08-16", "2026-08-30")!)).toBeNull();
  });

  it("una quincena que llega por su clave también pasa", () => {
    expect(frenoSoloQuincenas(periodoDeQuincena(quincena(2026, 9, 1)))).toBeNull();
  });

  it("🩸 «15–28 de agosto» —el caso real— se rechaza, y el texto dice qué llegó", () => {
    const t = frenoSoloQuincenas(periodoDesdeRango("2026-08-15", "2026-08-28")!);
    expect(t).not.toBeNull();
    expect(t).toContain("Solo se cierran quincenas");
    expect(t).toContain("15 ago 2026");
    expect(t).toContain("28 ago 2026");
    expect(t).toContain("No se cerró nada");
  });

  it("⚠️ 16–31 de agosto tampoco es quincena: el 31 no paga sueldo", () => {
    expect(frenoSoloQuincenas(periodoDesdeRango("2026-08-16", "2026-08-31")!)).not.toBeNull();
  });

  it("29 ago – 10 sep (la prueba de Vistana que se borró) se rechaza", () => {
    expect(frenoSoloQuincenas(periodoDesdeRango("2026-08-29", "2026-09-10")!)).not.toBeNull();
  });

  it("el texto tutea y no lleva jerga", () => {
    const t = frenoSoloQuincenas(periodoDesdeRango("2026-08-15", "2026-08-28")!) ?? "";
    expect(t).toContain("Elige");
    expect(t).not.toMatch(/elegí|rango libre|factorBase|null/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("B. 🔴 el SERVIDOR rechaza un período que no es quincena, sin leer ni escribir nada", () => {
  it("🩸 15–28 de agosto, Fashion Wear: 400 y ni se lee la base, ni se calcula, ni se cierra", async () => {
    const r = await cerrar({ empresa: "fashion_wear", desde: "2026-08-15", hasta: "2026-08-28" });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.ok).toBe(false);
    expect(j.error).toContain("Solo se cierran quincenas");
    expect(j.error).toContain("15 ago 2026");
    expect(llamadas).toEqual({ leerCabeceras: 0, calcular: 0, cerrar: 0, prestamos: 0 });
  });

  it("16–31 de agosto: 400 (el 31 no paga sueldo)", async () => {
    const r = await cerrar({ empresa: "vistana", desde: "2026-08-16", hasta: "2026-08-31" });
    expect(r.status).toBe(400);
    expect(llamadas.cerrar).toBe(0);
  });

  it("⚠️ la puerta no distingue empresas: Boston 15–25 de agosto también 400", async () => {
    const r = await cerrar({ empresa: "confecciones_boston", desde: "2026-08-15", hasta: "2026-08-25" });
    expect(r.status).toBe(400);
    expect(llamadas.leerCabeceras).toBe(0);
  });

  it("🔴 la quincena 1–15 de agosto por fechas SÍ pasa la puerta y se cierra", async () => {
    const r = await cerrar({ empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15" });
    expect(r.status).toBe(200);
    expect(llamadas.cerrar).toBe(1);
  });

  it("y por su clave (`2026-08-2`) también", async () => {
    const r = await cerrar({ empresa: "vistana", quincena: "2026-08-2" });
    expect(r.status).toBe(200);
    expect(llamadas.cerrar).toBe(1);
  });

  it("una fecha que no existe sigue dando 400, y tampoco toca nada", async () => {
    const r = await cerrar({ empresa: "vistana", desde: "2026-02-31", hasta: "2026-03-05" });
    expect(r.status).toBe(400);
    expect(llamadas.leerCabeceras).toBe(0);
  });

  it("🔑 en el código, el freno va ANTES de leer las cabeceras", () => {
    const ruta = sinComentarios("src/app/api/asistencia/planilla-guardada/route.ts");
    // Dentro del POST: el GET también lee cabeceras, y eso no es lo que se mide.
    const post = ruta.indexOf("export async function POST");
    expect(post).toBeGreaterThan(0);
    const freno = ruta.indexOf("frenoSoloQuincenas(periodo)", post);
    const lectura = ruta.indexOf("await leerCabeceras(empresa)", post);
    expect(freno).toBeGreaterThan(0);
    expect(lectura).toBeGreaterThan(0);
    expect(freno).toBeLessThan(lectura);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("C. 🔴 las otras cinco pantallas conservan su rango libre; la Planilla no lo recupera", () => {
  const CINCO = [
    "src/app/asistencia/ReporteTab.tsx",
    "src/app/asistencia/AprobacionesTab.tsx",
    "src/app/asistencia/JustificacionesTab.tsx",
    "src/app/asistencia/VacacionesTab.tsx",
    "src/app/boston/tabs/PlanillaBoston.tsx",
  ];

  for (const p of CINCO) {
    it(`${path.basename(p)} sigue montando <RangoFechas>`, () => {
      const src = sinComentarios(p);
      expect(src).toMatch(/from "@\/components\/ui\/RangoFechas"/);
      expect(src).toContain("<RangoFechas");
    });
  }

  it("la Planilla del grupo NO monta el calendario", () => {
    const tab = sinComentarios("src/app/asistencia/PlanillaTab.tsx");
    expect(tab).not.toContain("<RangoFechas");
    expect(tab).not.toMatch(/from "@\/components\/ui\/RangoFechas"/);
  });

  it("y no ofrece «Cerrar quincena» sobre un período que no es quincena", () => {
    const tab = sinComentarios("src/app/asistencia/PlanillaTab.tsx");
    const boton = tab.indexOf("Cerrar quincena\n");
    const condicion = tab.lastIndexOf("puedeCerrarla && !data.avisos.rangoLibre && (", boton);
    expect(boton).toBeGreaterThan(0);
    expect(condicion).toBeGreaterThan(0);
  });

  it("🔴 la planilla de Boston solo LEE lo guardado: David mira, no cierra", () => {
    const boston = sinComentarios("src/app/boston/tabs/PlanillaBoston.tsx");
    expect(boston).toContain("/api/asistencia/planilla-guardada?");
    expect(boston).not.toMatch(/planilla-guardada"[\s\S]{0,200}method:\s*"POST"/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("D. ⚠️ CONTROL: la ruta que GENERA no lleva el freno", () => {
  it("de eso vive el ajuste de la quincena anterior", () => {
    const generar = sinComentarios("src/app/api/asistencia/planilla/route.ts");
    expect(generar).toContain("medirAjusteAnterior");
    expect(generar).not.toContain("frenoSoloQuincenas");
    expect(generar).not.toMatch(/no es una quincena/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("E. 🔴 lo ya guardado no se reescribe", () => {
  const dir = path.join(RAIZ, "supabase/migrations");
  const migraciones = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const codigoDe = (f: string) => leer(`supabase/migrations/${f}`).replace(/^\s*--.*$/gm, "");

  it("la ÚNICA migración que borra cabeceras es la de las tres pruebas, por lista de ids", () => {
    const borran = migraciones.filter((f) =>
      /(DELETE FROM|UPDATE)\s+asistencia_planilla_guardada\b/i.test(codigoDe(f)),
    );
    expect(borran).toEqual(["20261201120000_borrar_planillas_de_prueba.sql"]);
  });

  it("🩸 las dos cabeceras de «15–28 ago» (Fashion Wear y Vistana) no se nombran en ninguna migración", () => {
    for (const f of migraciones) {
      const sql = leer(`supabase/migrations/${f}`);
      expect(sql, f).not.toContain("5bc68925-17f5-43bd-a02c-678d224ea0df");
      expect(sql, f).not.toContain("b7923fbf-d397-4008-a3b8-4c775797da5f");
    }
  });
});
