// ─────────────────────────────────────────────────────────────────────────────
// LA ENTRADA AUTORIZADA POR DÍA (24-sep-2026) — el candado
//
// Daniel: en «Arreglar el día» se marca «Hoy entraba a las __:__» con motivo;
// ese día la hora extra se mide desde esa hora autorizada hasta la hora de
// entrada del horario (horario 10:00, autorizada 06:00, marcó 05:58 → 4 h,
// medidas desde las 06:00, no desde las 05:58), va a Aprobaciones como
// cualquier extra y se paga al recargo que le toque por la hora del día. NO
// cambia nada para quien no tiene entrada autorizada.
//
// 🔴 LO QUE SE PRUEBA, Y LAS MUTACIONES QUE CAZA:
//   · 05:58 con autorizada 06:00 → 240, no 242 (si `desde` fuera la marca, cae).
//   · Sin autorización → 0, como hoy. Anulada (fuera del mapa) → 0.
//   · 06–10 a.m. paga al 1,25 (diurno) con el corte de la tarde de las reglas.
//   · Pasa por Aprobaciones: sin aprobar queda en `extraNoAprobada`.
//   · La ruta rechaza sin motivo con 400 y CERO escrituras.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  ENTRADA_AUTORIZADA,
  avisoEntradaTemprana,
  cambioEntradaAutorizada,
  extraDeEntrada,
  horaASeg,
  indexarEntradasAutorizadas,
  normalizarHoraEntrada,
  resumenCambioEntrada,
  textoEntradaAutorizada,
  type EntradaAutorizada,
} from "@/lib/asistencia/entrada-autorizada";
import { REGLAS_DEFAULT, type ReglasAsistencia } from "@/lib/asistencia/config";
import { armarReporte, type Marcacion, type DiaReporte } from "@/lib/asistencia/reporte";
import { clasificarDia, medirHoras, HORAS_CERO } from "@/lib/asistencia/planilla";
import { diasConExtra } from "@/lib/asistencia/aprobaciones";
import { conEntradaAutorizada, faltaParaGuardarElDia, planDelDia, resumenDelPlan } from "@/lib/asistencia/editar-el-dia";

const RAIZ = process.cwd();
const CODIGO = "305";
const DIA = "2026-09-22"; // martes
const H = (h: string) => h.length === 5 ? `${h}:00` : h;

const marca = (hhmm: string, fecha = DIA): Marcacion => ({
  empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: `${fecha}T${H(hhmm)}-05:00`,
});

const AUTORIZADA: EntradaAutorizada = {
  id: "aut-1", empleadoCodigo: CODIGO, fecha: DIA, hora: "06:00:00",
  motivo: "inventario de la tienda", creadaPor: "yulissa", creadaEn: "2026-09-22T12:00:00.000Z",
};

/** Multifashion: horario 10:00–18:30, almuerzo 60. */
function dia(horas: string[], opts: { autorizada?: EntradaAutorizada | null; reglas?: Partial<ReglasAsistencia> } = {}): DiaReporte {
  const [p] = armarReporte({
    marcaciones: horas.map((h) => marca(h)),
    horarios: [{ empleado_codigo: CODIGO, entrada: "10:00", salida: "18:30", almuerzo_minutos: 60 }],
    justificaciones: [], feriados: new Map(), desde: DIA, hasta: DIA,
    reglas: opts.reglas ?? REGLAS_DEFAULT,
    entradasAutorizadas: indexarEntradasAutorizadas(opts.autorizada ? [opts.autorizada] : []),
  });
  return p.dias[0];
}

const SEG = { ent: horaASeg("05:58:00"), prog: horaASeg("10:00"), aut: horaASeg("06:00"), min: 10 * 60 };

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la cuenta, pura", () => {
  it("el caso de Daniel: horario 10:00, autorizada 06:00, marcó 05:58 → 240 min desde las 06:00", () => {
    const r = extraDeEntrada({ entSeg: SEG.ent, entradaProgSeg: SEG.prog, autorizadaSeg: SEG.aut, extraMinimoSeg: SEG.min });
    expect(r.min).toBe(240);
    expect(r.desdeSeg).toBe(SEG.aut);
    expect(r.hastaSeg).toBe(SEG.prog);
  });

  it("marcó 06:30 → 210: desde que marcó, no desde la autorización", () => {
    expect(extraDeEntrada({ entSeg: horaASeg("06:30"), entradaProgSeg: SEG.prog, autorizadaSeg: SEG.aut, extraMinimoSeg: SEG.min }).min).toBe(210);
  });

  it("sin autorización → 0, como hoy", () => {
    expect(extraDeEntrada({ entSeg: SEG.ent, entradaProgSeg: SEG.prog, autorizadaSeg: null, extraMinimoSeg: SEG.min }).min).toBe(0);
  });

  it("autorizada a una hora que no es anterior a la entrada → 0; marcó después de su hora → 0", () => {
    expect(extraDeEntrada({ entSeg: SEG.ent, entradaProgSeg: SEG.prog, autorizadaSeg: SEG.prog, extraMinimoSeg: SEG.min }).min).toBe(0);
    expect(extraDeEntrada({ entSeg: horaASeg("10:15"), entradaProgSeg: SEG.prog, autorizadaSeg: SEG.aut, extraMinimoSeg: SEG.min }).min).toBe(0);
  });

  it("pasa por la MISMA puerta del mínimo: 9:59 de adelanto no cuenta, 10:00 cuenta entero", () => {
    expect(extraDeEntrada({ entSeg: horaASeg("09:50:01"), entradaProgSeg: SEG.prog, autorizadaSeg: horaASeg("09:00"), extraMinimoSeg: SEG.min }).min).toBe(0);
    expect(extraDeEntrada({ entSeg: horaASeg("09:50:00"), entradaProgSeg: SEG.prog, autorizadaSeg: horaASeg("09:00"), extraMinimoSeg: SEG.min }).min).toBe(10);
  });

  it("con el interruptor apagado → 0 aunque haya autorización", () => {
    expect(extraDeEntrada({ entSeg: SEG.ent, entradaProgSeg: SEG.prog, autorizadaSeg: SEG.aut, extraMinimoSeg: SEG.min, activo: false }).min).toBe(0);
    expect(ENTRADA_AUTORIZADA).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 en el motor del reporte", () => {
  const HORAS = ["05:58", "13:00", "14:00", "18:30"];

  it("con autorización: extraMin 240, medidos de 06:00:00 a 10:00:00", () => {
    const d = dia(HORAS, { autorizada: AUTORIZADA });
    expect(d.extraMin).toBe(240);
    expect(d.extraEntradaMin).toBe(240);
    expect(d.entradaAutorizada).toMatchObject({ id: "aut-1", hora: "06:00:00", desde: "06:00:00", hasta: "10:00:00", creadaPor: "yulissa" });
    expect(d.tardeMin).toBe(0);
  });

  it("sin autorización el MISMO día vale 0: como hoy, y sin ningún campo nuevo", () => {
    const d = dia(HORAS);
    expect(d.extraMin).toBe(0);
    expect(d.extraEntradaMin).toBeUndefined();
    expect(d.entradaAutorizada).toBeUndefined();
  });

  it("anulada (ya no está entre las vivas) → vuelve a 0", () => {
    expect(dia(HORAS, { autorizada: AUTORIZADA }).extraMin).toBe(240);
    expect(dia(HORAS, { autorizada: null }).extraMin).toBe(0);
  });

  it("la extra de la salida se SUMA, y se sabe cuánto es de cada punta", () => {
    const d = dia(["05:58", "13:00", "14:00", "19:00"], { autorizada: AUTORIZADA });
    expect(d.extraMin).toBe(270);
    expect(d.extraEntradaMin).toBe(240);
  });

  it("la TARDANZA no cambia: con autorización a las 06:00 y marca a las 10:15, 15 min tarde y 0 extra", () => {
    const d = dia(["10:15", "13:00", "14:00", "18:30"], { autorizada: AUTORIZADA });
    expect(d.tardeMin).toBe(15);
    expect(d.extraMin).toBe(0);
    expect(d.entradaAutorizada?.desde).toBeNull();
  });

  it("la persona con una sola marca igual tiene su extra de entrada (la entrada se conoce)", () => {
    const d = dia(["05:58"], { autorizada: AUTORIZADA });
    expect(d.extraMin).toBe(240);
    expect(d.revisar).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 en la planilla: el recargo por la hora del día, y Aprobaciones", () => {
  const HORAS = ["05:58", "13:00", "14:00", "18:30"];

  it("6–10 a.m. cae ENTERA de día: 240 al 1,25 con el corte en 18:00 (y también en 18:01)", () => {
    for (const corte of ["18:00", "18:01"]) {
      const c = clasificarDia(dia(HORAS, { autorizada: AUTORIZADA }), { ...REGLAS_DEFAULT, horaCorteNocturno: corte });
      expect(c.extraDiurnoMin).toBe(240);
      expect(c.extraNocturnoMin).toBe(0);
      expect(c.extraEntradaDiurnoMin).toBe(240);
    }
  });

  it("la salida se reparte como siempre: 30 después de las 18:30 con corte 18:01 son nocturnos", () => {
    const c = clasificarDia(dia(["05:58", "13:00", "14:00", "19:00"], { autorizada: AUTORIZADA }), { ...REGLAS_DEFAULT, horaCorteNocturno: "18:01" });
    expect(c.extraDiurnoMin).toBe(240);
    expect(c.extraNocturnoMin).toBe(30);
  });

  it("sin autorización, `clasificarDia` no trae el desglose y el día es el de siempre", () => {
    const c = clasificarDia(dia(HORAS), REGLAS_DEFAULT);
    expect(c.extraDiurnoMin).toBe(0);
    expect(c.extraEntradaDiurnoMin ?? 0).toBe(0);
  });

  it("va a Aprobaciones como cualquier extra: sin aprobar, queda en «no aprobada» y no se paga", () => {
    const p = { codigo: CODIGO, nombre: null, salida: "18:30", almuerzoMin: 60, dias: [dia(HORAS, { autorizada: AUTORIZADA })], resumen: {} as never };
    const sin = medirHoras(p, REGLAS_DEFAULT, 8 * 60, { exigir: true, claves: new Set(), codigo: CODIGO });
    expect(sin.extraDiurnoMin).toBe(0);
    expect(sin.extraNoAprobadaMin).toBe(240);
    expect(sin.extraNoAprobadaDiurnoMin).toBe(240);
    const con = medirHoras(p, REGLAS_DEFAULT, 8 * 60, { exigir: true, claves: new Set([`${CODIGO}|${DIA}`]), codigo: CODIGO });
    expect(con.extraDiurnoMin).toBe(240);
    expect(con.extraNoAprobadaMin).toBe(0);
  });

  it("los 30 min sin aprobar de Multifashion son de la SALIDA: no se comen la extra de la entrada", () => {
    const d = dia(["05:58", "13:00", "14:00", "19:00"], { autorizada: AUTORIZADA });
    const p = { codigo: CODIGO, nombre: null, salida: "18:30", almuerzoMin: 60, dias: [d], resumen: {} as never };
    const h = medirHoras(p, { ...REGLAS_DEFAULT, horaCorteNocturno: "18:01" }, 8 * 60, { exigir: true, claves: new Set(), codigo: CODIGO, autoMin: 30 });
    expect(h.extraAutoMin).toBe(30);
    expect(h.extraNocturnoMin).toBe(30);
    expect(h.extraDiurnoMin).toBe(0);
    expect(h.extraNoAprobadaMin).toBe(240);
  });

  it("Aprobaciones lo ofrece con los minutos y dice de dónde salen", () => {
    const p = { codigo: CODIGO, nombre: null, salida: "18:30", almuerzoMin: 60, dias: [dia(HORAS, { autorizada: AUTORIZADA })], resumen: {} as never };
    const [x] = diasConExtra(p, REGLAS_DEFAULT);
    expect(x.minutos).toBe(240);
    expect(x.entradaAutorizada).toBe("06:00");
    expect(x.tipo).toBe("extra");
  });

  it("HorasPersona NO ganó columnas: lo que se congela sigue siendo lo mismo", () => {
    expect(Object.keys(HORAS_CERO).sort()).toEqual([
      "ausenciaDias", "ausenciaJustificadaDias", "ausenciaMin", "diasARevisar", "diasTrabajados",
      "domingoMin", "excedenteMin", "extraAutoMin", "extraDiurnoMin", "extraNoAprobadaDiurnoMin",
      "extraNoAprobadaDomFerMin", "extraNoAprobadaMin", "extraNoAprobadaNocturnoMin", "extraNocturnoMin",
      "feriadoMin", "jornadaDiariaMin", "sabadoMin", "salidaTempranaMin", "tardanzaDeDiasARevisarMin",
      "tardanzaGraveDias", "tardanzaGraveMin", "tardanzaMin", "vacacionesDias", "vacacionesYaPagadasDias",
      "vacacionesYaPagadasMin",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("lo que se teclea en «Arreglar el día»", () => {
  it("vacío sin autorización → nada; la misma hora → nada; otra hora → poner reemplazando", () => {
    expect(cambioEntradaAutorizada(null, null).cambio).toBeNull();
    expect(cambioEntradaAutorizada(null, { hora: "" }).cambio).toBeNull();
    expect(cambioEntradaAutorizada({ id: "a", hora: "06:00:00" }, { hora: "06:00" }).cambio).toBeNull();
    expect(cambioEntradaAutorizada({ id: "a", hora: "06:00:00" }, { hora: "07:00" }).cambio).toEqual({ tipo: "poner", hora: "07:00:00", reemplaza: "a" });
    expect(cambioEntradaAutorizada(null, { hora: "6:00" }).cambio).toEqual({ tipo: "poner", hora: "06:00:00", reemplaza: null });
  });

  it("quitar solo vale sobre una que existe; una hora ilegible se dice y frena", () => {
    expect(cambioEntradaAutorizada(null, { hora: "", quitar: true }).cambio).toBeNull();
    expect(cambioEntradaAutorizada({ id: "a", hora: "06:00:00" }, { hora: "", quitar: true }).cambio).toEqual({ tipo: "quitar", reemplaza: "a" });
    const mala = cambioEntradaAutorizada(null, { hora: "no es hora" });
    expect(mala.cambio).toBeNull();
    expect(mala.invalida).toBe(true);
    expect(normalizarHoraEntrada("25:00")).toBeNull();
  });

  it("solo la entrada autorizada ya es un cambio: se puede guardar con porqué, y se resume", () => {
    const plan = conEntradaAutorizada(planDelDia([], new Map()), cambioEntradaAutorizada(null, { hora: "06:00" }));
    expect(faltaParaGuardarElDia(plan, "")).toBe("Falta: el porqué");
    expect(faltaParaGuardarElDia(plan, "inventario")).toBeNull();
    expect(resumenDelPlan(plan)).toBe("entrada autorizada a las 06:00");
    expect(resumenCambioEntrada({ tipo: "quitar", reemplaza: "a" })).toBe("entrada autorizada quitada");
    const nada = conEntradaAutorizada(planDelDia([], new Map()), cambioEntradaAutorizada(null, null));
    expect(faltaParaGuardarElDia(nada, "x")).toBe("Todavía no cambiaste nada");
  });

  it("la línea bajo el día dice desde qué hora, quién y por qué", () => {
    expect(textoEntradaAutorizada({ hora: "06:00:00", creadaPor: "yulissa", motivo: "inventario" }))
      .toBe("Entrada autorizada a las 06:00 · yulissa: inventario");
  });

  it("con autorización el aviso de entrada temprana se calla", () => {
    expect(avisoEntradaTemprana({ entSeg: SEG.ent, entradaProgSeg: SEG.prog, umbralMin: 30, tieneAutorizacion: true })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LA RUTA: el mismo POST del día, con motivo obligatorio y su propio I/O
// ─────────────────────────────────────────────────────────────────────────────

const escrituras: Array<{ op: string; payload: unknown }> = [];
let viva: { id: string; hora: string } | null = null;

vi.mock("@/lib/asistencia/guard", async () => {
  const real = await vi.importActual<typeof import("@/lib/asistencia/guard")>("@/lib/asistencia/guard");
  return { ...real, requireAsistencia: () => ({ role: "admin", userName: "yulissa" }) };
});
vi.mock("@/lib/asistencia/alcance-boston-server", () => ({
  rechazarFueraDeAlcance: async () => null,
}));
vi.mock("@/lib/asistencia/correcciones-server", () => ({
  leerMarcacion: async () => null,
  crearCorreccion: async (c: unknown) => { escrituras.push({ op: "crear", payload: c }); return { ok: true as const, id: "c1" }; },
  anularCorreccion: async (id: string) => { escrituras.push({ op: "anular", payload: id }); return { ok: true as const, id }; },
}));
vi.mock("@/lib/asistencia/entrada-autorizada-server", () => ({
  leerEntradaVivaDelDia: async () => ({
    entrada: viva ? { id: viva.id, empleadoCodigo: CODIGO, fecha: DIA, hora: viva.hora, motivo: "x", creadaPor: "y", creadaEn: "" } : null,
    faltaMigracion: false,
  }),
  crearEntradaAutorizada: async (e: unknown) => { escrituras.push({ op: "crear-entrada", payload: e }); return { ok: true as const, id: "e1" }; },
  anularEntradaAutorizada: async (id: string, quien: string) => { escrituras.push({ op: "anular-entrada", payload: { id, quien } }); return { ok: true as const, id }; },
}));

async function postDia(body: unknown) {
  const { POST } = await import("@/app/api/asistencia/correcciones/dia/route");
  const req = { json: async () => body, nextUrl: { searchParams: new URLSearchParams() } } as unknown as Parameters<typeof POST>[0];
  const res = await POST(req);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("🔴 la ruta del día", () => {
  beforeEach(() => { escrituras.length = 0; viva = null; });

  it("sin motivo: 400 y CERO escrituras", async () => {
    const r = await postDia({ codigo: CODIGO, fecha: DIA, motivo: "   ", cambios: [], entradaAutorizada: { hora: "06:00" } });
    expect(r.status).toBe(400);
    expect(escrituras).toEqual([]);
  });

  it("con motivo: se escribe con la persona, el día, la hora y la firma", async () => {
    const r = await postDia({ codigo: CODIGO, fecha: DIA, motivo: "inventario", cambios: [], entradaAutorizada: { hora: "6:00" } });
    expect(r.status).toBe(200);
    expect(escrituras).toEqual([{ op: "crear-entrada", payload: { empleadoCodigo: CODIGO, fecha: DIA, hora: "06:00:00", motivo: "inventario", creadaPor: "yulissa" } }]);
  });

  it("una hora que no sirve → 400 sin escribir", async () => {
    const r = await postDia({ codigo: CODIGO, fecha: DIA, motivo: "x", cambios: [], entradaAutorizada: { hora: "seis" } });
    expect(r.status).toBe(400);
    expect(escrituras).toEqual([]);
  });

  it("editar es editar: con una viva a otra hora, se ANULA y se escribe la nueva; a la misma hora, nada", async () => {
    viva = { id: "vieja", hora: "07:00:00" };
    await postDia({ codigo: CODIGO, fecha: DIA, motivo: "x", cambios: [], entradaAutorizada: { hora: "06:00" } });
    expect(escrituras.map((e) => e.op)).toEqual(["anular-entrada", "crear-entrada"]);
    escrituras.length = 0;
    viva = { id: "vieja", hora: "06:00:00" };
    await postDia({ codigo: CODIGO, fecha: DIA, motivo: "x", cambios: [], entradaAutorizada: { hora: "06:00" } });
    expect(escrituras).toEqual([]);
  });

  it("quitar anula la viva con la firma; sin viva no escribe nada", async () => {
    viva = { id: "vieja", hora: "06:00:00" };
    await postDia({ codigo: CODIGO, fecha: DIA, motivo: "se canceló", cambios: [], entradaAutorizada: { quitar: true } });
    expect(escrituras).toEqual([{ op: "anular-entrada", payload: { id: "vieja", quien: "yulissa" } }]);
    escrituras.length = 0;
    viva = null;
    await postDia({ codigo: CODIGO, fecha: DIA, motivo: "x", cambios: [], entradaAutorizada: { quitar: true } });
    expect(escrituras).toEqual([]);
  });

  it("sin colaborador o sin fecha válida → 400", async () => {
    expect((await postDia({ codigo: "", fecha: DIA, motivo: "x", cambios: [], entradaAutorizada: { hora: "06:00" } })).status).toBe(400);
    expect((await postDia({ codigo: CODIGO, fecha: "2026-02-31", motivo: "x", cambios: [], entradaAutorizada: { hora: "06:00" } })).status).toBe(400);
    expect(escrituras).toEqual([]);
  });

  it("la ruta del día y el I/O nuevo no tocan la tabla del reloj ni las correcciones", () => {
    for (const f of ["src/app/api/asistencia/correcciones/dia/route.ts", "src/lib/asistencia/entrada-autorizada-server.ts", "src/lib/asistencia/entrada-autorizada.ts"]) {
      const texto = fs.readFileSync(path.join(RAIZ, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      expect(texto.includes("asistencia_marcaciones"), `${f} nombra la tabla del reloj`).toBe(false);
    }
    const io = fs.readFileSync(path.join(RAIZ, "src/lib/asistencia/entrada-autorizada-server.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(io.includes("asistencia_correcciones")).toBe(false);
    expect(io.includes(".delete(")).toBe(false);
  });
});
