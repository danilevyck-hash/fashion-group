// ─────────────────────────────────────────────────────────────────────────────
// 🔴 QUÉ LE FALTA A UN COLABORADOR: DOS CHIPS, SEPARADOS POR SI LA QUINCENA
// SALE MAL (10-sep-2026)
//
// Daniel, textual: *«veo falta configurar 4 y sin saldo bastantes, todos deben
// de estar en sin configurar no?»* → sí. Y al definirlo mejor: no es UN chip,
// son DOS:
//   · «Falta para pagar»  — sin ficha · sin salario (salvo servicio
//     profesional) · sin horario.
//   · «Falta completar»   — sin cargo · sin cédula · sin saldo de vacaciones
//     (saldo + fecha de corte) · sin fecha de ingreso.
// Los dos cuentan solo ACTIVOS; uno puede estar en los dos. Reemplazan a
// «Falta configurar» y a «Sin saldo». La regla vive en un módulo PURO y la fila
// dice en texto corto qué falta, con lo de pagar primero.
//
// Medido contra producción el 10-sep-2026 (`scripts/_medir-falta-configurar.ts`):
// 47 activos · ANTES «Falta configurar (10)» + «Sin saldo (45)» · DESPUÉS «Falta
// para pagar (11)» + «Falta completar (37)», 1 en los dos.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CHIP_COMPLETAR,
  CHIP_PARA_PAGAR,
  ROTULO_FALTANTE,
  contarFaltantes,
  queLeFalta,
  textoFaltantes,
  type FichaParaFaltantes,
} from "@/lib/asistencia/que-le-falta";

const RAIZ = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
const puro = (rel: string) =>
  leer(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const TAB = "src/app/asistencia/ConfiguracionTab.tsx";
const RUTA = "src/app/api/asistencia/configuracion/route.ts";

/** Una ficha COMPLETA: no le falta nada. */
const COMPLETA: FichaParaFaltantes = {
  configurado: true,
  empresa: "vistana",
  servicioProfesional: false,
  noMarcaReloj: false,
  salarioMensual: 850,
  tieneHorario: true,
  posicion: "Vendedora",
  cedula: "8-123-456",
  fechaIngreso: "2024-03-01",
  saldoVacacionesDias: 12,
  saldoVacacionesCorte: "2026-09-01",
};

describe("A. 🔴 «Falta para pagar»: lo que hace que la quincena salga mal", () => {
  it("una ficha completa no entra a ningún chip y la fila no dice nada", () => {
    expect(queLeFalta(COMPLETA)).toEqual({ paraPagar: [], completar: [] });
    expect(textoFaltantes(queLeFalta(COMPLETA))).toBeNull();
  });

  it("🔴 un código del reloj SIN FICHA cuenta como «falta para pagar», y solo ahí", () => {
    const f = queLeFalta({ ...COMPLETA, configurado: false });
    expect(f.paraPagar).toEqual(["ficha"]);
    expect(f.completar).toEqual([]);
    expect(textoFaltantes(f)).toBe("Falta ficha");
  });

  it("sin salario entra — salvo servicio profesional, que no cobra por planilla", () => {
    expect(queLeFalta({ ...COMPLETA, salarioMensual: null }).paraPagar).toEqual(["salario"]);
    expect(queLeFalta({ ...COMPLETA, salarioMensual: Number.NaN }).paraPagar).toEqual(["salario"]);
    expect(queLeFalta({ ...COMPLETA, salarioMensual: null, servicioProfesional: true }).paraPagar).toEqual([]);
  });

  it("sin horario entra — salvo quien cobra fijo y no pasa por el reloj", () => {
    expect(queLeFalta({ ...COMPLETA, tieneHorario: false }).paraPagar).toEqual(["horario"]);
    expect(queLeFalta({ ...COMPLETA, tieneHorario: false, noMarcaReloj: true }).paraPagar).toEqual([]);
  });

  it("🔑 si no se pudo saber del horario (lectura fallida), no se acusa a nadie", () => {
    expect(queLeFalta({ ...COMPLETA, tieneHorario: null }).paraPagar).toEqual([]);
    expect(queLeFalta({ ...COMPLETA, tieneHorario: undefined }).paraPagar).toEqual([]);
  });

  it("sin empresa entra: sin empresa no hay planilla donde salir", () => {
    expect(queLeFalta({ ...COMPLETA, empresa: null }).paraPagar).toEqual(["empresa"]);
  });
});

describe("B. 🔴 «Falta completar»: la quincena sale, el papel o el saldo no", () => {
  it("cargo, cédula, saldo y fecha de ingreso, en ese orden", () => {
    const f = queLeFalta({
      ...COMPLETA, posicion: "", cedula: null, saldoVacacionesDias: null, fechaIngreso: null,
    });
    expect(f.completar).toEqual(["cargo", "cedula", "saldo", "ingreso"]);
    expect(f.paraPagar).toEqual([]);
  });

  it("🔴 el saldo de vacaciones son DOS datos: sin la fecha de corte también falta", () => {
    expect(queLeFalta({ ...COMPLETA, saldoVacacionesCorte: null }).completar).toEqual(["saldo"]);
    expect(queLeFalta({ ...COMPLETA, saldoVacacionesDias: null }).completar).toEqual(["saldo"]);
    expect(queLeFalta({ ...COMPLETA, saldoVacacionesDias: 0 }).completar).toEqual([]);
  });

  it("un cargo o una cédula en blanco cuentan como faltantes", () => {
    expect(queLeFalta({ ...COMPLETA, posicion: "   " }).completar).toEqual(["cargo"]);
    expect(queLeFalta({ ...COMPLETA, cedula: "  " }).completar).toEqual(["cedula"]);
  });
});

describe("C. 🔴 uno puede estar en los dos, y la fila lo dice con lo de pagar primero", () => {
  it("el conteo cuenta a cada quien una vez por chip", () => {
    const lista: FichaParaFaltantes[] = [
      COMPLETA,
      { ...COMPLETA, configurado: false },
      { ...COMPLETA, tieneHorario: false, posicion: null, cedula: null },
      { ...COMPLETA, posicion: null },
    ];
    expect(contarFaltantes(lista)).toEqual({ paraPagar: 2, completar: 2 });
  });

  it("«Falta horario, cargo y cédula»: corto, sin artículos, pagar primero", () => {
    const f = queLeFalta({ ...COMPLETA, tieneHorario: false, posicion: null, cedula: null });
    expect(textoFaltantes(f)).toBe("Falta horario, cargo y cédula");
    expect(textoFaltantes(queLeFalta({ ...COMPLETA, posicion: null, cedula: null }))).toBe("Falta cargo y cédula");
    expect(textoFaltantes(queLeFalta({ ...COMPLETA, cedula: null }))).toBe("Falta cédula");
  });

  it("los rótulos no dicen «persona» ni llevan artículo", () => {
    for (const r of Object.values(ROTULO_FALTANTE)) {
      expect(r).not.toMatch(/persona/i);
      expect(r).not.toMatch(/^(el|la) /);
    }
    expect(CHIP_PARA_PAGAR).toBe("Falta para pagar");
    expect(CHIP_COMPLETAR).toBe("Falta completar");
  });
});

describe("D. 🔴 la pantalla usa el módulo puro, y los chips viejos no vuelven", () => {
  const src = puro(TAB);

  it("los dos chips filtran DE VERDAD, y solo se dibujan con alguien adentro", () => {
    expect(src).toMatch(/conteo\.paraPagar > 0 && \(/);
    expect(src).toMatch(/conteo\.completar > 0 && \(/);
    expect(src).toMatch(/setFiltro\("para-pagar"\)/);
    expect(src).toMatch(/setFiltro\("completar"\)/);
    expect(src).toMatch(/if \(filtro === "para-pagar"\) return activos\.filter\(\(p\) => queLeFalta\(p\)\.paraPagar\.length > 0\)/);
    expect(src).toMatch(/if \(filtro === "completar"\) return activos\.filter\(\(p\) => queLeFalta\(p\)\.completar\.length > 0\)/);
    expect(src).toMatch(/\{CHIP_PARA_PAGAR\} \(\{conteo\.paraPagar\}\)/);
    expect(src).toMatch(/\{CHIP_COMPLETAR\} \(\{conteo\.completar\}\)/);
  });

  it("🔴 «Falta configurar» y «Sin saldo» se retiraron como chips", () => {
    expect(src).not.toMatch(/Falta configurar \(/);
    expect(src).not.toMatch(/Sin saldo \(/);
    expect(src).not.toMatch(/setFiltro\("faltan"\)/);
    expect(src).not.toMatch(/setFiltro\("sin-saldo"\)/);
  });

  it("🔴 la fila dice qué falta en TEXTO, debajo del nombre, y no repite un chip «Falta»", () => {
    expect(src).toMatch(/const queFalta = textoFaltantes\(queLeFalta\(p\)\)/);
    expect(src).toMatch(/\{queFalta && <QueFalta texto=\{queFalta\} \/>\}/);
    expect(src).not.toMatch(/>\s*Falta\s*<\/span>/);
    expect(src).toMatch(/if \(falta && !fueraDePlanilla\) return null/);
  });

  it("la cabecera de la sección resume el MISMO número del chip de pagar", () => {
    expect(src).toMatch(/const pendientes = conteo\.paraPagar/);
  });
});

describe("E. el servidor manda si tiene horario, fallando ABIERTO", () => {
  const src = puro(RUTA);
  it("lee `asistencia_horarios` y lo manda como `tieneHorario`; sin lectura, `null`", () => {
    expect(src).toMatch(/from\("asistencia_horarios"\)/);
    expect(src).toMatch(/if \(error\) return null;/);
    expect(src).toMatch(/tieneHorario: conHorario \? conHorario\.has\(codigo\) : null/);
  });
});
