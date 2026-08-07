// ─────────────────────────────────────────────────────────────────────────────
// CANDADO DEL ACOMODO DE ASISTENCIA (6-ago-2026)
//
// Tres cosas que costaron trabajo entender y que se rompen sin querer:
//
//  1. SON 4 PESTAÑAS Y EN ESTE ORDEN. Eran 7 — un menú, no una herramienta.
//     Horarios y Feriados pasaron a SECCIONES de Configuración (una pestaña se
//     gana el lugar por lo que hacés ahí, no por la tabla que guarda) y "Cómo
//     funciona" pasó a ser el botón «?». Nada se borró: cambió dónde vive, y
//     este test también verifica que las dos pantallas SIGAN montadas.
//
//  2. LA RATA VA A CENTAVOS. Es el número con el que la planilla multiplica de
//     verdad. Mostrar 4 decimales donde el Excel de la contable dice 2 no es un
//     detalle de formato: es enseñar un número con el que nadie calcula.
//
//  3. UN SOLO AVISO DE PENDIENTES, y UN SOLO indicador por fila.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { calcularDinero } from "@/lib/asistencia/planilla";
import { rataPorHoraCalculo } from "@/lib/asistencia/rata";
import {
  avisoPendientes,
  faltaEnPersona,
  fraseFalta,
} from "@/lib/asistencia/configuracion-avisos";

const raiz = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");

const CLIENTE = "app/asistencia/AsistenciaClient.tsx";
const CONFIG = "app/asistencia/ConfiguracionTab.tsx";

// ─────────────────────────────────────────────────────────────────────────────
describe("las 4 pestañas y su orden", () => {
  const src = leer(CLIENTE);

  /** Los pares [clave, "Etiqueta"] del arreglo TABS, en el orden del archivo. */
  const tabs = [...src.matchAll(/\["(\w+)",\s*"([^"]+)"\]/g)].map((m) => [m[1], m[2]]);

  it("son exactamente 4, en el orden Planilla · Reporte · Justificaciones · Configuración", () => {
    expect(tabs).toEqual([
      ["planilla", "Planilla"],
      ["reporte", "Reporte"],
      ["justificaciones", "Justificaciones"],
      ["configuracion", "Configuración"],
    ]);
  });

  it("abre en Planilla — es a lo que viene la contable", () => {
    expect(src).toMatch(/useState<Tab>\("planilla"\)/);
  });

  it("Horarios y Feriados YA NO son pestañas de primer nivel", () => {
    const claves = tabs.map((t) => t[0]);
    expect(claves).not.toContain("horarios");
    expect(claves).not.toContain("feriados");
    // Y tampoco se importan acá: si volvieran, volverían como pestaña.
    expect(src).not.toMatch(/from "\.\/HorariosTab"/);
    expect(src).not.toMatch(/from "\.\/FeriadosTab"/);
  });

  it("«Cómo funciona» dejó de ser pestaña y es el botón ?", () => {
    expect(tabs.map((t) => t[0])).not.toContain("ayuda");
    // Sigue existiendo, como ayuda: el componente se monta y el botón lo nombra
    // para quien use lector de pantalla.
    expect(src).toMatch(/from "\.\/ComoFuncionaTab"/);
    expect(src).toMatch(/aria-label="Cómo funciona"/);
  });

  it("NO se borró ninguna funcionalidad: Horarios y Feriados viven en Configuración", () => {
    const cfg = leer(CONFIG);
    expect(cfg).toMatch(/from "\.\/HorariosTab"/);
    expect(cfg).toMatch(/from "\.\/FeriadosTab"/);
    expect(cfg).toMatch(/<HorariosTab \/>/);
    expect(cfg).toMatch(/<FeriadosTab \/>/);
  });

  it("todas las pestañas y el botón de ayuda son tocables (44 px)", () => {
    // La regla de la casa: nada táctil por debajo de 44 px.
    expect(src).toMatch(/min-h-\[44px\]/);
    expect(src).toMatch(/h-11 w-11/); // el «?» es redondo: 44 × 44
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la rata que se MUESTRA es la que se USA para calcular", () => {
  const reglas = REGLAS_DEFAULT;

  /** Lo que la planilla multiplica de verdad, sacado del motor, no de una copia. */
  function rataDeLaPlanilla(salario: number, jornada: number): number {
    const d = calcularDinero(
      salario,
      jornada,
      {
        extraDiurnoMin: 0, extraNocturnoMin: 0, excedenteMin: 0,
        domingoMin: 0, feriadoMin: 0, ausenciaMin: 0, tardanzaMin: 0,
      },
      { isr: 0, prestamo: 0, terceros: 0, mercancia: 0, otrosServicios: 0 },
      reglas,
    );
    if (!d) throw new Error("la planilla no calculó");
    return d.rataHora;
  }

  it("los dos casos que se veían mal en pantalla: $3.0201 → 3.02 y $4.6155 → 4.62", () => {
    // $628,19 ÷ 208 = 3,020144…  ·  $960,03 ÷ 208 = 4,61552…
    expect(rataPorHoraCalculo(628.19, 48, reglas)).toBe(3.02);
    expect(rataPorHoraCalculo(960.03, 48, reglas)).toBe(4.62);
  });

  it("el salario real de Boston ($523,47 a 48 h) da la misma rata que la planilla", () => {
    expect(rataPorHoraCalculo(523.47, 48, reglas)).toBe(rataDeLaPlanilla(523.47, 48));
  });

  it("coincide con el motor en 40 y en 48 horas, salario por salario", () => {
    for (const salario of [400, 523.47, 628.19, 850, 960.03, 1200.5, 2500]) {
      for (const jornada of [40, 48]) {
        expect(rataPorHoraCalculo(salario, jornada, reglas)).toBe(
          rataDeLaPlanilla(salario, jornada),
        );
      }
    }
  });

  it("nunca tiene más de 2 decimales", () => {
    for (const salario of [523.47, 628.19, 777.77, 960.03, 1111.11]) {
      for (const jornada of [40, 48]) {
        const r = rataPorHoraCalculo(salario, jornada, reglas)!;
        expect(Math.round(r * 100) / 100).toBe(r);
      }
    }
  });

  it("🩸 redondear DOS veces (a 4 y después a 2) da otro centavo — por eso se redondea una sola vez", () => {
    // `salario / 208 = 3.0249512…`: a 4 decimales sube a 3.0250 y de ahí a 2
    // sube a 3.03, mientras el cálculo real se queda en 3.02.
    const salario = 629.19;
    const largo = salario / 208;
    const dosVueltas = Math.round((Math.round(largo * 1e4) / 1e4) * 100) / 100;
    expect(dosVueltas).toBe(3.03);
    expect(rataPorHoraCalculo(salario, 48, reglas)).toBe(3.02);
    expect(rataPorHoraCalculo(salario, 48, reglas)).toBe(rataDeLaPlanilla(salario, 48));
  });

  it("no inventa una rata cuando no hay con qué", () => {
    expect(rataPorHoraCalculo(null, 48, reglas)).toBeNull();
    expect(rataPorHoraCalculo(undefined, 48, reglas)).toBeNull();
    expect(rataPorHoraCalculo(0, 48, reglas)).toBeNull();
    expect(rataPorHoraCalculo(-100, 48, reglas)).toBeNull();
    expect(rataPorHoraCalculo(NaN, 48, reglas)).toBeNull();
    // Divisor inservible → null, nunca Infinity.
    expect(rataPorHoraCalculo(850, 48, { ...reglas, divisor48: 0 })).toBeNull();
    expect(rataPorHoraCalculo(850, 44, reglas)).toBeNull();
  });

  it("la pantalla de Configuración NO vuelve a pedir 4 decimales", () => {
    const cfg = leer(CONFIG);
    expect(cfg).not.toMatch(/money\([^)]*,\s*4\s*\)/);
    // Y usa la rata del cálculo, no la de 4 decimales de `config.ts`.
    expect(cfg).toMatch(/rataPorHoraCalculo/);
    expect(cfg).not.toMatch(/\brataPorHora\b(?!Calculo)/);
  });

  it("el servidor devuelve la rata del CÁLCULO, no la de 4 decimales", () => {
    const route = leer("app/api/asistencia/configuracion/route.ts");
    expect(route).toMatch(/rataHora: rataPorHoraCalculo\(/);
    expect(route).not.toMatch(/rataHora: rataPorHora\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("un solo aviso de pendientes, con el desglose adentro", () => {
  it("sin pendientes no hay aviso — un cartel permanente se deja de leer", () => {
    expect(avisoPendientes({ total: 38, sinConfigurar: 0, sinSalario: 0 })).toBeNull();
  });

  it("el caso de producción (38 personas, 6 sin ficha y 4 sin salario) es UN aviso con DOS renglones", () => {
    const a = avisoPendientes({ total: 38, sinConfigurar: 6, sinSalario: 4 })!;
    expect(a.titulo).toBe("10 personas de 38 todavía no salen en la planilla.");
    expect(a.detalle).toHaveLength(2);
    expect(a.detalle[0]).toContain("6 marcan en el reloj");
    expect(a.detalle[1]).toContain("4 ya tienen ficha");
  });

  it("con una sola clase de pendiente, un solo renglón de detalle", () => {
    expect(avisoPendientes({ total: 38, sinConfigurar: 6, sinSalario: 0 })!.detalle).toHaveLength(1);
    expect(avisoPendientes({ total: 38, sinConfigurar: 0, sinSalario: 4 })!.detalle).toHaveLength(1);
  });

  it("habla en singular cuando es una sola persona", () => {
    const a = avisoPendientes({ total: 38, sinConfigurar: 1, sinSalario: 0 })!;
    expect(a.titulo).toBe("1 persona de 38 todavía no sale en la planilla.");
  });

  it("la palabra «vencido» no aparece — se dice qué falta, no se reta a nadie", () => {
    const a = avisoPendientes({ total: 38, sinConfigurar: 6, sinSalario: 4 })!;
    expect(`${a.titulo} ${a.detalle.join(" ")}`.toLowerCase()).not.toContain("vencido");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("un solo indicador por fila; el detalle al abrirla", () => {
  it("dice todo lo que falta, en el orden en que se llena", () => {
    expect(faltaEnPersona({ nombre: null, empresa: null, salarioMensual: null })).toEqual([
      "el nombre", "la empresa", "el salario",
    ]);
    expect(faltaEnPersona({ nombre: "  ", empresa: "vistana", salarioMensual: 850 })).toEqual([
      "el nombre",
    ]);
    expect(faltaEnPersona({ nombre: "Ángela", empresa: "vistana", salarioMensual: 850 })).toEqual([]);
  });

  it("se lee como una frase, no como una lista de alarmas", () => {
    expect(fraseFalta(["el nombre"])).toBe("el nombre");
    expect(fraseFalta(["el nombre", "la empresa"])).toBe("el nombre y la empresa");
    expect(fraseFalta(["el nombre", "la empresa", "el salario"]))
      .toBe("el nombre, la empresa y el salario");
    expect(fraseFalta([])).toBe("");
  });

  it("la fila colapsada NO repite «Falta el nombre / la empresa / el salario» tres veces", () => {
    const cfg = leer(CONFIG);
    expect(cfg).not.toMatch(/Falta el nombre/);
    expect(cfg).not.toMatch(/Falta la empresa/);
    expect(cfg).not.toMatch(/Falta el salario/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la pantalla de Configuración se ve editable y se lee en columnas", () => {
  const cfg = leer(CONFIG);

  it("edición en línea que guarda al cambiar, como HorariosTab — sin botón «Guardar esta persona»", () => {
    expect(cfg).not.toMatch(/Guardar esta persona/);
    expect(cfg).toMatch(/onBlur=\{\(\) => void guardar\(/);
    expect(cfg).toMatch(/cambiarYGuardar/);
    expect(cfg).toMatch(/Se guarda solo/);
  });

  it("columnas alineadas en escritorio y tarjetas en celular", () => {
    // El corte es lg (1024): el iPad de 834 no aguanta seis columnas.
    expect(cfg).toMatch(/lg:grid lg:grid-cols-\[minmax\(0,1fr\)/);
    expect(cfg).toMatch(/block lg:hidden/);
  });

  it("los números van en tabular-nums y alineados a la derecha", () => {
    expect(cfg).toMatch(/text-right text-\[13px\] tabular-nums/);
  });
});
