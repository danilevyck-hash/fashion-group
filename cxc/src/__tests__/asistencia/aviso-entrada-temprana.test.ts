// ─────────────────────────────────────────────────────────────────────────────
// EL AVISO DE ENTRADA TEMPRANA (24-sep-2026) — el candado
//
// Daniel: «solo desde 30 minutos». En la fila del día sale «llegó N min antes ·
// ¿entrada autorizada?» SOLO si la primera marca cae N ≥ 30 minutos antes de
// su hora de entrada y el día no tiene ya entrada autorizada. Es un aviso: no
// cuenta, no frena el cierre, no entra a «Antes de cerrar».
//
// 🔴 LAS MUTACIONES QUE CAZA: 29 → no y 30 → sí (si el `>=` pasa a `>`, 30 cae);
// el DEFAULT es 30 (si baja a 0, «29 con REGLAS_DEFAULT → no» sigue, pero «el
// default es 30» cae); con autorización → no.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  avisoEntradaTemprana, horaASeg, indexarEntradasAutorizadas, textoAvisoEntradaTemprana,
  type EntradaAutorizada,
} from "@/lib/asistencia/entrada-autorizada";
import { REGLAS_DEFAULT, reglasDesdeFila, type ReglasAsistencia } from "@/lib/asistencia/config";
import { armarReporte, type Marcacion, type DiaReporte } from "@/lib/asistencia/reporte";
import { medirHoras } from "@/lib/asistencia/planilla";

const RAIZ = process.cwd();
const CODIGO = "21";
const DIA = "2026-09-22";
const marca = (hhmm: string): Marcacion => ({ empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: `${DIA}T${hhmm}:00-05:00` });

function dia(entrada: string, opts: { autorizada?: EntradaAutorizada; reglas?: Partial<ReglasAsistencia> } = {}): DiaReporte {
  const [p] = armarReporte({
    marcaciones: [marca(entrada), marca("12:00"), marca("12:30"), marca("17:00")],
    horarios: [{ empleado_codigo: CODIGO, entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 }],
    justificaciones: [], feriados: new Map(), desde: DIA, hasta: DIA,
    reglas: opts.reglas ?? REGLAS_DEFAULT,
    entradasAutorizadas: indexarEntradasAutorizadas(opts.autorizada ? [opts.autorizada] : []),
  });
  return p.dias[0];
}

const PROG = horaASeg("08:00");

describe("🔴 la regla, pura: desde 30 minutos", () => {
  it("29 → no · 30 → sí · 61 → sí", () => {
    expect(avisoEntradaTemprana({ entSeg: horaASeg("07:31"), entradaProgSeg: PROG, umbralMin: 30, tieneAutorizacion: false })).toBeNull();
    expect(avisoEntradaTemprana({ entSeg: horaASeg("07:30"), entradaProgSeg: PROG, umbralMin: 30, tieneAutorizacion: false })).toBe(30);
    expect(avisoEntradaTemprana({ entSeg: horaASeg("06:59"), entradaProgSeg: PROG, umbralMin: 30, tieneAutorizacion: false })).toBe(61);
  });

  it("con entrada autorizada → no; con el umbral en 0 → no (apagado); apagado el interruptor → no", () => {
    expect(avisoEntradaTemprana({ entSeg: horaASeg("06:00"), entradaProgSeg: PROG, umbralMin: 30, tieneAutorizacion: true })).toBeNull();
    expect(avisoEntradaTemprana({ entSeg: horaASeg("06:00"), entradaProgSeg: PROG, umbralMin: 0, tieneAutorizacion: false })).toBeNull();
    expect(avisoEntradaTemprana({ entSeg: horaASeg("06:00"), entradaProgSeg: PROG, umbralMin: 30, tieneAutorizacion: false, activo: false })).toBeNull();
  });

  it("el DEFAULT es 30; sin la columna en la base, apagado (0)", () => {
    expect(REGLAS_DEFAULT.avisoEntradaTempranaMin).toBe(30);
    expect(reglasDesdeFila({ tolerancia_tardanza_min: 10 }).avisoEntradaTempranaMin).toBe(0);
    expect(reglasDesdeFila({ aviso_entrada_temprana_min: 45 }).avisoEntradaTempranaMin).toBe(45);
  });

  it("el chip dice los minutos enteros y pregunta", () => {
    expect(textoAvisoEntradaTemprana(61.5)).toBe("llegó 61 min antes · ¿entrada autorizada?");
  });
});

describe("🔴 en el motor: un aviso y nada más", () => {
  it("07:30 con entrada 08:00 avisa 30; 07:31 no avisa", () => {
    expect(dia("07:30").entradaTempranaMin).toBe(30);
    expect(dia("07:31").entradaTempranaMin).toBeUndefined();
  });

  it("con el umbral configurado en 45, 07:30 ya no avisa", () => {
    expect(dia("07:30", { reglas: { ...REGLAS_DEFAULT, avisoEntradaTempranaMin: 45 } }).entradaTempranaMin).toBeUndefined();
  });

  it("con entrada autorizada ese día, no avisa", () => {
    const aut: EntradaAutorizada = { id: "a", empleadoCodigo: CODIGO, fecha: DIA, hora: "07:00:00", motivo: "m", creadaPor: "y", creadaEn: "" };
    expect(dia("07:00", { autorizada: aut }).entradaTempranaMin).toBeUndefined();
  });

  it("no toca ni un número: el día con aviso y el día sin aviso (umbral 0) son iguales salvo el aviso", () => {
    const con = dia("07:00");
    const sin = dia("07:00", { reglas: { ...REGLAS_DEFAULT, avisoEntradaTempranaMin: 0 } });
    expect(con.entradaTempranaMin).toBe(60);
    expect(sin.entradaTempranaMin).toBeUndefined();
    const { entradaTempranaMin: _a, ...restoCon } = con;
    const { entradaTempranaMin: _b, ...restoSin } = sin;
    expect(restoCon).toEqual(restoSin);
    expect(con.revisar).toBe(false);
    expect(con.extraMin).toBe(0);
  });

  it("la planilla no lo ve: `medirHoras` da lo mismo con y sin aviso", () => {
    const p = (d: DiaReporte) => ({ codigo: CODIGO, nombre: null, salida: "17:00", almuerzoMin: 30, dias: [d], resumen: {} as never });
    expect(medirHoras(p(dia("07:00")), REGLAS_DEFAULT, 8 * 60))
      .toEqual(medirHoras(p(dia("07:00", { reglas: { ...REGLAS_DEFAULT, avisoEntradaTempranaMin: 0 } })), REGLAS_DEFAULT, 8 * 60));
  });

  it("no entra a «Antes de cerrar», al cierre ni a la planilla guardada (barrido)", () => {
    for (const f of [
      "src/lib/asistencia/antes-de-cerrar.ts",
      "src/lib/asistencia/antes-de-cerrar-del-cuadro.ts",
      "src/lib/asistencia/planilla-guardada.ts",
      "src/lib/asistencia/planilla.ts",
      "src/lib/asistencia/que-le-falta.ts",
    ]) {
      const texto = fs.readFileSync(path.join(RAIZ, f), "utf8");
      expect(texto.includes("entradaTempranaMin"), `${f} mira el aviso`).toBe(false);
    }
  });

  it("la fila del Reporte lo dibuja y lleva a «Arreglar el día»", () => {
    const tsx = fs.readFileSync(path.join(RAIZ, "src/app/asistencia/ReporteTab.tsx"), "utf8");
    expect(tsx).toContain("textoAvisoEntradaTemprana(d.entradaTempranaMin)");
    expect(tsx).toContain("ROTULO_ENTRADA_AUTORIZADA");
    // El chip abre el editor del día, que es donde se decide.
    const i = tsx.indexOf("textoAvisoEntradaTemprana(d.entradaTempranaMin)");
    expect(tsx.slice(i - 900, i)).toContain("onClick={abrirEditor}");
  });
});
