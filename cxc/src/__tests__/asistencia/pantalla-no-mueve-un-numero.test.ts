// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL REDISEÑO DE LA PANTALLA NO MUEVE UN SOLO NÚMERO (24-sep-2026) — candado
//
// `ASISTENCIA_PANTALLA_2026_09` decide QUÉ SE DIBUJA y NADA MÁS. El motor de la
// asistencia, el de la planilla y lo que se le manda al servidor para generar,
// cerrar, aprobar y corregir son los MISMOS con el interruptor prendido y
// apagado.
//
// Se prueba de dos maneras, porque una sola no alcanza:
//
//   1. **BARRIDO** — ningún archivo que calcule o escriba puede siquiera LEER el
//      interruptor. Si nadie del motor lo conoce, no lo puede consultar.
//   2. **DATOS FIJOS** — un día con todo (entrada temprana, almuerzo largo,
//      horas extra) pasa por `armarReporte` → `medirHoras` → `calcularDinero` y
//      el resultado se compara contra números escritos a mano. Esos números no
//      dependen del interruptor: son los del motor.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { globSync } from "glob";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { armarReporte, type Marcacion } from "@/lib/asistencia/reporte";
import { calcularDinero, medirHoras, normalizarManuales } from "@/lib/asistencia/planilla";
import { ASISTENCIA_PANTALLA_2026_09 } from "@/lib/asistencia/pantalla-2026-09";

const RAIZ = process.cwd();
const leer = (f: string) => fs.readFileSync(path.join(RAIZ, f), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// 1 · BARRIDO — quien calcula o escribe no conoce el interruptor
// ─────────────────────────────────────────────────────────────────────────────

/** Los dos módulos del rediseño. Son de PANTALLA: nadie más los puede importar. */
const MODULOS_DE_PANTALLA = ["pantalla-2026-09", "celular-asistencia"];

describe("🔴 el motor no conoce el interruptor", () => {
  it("ni el de la asistencia, ni el de la planilla, ni sus ayudantes puros", () => {
    const motores = [
      "src/lib/asistencia/reporte.ts",
      "src/lib/asistencia/planilla.ts",
      "src/lib/asistencia/corte-quincena.ts",
      "src/lib/asistencia/reglas-nuevas.ts",
      "src/lib/asistencia/entrada-autorizada.ts",
      "src/lib/asistencia/horario-configurable.ts",
      "src/lib/asistencia/prestamos-planilla.ts",
      "src/lib/asistencia/neto-no-negativo.ts",
      "src/lib/asistencia/columnas-dinero-planilla.ts",
      "src/lib/asistencia/planilla-guardada.ts",
      "src/lib/asistencia/aprobaciones.ts",
      "src/lib/asistencia/correcciones.ts",
      "src/lib/asistencia/editar-el-dia.ts",
    ];
    for (const f of motores) {
      const src = leer(f);
      for (const m of MODULOS_DE_PANTALLA) {
        expect(src.includes(m), `${f} importa ${m}`).toBe(false);
      }
    }
  });

  it("NINGUNA ruta del servidor lo conoce — ni la que genera, ni la que cierra, ni la que aprueba", () => {
    const rutas = globSync("src/app/api/asistencia/**/route.ts", { cwd: RAIZ });
    expect(rutas.length).toBeGreaterThan(10);
    for (const f of rutas) {
      const src = leer(f);
      for (const m of MODULOS_DE_PANTALLA) {
        expect(src.includes(m), `${f} importa ${m}`).toBe(false);
      }
    }
  });

  it("y los dos módulos del rediseño no importan el motor: no pueden calcular nada", () => {
    for (const f of ["src/lib/asistencia/pantalla-2026-09.ts", "src/lib/asistencia/celular-asistencia.ts"]) {
      const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      expect(src).not.toMatch(/from "\.\/reporte"/);
      expect(src).not.toMatch(/calcularDinero|medirHoras|armarPlanilla|armarReporte/);
      // Sin red, sin base y sin reloj propio: el «hoy» entra por parámetro.
      expect(src).not.toMatch(/\bfetch\(|supabase|new Date\(\)/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · DATOS FIJOS — el mismo día da los mismos números
// ─────────────────────────────────────────────────────────────────────────────

const CODIGO = "305";
const DIA = "2026-09-22";
const marca = (hhmm: string): Marcacion => ({
  empleado_codigo: CODIGO, empleado_nombre: "ANGEL PIZZA", ocurrio_en: `${DIA}T${hhmm}-05:00`,
});

/** Un día con TODO: entra 35 min antes, almuerza 66, sale 25 min después. */
const ENTRADA = {
  marcaciones: ["07:25:00", "12:00:00", "13:06:00", "17:25:00"].map(marca),
  horarios: [{ empleado_codigo: CODIGO, entrada: "08:00", salida: "17:00", almuerzo_minutos: 60 }],
  justificaciones: [], feriados: new Map<string, string>(), desde: DIA, hasta: DIA,
  reglas: REGLAS_DEFAULT,
};

describe("🔴 el mismo día, los mismos minutos y los mismos dólares", () => {
  it("el REPORTE mide lo que siempre midió", () => {
    const [p] = armarReporte(ENTRADA);
    const d = p.dias[0];
    expect(d.tardeMin).toBe(0);
    expect(d.excesoAlmuerzoMin).toBe(6);
    expect(d.extraMin).toBe(25);
    expect(d.salidaTempranaMin).toBe(0);
    expect(p.resumen.diasTrabajados).toBe(1);
    expect(p.resumen.ausenciasSinJustificar).toBe(0);
  });

  it("la PLANILLA valúa esos minutos con los mismos dólares", () => {
    const [p] = armarReporte(ENTRADA);
    const h = medirHoras(p, REGLAS_DEFAULT, 8 * 60);
    expect(h.extraDiurnoMin).toBe(25);
    expect(h.tardanzaMin).toBe(0);
    expect(h.diasTrabajados).toBe(1);
    const d = calcularDinero(1000, 48, h, normalizarManuales(null), REGLAS_DEFAULT);
    // 🔑 Los números están ESCRITOS A MANO a propósito: si el motor se mueve,
    // este candado se pone rojo aunque la pantalla se vea igual.
    expect(d).not.toBeNull();
    expect(d!.rataHora).toBe(4.81);
    expect(d!.salarioQuincenal).toBe(500);
    expect(d!.extraDiurno).toBe(2.51);
    expect(d!.totalBruto).toBe(502.51);
    expect(d!.seguroSocial).toBe(48.99);
    expect(d!.seguroEducativo).toBe(6.28);
    expect(d!.totalDeducciones).toBe(55.27);
    expect(d!.netoPagar).toBe(447.24);
  });

  it("y el interruptor no puede tocar ninguno de esos números: es un booleano de pantalla", () => {
    // El valor de hoy queda escrito acá para que un cambio de estado sea
    // deliberado y se vea en el diff.
    expect(ASISTENCIA_PANTALLA_2026_09).toBe(true);
    // La prueba de verdad es el barrido de arriba: el motor no lo importa, así
    // que los tres bloques anteriores valen prendido y apagado.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · LO QUE SE LE MANDA AL SERVIDOR NO CAMBIÓ
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 los pedidos de generar, cerrar y aprobar son los de siempre", () => {
  const pl = leer("src/app/asistencia/PlanillaTab.tsx");

  it("«Generar» manda desde · hasta · corte · empresa, y nada más", () => {
    expect(pl).toMatch(/desde[,:]/);
    expect(pl).toContain("corte");
    // Ninguna llave nueva del rediseño viaja al servidor.
    for (const prohibido of ["pantalla2026", "celular:", "selector:"]) {
      expect(pl.includes(prohibido), prohibido).toBe(false);
    }
  });

  it("y `aparatoDeQuienMira` solo decide cómo se DIBUJA, nunca qué se pide", () => {
    for (const f of ["src/app/asistencia/PlanillaTab.tsx", "src/app/asistencia/ReporteTab.tsx"]) {
      const src = leer(f);
      // El aparato nunca entra a una URL ni a un cuerpo de petición.
      expect(src).not.toMatch(/celular[^\n]{0,40}(URLSearchParams|JSON\.stringify|body:)/);
      expect(src).not.toMatch(/(URLSearchParams|body:)[^\n]{0,60}celular/);
    }
  });
});
