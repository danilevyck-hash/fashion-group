/* ─────────────────────────────────────────────────────────────────────────────
 * «ANTES DE CERRAR» — el candado de la lista (11-sep-2026, mockup aprobado).
 *
 * Siete cajas y unas 15 líneas de texto antes del primer número → UNA lista:
 * encabezado con el estado, arriba lo que hay que ARREGLAR (número en negrita,
 * enlace a la derecha), abajo en gris lo informativo. «Todo listo para cerrar»
 * cuando no falta nada.
 *
 * 🔴 LO QUE SE PROTEGE:
 *   1. El encabezado dice borrador y cuántos días hábiles faltan (o «terminada»).
 *   2. Las tres líneas del mockup, con su número y su enlace.
 *   3. Cada persona con horas extra SIGUE llevando a su día en Aprobaciones
 *      (Daniel, 3-sep-2026) — detrás de «ver quiénes».
 *   4. Lo informativo va abajo y en gris: el corte y los que no salen.
 *   5. Ningún aviso que existía se pierde: cada uno tiene su línea.
 *   6. Sin nada que arreglar → «Todo listo para cerrar».
 *   7. La pantalla monta la lista y ya no dibuja las cajas viejas; los botones
 *      son Regenerar · Descargar ⌄ · Cerrar quincena.
 * ─────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TODO_LISTO,
  armarAntesDeCerrar,
  encabezadoAntesDeCerrar,
  horasYMinutos,
  lineaDelCorte,
  type EntradaAntesDeCerrar,
} from "@/lib/asistencia/antes-de-cerrar";
import { enlaceAprobaciones } from "@/lib/asistencia/aprobaciones";

const RAIZ = path.resolve(__dirname, "../../..");
const puro = (p: string) =>
  fs.readFileSync(path.join(RAIZ, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const RANGO = { desde: "2026-09-01", hasta: "2026-09-15" };

const VACIA: EntradaAntesDeCerrar = {
  periodoAbierto: { diasHabiles: 3 },
  esQuincena: true,
  rango: RANGO,
  extraSinAprobar: [],
  sinFicha: [],
  sinHorario: 0,
  corte: null,
  hasta: "2026-09-15",
  fueraPorBaja: 0,
  marcoDespuesDeIrse: 0,
  avisoRepartoRechazado: null,
  prestamoSinAtar: [],
  avisoPrestamo: null,
  avisoVacacionesNoPagadas: null,
  conSabado: 0,
  rangoLibre: false,
  factorBase: 1,
  diasCalendario: 15,
  migraciones: [],
  pestanaFichas: "Colaboradores",
};

/** El caso del mockup: Boston, 1–15 sep, corte el 11. */
const BOSTON: EntradaAntesDeCerrar = {
  ...VACIA,
  extraSinAprobar: [
    { codigo: "22", etiqueta: "Alejandra Camaño", minutos: 167.4, monto: 10.54 },
    { codigo: "23", etiqueta: "ANDRES GONZALEZ", minutos: 75, monto: 6.38 },
    { codigo: "44", etiqueta: "CARLOS NOE RUIZ", minutos: 394.2, monto: 24.98 },
  ],
  sinFicha: [{ codigo: "2", marcaciones: 5 }, { codigo: "3", marcaciones: 3 }],
  sinHorario: 1,
  corte: "2026-09-11",
  fueraPorBaja: 7,
};

describe("1. el encabezado", () => {
  it("dice borrador y cuántos días hábiles faltan", () => {
    expect(encabezadoAntesDeCerrar({ diasHabiles: 3 }, true)).toBe("Antes de cerrar · borrador, faltan 3 días hábiles");
    expect(encabezadoAntesDeCerrar({ diasHabiles: 1 }, true)).toBe("Antes de cerrar · borrador, falta 1 día hábil");
    expect(encabezadoAntesDeCerrar({ diasHabiles: 0 }, true)).toBe("Antes de cerrar · borrador, no quedan días hábiles");
  });

  it("y cuando el período ya pasó, «quincena terminada» (o «período terminado» en un rango libre)", () => {
    expect(encabezadoAntesDeCerrar(null, true)).toBe("Antes de cerrar · borrador, quincena terminada");
    expect(encabezadoAntesDeCerrar(null, false)).toBe("Antes de cerrar · borrador, período terminado");
  });
});

describe("2. las tres líneas del mockup, con su número y su enlace", () => {
  const r = armarAntesDeCerrar(BOSTON);

  it("«3 con horas extra sin decidir · 10:37 h → Aprobaciones ›»", () => {
    const l = r.arreglar.find((x) => x.clave === "extras")!;
    expect(l.numero).toBe(3);
    expect(l.texto).toBe("con horas extra sin decidir · 10:37 h");
    expect(l.enlace).toEqual({ rotulo: "Aprobaciones ›", href: "/asistencia?tab=aprobaciones&desde=2026-09-01&hasta=2026-09-15" });
    expect(l.tono).toBe("arreglar");
  });

  it("«2 códigos del reloj sin ficha (2, 3) → Colaboradores ›»", () => {
    const l = r.arreglar.find((x) => x.clave === "sin-ficha")!;
    expect(l.numero).toBe(2);
    expect(l.texto).toBe("códigos del reloj sin ficha (2, 3)");
    expect(l.enlace).toEqual({ rotulo: "Colaboradores ›", href: "/asistencia?tab=colaboradores" });
  });

  it("«1 sin su hora de salida confirmada → Colaboradores ›»", () => {
    const l = r.arreglar.find((x) => x.clave === "sin-horario")!;
    expect(l.numero).toBe(1);
    expect(l.texto).toBe("sin su hora de salida confirmada");
    expect(l.enlace?.rotulo).toBe("Colaboradores ›");
  });

  it("el orden es el del mockup: extras, sin ficha, sin horario", () => {
    expect(r.arreglar.map((x) => x.clave)).toEqual(["extras", "sin-ficha", "sin-horario"]);
    expect(r.todoListo).toBe(false);
  });

  it("las horas se leen «H:MM h»", () => {
    expect(horasYMinutos(636.6)).toBe("10:37 h");
    expect(horasYMinutos(1930)).toBe("32:10 h");
    expect(horasYMinutos(0)).toBe("0:00 h");
  });
});

describe("3. cada persona con horas extra sigue llevando a su día en Aprobaciones", () => {
  it("«ver quiénes» trae nombre, horas, monto y el MISMO enlace de siempre", () => {
    const l = armarAntesDeCerrar(BOSTON).arreglar[0];
    expect(l.personas).toHaveLength(3);
    expect(l.personas![0]).toEqual({
      codigo: "22",
      etiqueta: "Alejandra Camaño",
      href: enlaceAprobaciones("22", RANGO),
      detalle: "2,79 h · $10.54",
    });
    // Sin monto (quien no tiene rata) no se inventa uno.
    const sinMonto = armarAntesDeCerrar({ ...VACIA, extraSinAprobar: [{ codigo: "9", etiqueta: "X", minutos: 60, monto: null }] });
    expect(sinMonto.arreglar[0].personas![0].detalle).toBe("1,00 h");
  });
});

describe("4. lo informativo, abajo y en gris", () => {
  const r = armarAntesDeCerrar(BOSTON);

  it("«Reloj leído hasta el 11 sep; del 12 al 15 se paga normal y se ajusta en la siguiente»", () => {
    expect(lineaDelCorte("2026-09-11", "2026-09-15")).toBe("Reloj leído hasta el 11 sep; del 12 al 15 se paga normal y se ajusta en la siguiente");
    expect(lineaDelCorte("2026-09-14", "2026-09-15")).toBe("Reloj leído hasta el 14 sep; el 15 se paga normal y se ajusta en la siguiente");
    expect(lineaDelCorte(null, "2026-09-15")).toBeNull();
    const l = r.info.find((x) => x.clave === "corte")!;
    expect(l.tono).toBe("info");
    expect(l.numero).toBeNull();
  });

  it("«7 no salen en esta quincena (salieron o entraron después)»", () => {
    const l = r.info.find((x) => x.clave === "fuera")!;
    expect(l.numero).toBe(7);
    expect(l.texto).toBe("no salen en esta quincena (salieron o entraron después)");
    expect(armarAntesDeCerrar({ ...VACIA, fueraPorBaja: 1 }).info[0].texto).toBe("no sale en esta quincena (salió o entró después)");
  });
});

describe("5. ningún aviso que existía se pierde", () => {
  it("cada uno tiene su línea, del lado que le toca", () => {
    const r = armarAntesDeCerrar({
      ...VACIA,
      marcoDespuesDeIrse: 1,
      avisoRepartoRechazado: "Un sueldo repartido no se aplicó y se pagó en una sola planilla, como antes: JULIO GARAY (las partes no suman el salario).",
      prestamoSinAtar: [{ nombre: "LAURA CASIANI", saldo: 300 }],
      avisoPrestamo: "Préstamos: LUIS PARAJON: se le descuenta $40.00 y no su cuota del préstamo de $45.00 — con eso termina de pagar.",
      avisoVacacionesNoPagadas: "1 vacación marcada como «ya se le pagó»: ELOYN MENDOZA · 1 sep 2026 → 5 sep 2026 · 5 días · $120.00.",
      conSabado: 2,
      rangoLibre: true, factorBase: 0.5, diasCalendario: 8, esQuincena: false,
      migraciones: ["Falta correr el archivo X.sql en Supabase."],
    });
    expect(r.arreglar.map((x) => x.clave)).toEqual(["marco-despues", "reparto", "prestamo-sin-atar", "migracion-0"]);
    expect(r.arreglar.find((x) => x.clave === "prestamo-sin-atar")!.enlace).toEqual({ rotulo: "Préstamos ›", href: "/asistencia?tab=prestamos" });
    expect(r.arreglar.find((x) => x.clave === "reparto")!.texto).toContain("JULIO GARAY");
    expect(r.info.map((x) => x.clave)).toEqual(["prestamo", "vacaciones", "sabado", "rango-libre"]);
    expect(r.info.find((x) => x.clave === "vacaciones")!.texto).toContain("ELOYN MENDOZA");
    // 🔴 Lo que mueve plata va en ÁMBAR (tono «plata»), no en gris — y no frena.
    expect(r.info.find((x) => x.clave === "vacaciones")!.tono).toBe("plata");
    expect(r.info.find((x) => x.clave === "prestamo")!.tono).toBe("plata");
    expect(r.info.find((x) => x.clave === "rango-libre")!.texto).toContain("50.0 %");
    expect(r.encabezado).toBe("Antes de cerrar · borrador, faltan 3 días hábiles");
  });
});

describe("6. sin nada que arreglar", () => {
  it("«Todo listo para cerrar», y lo informativo se queda", () => {
    const r = armarAntesDeCerrar({ ...VACIA, corte: "2026-09-13", fueraPorBaja: 2 });
    expect(r.todoListo).toBe(true);
    expect(r.arreglar).toEqual([]);
    expect(r.info.map((x) => x.clave)).toEqual(["corte", "fuera"]);
    expect(TODO_LISTO).toBe("Todo listo para cerrar");
  });
});

describe("7. la pantalla", () => {
  const tab = puro("src/app/asistencia/PlanillaTab.tsx");

  it("monta la lista con los avisos de la respuesta, y ya no dibuja las cajas viejas", () => {
    expect(tab).toMatch(/<AntesDeCerrar datos=\{armarAntesDeCerrar\(\{/);
    expect(tab).toMatch(/pestanaFichas: PESTANA_FICHAS,/);
    for (const viejo of [
      "Todavía no está cerrada",
      "Esto es un borrador",
      "colaboradores no salen",
      "su hora de salida confirmada",
      "Se le da de alta en",
      "avisoPrestamoSinAtar &&",
      "avisoVacacionesNoPagadas &&",
      "faltaMigracionVacaciones &&",
    ]) {
      expect(tab, viejo).not.toContain(viejo);
    }
  });

  it("Regenerar · Descargar ⌄ (Excel · PDF · Comprobantes) · Cerrar quincena a la derecha", () => {
    expect(tab).toMatch(/Descargar <span aria-hidden className="text-gray-400">⌄<\/span>/);
    expect(tab).toMatch(/<DesplegableFlotante abierto=\{descargaOpen\}/);
    for (const item of ["Excel", "PDF", "Comprobantes"]) {
      expect(tab).toMatch(new RegExp(`role="menuitem"[\\s\\S]*?>${item}<`));
    }
    expect(tab).toMatch(/className="ml-auto min-h-\[44px\] shrink-0 rounded-md bg-black[^"]*"\s*>\s*Cerrar quincena/);
    // Y el chip del corte dice el día corto.
    expect(tab).toMatch(/Corte \{fechaCortaCorte\(corte\)\}/);
  });

  it("el componente: ámbar arriba, gris abajo, «ver quiénes» y el testid del aviso de extras", () => {
    const c = puro("src/app/asistencia/AntesDeCerrar.tsx");
    expect(c).toMatch(/data-testid=\{l\.clave === "extras" \? "aviso-extra-sin-aprobar" : undefined\}/);
    expect(c).toMatch(/\{verQuienes \? "ocultar" : "ver quiénes"\}/);
    expect(c).toMatch(/datos\.arreglar\.map[\s\S]*datos\.info\.map/);
  });
});
