// La pantalla de gastos, RENDERIZADA con los datos reales de enero-2026.
//
// El riesgo de esta pantalla no es la aritmética (esa ya está medida en
// `mayor-parser.test.ts`): es que un número correcto se PINTE mal. Dos formas,
// las dos caras:
//
//  1. Un mes sin contabilidad pintado como `$0.00`. Daniel leería "no gasté
//     nada en julio" y decidiría con un número inventado. Es lo que más importa
//     de todo el encargo.
//  2. Un neto negativo pintado sin su signo. En enero, 6.03.41 da −127,78 y
//     6.03.42 da −69,30: mostrarlos en positivo cambia el total en el doble
//     (394,16) y descuadra contra la contadora.
//
// Un test de función pura no puede ver ninguna de las dos.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import DetalleEmpresa from "@/app/gastos-contabilidad/components/DetalleEmpresa";
import type { EmpresaResumen } from "@/app/gastos-contabilidad/components/tipos";
import { resumirMes, type Cobertura } from "@/lib/mayor/gastos";
import { parsearMayorCsv } from "@/lib/mayor/parser";
import { ALL_MODULES } from "@/lib/modules";
import fs from "fs";
import path from "path";

afterEach(cleanup);

const CSV = fs.readFileSync(
  path.resolve(__dirname, "../fixtures/mayor-vistana-2026.csv"),
  "utf8",
);
const COBERTURA: Cobertura[] = [{ desde: "2026-01-01", hasta: "2026-12-31" }];
const lineas = parsearMayorCsv(CSV).lineas;
const lineasDe = (mes: string) => lineas.filter((l) => l.mes === mes);

const empresa = (mes: string, extra: Partial<EmpresaResumen> = {}): EmpresaResumen => ({
  empresaKey: "vistana",
  nombre: "Vistana International",
  resumen: resumirMes(mes, lineasDe(mes), COBERTURA),
  avisos: [],
  ultimoMesCerrado: "2026-01",
  ...extra,
});

// ─────────────────────────────────────────────────────────────────────────────
describe("enero 2026 de Vistana, tal como se ve", () => {
  it("🔑 el total en pantalla es $11,685.66", () => {
    render(<DetalleEmpresa empresa={empresa("2026-01")} />);
    expect(screen.getAllByText(/\$11,685\.66/).length).toBeGreaterThan(0);
  });

  it("🩸 los dos netos negativos se pintan CON su signo", () => {
    render(<DetalleEmpresa empresa={empresa("2026-01")} />);
    // Faltantes de inventario: 1.695,86 − 1.823,64 = −127,78
    expect(screen.getByText("-$127.78")).toBeTruthy();
    // Gasto de períodos anteriores: solo crédito = −69,30
    expect(screen.getByText("-$69.30")).toBeTruthy();
  });

  it("NO aparece ninguno de los dos en positivo", () => {
    render(<DetalleEmpresa empresa={empresa("2026-01")} />);
    expect(screen.queryByText("$127.78")).toBeNull();
    expect(screen.queryByText("$69.30")).toBeNull();
  });

  it("las 11 cuentas están, con su código de 3 segmentos", () => {
    render(<DetalleEmpresa empresa={empresa("2026-01")} />);
    for (const c of [
      "6.02.01", "6.03.29", "6.03.18", "6.03.20", "6.03.14",
      "6.03.12", "6.03.07", "6.03.31", "6.04.01", "6.03.41", "6.03.42",
    ]) {
      expect(screen.getByText(c), `falta la cuenta ${c}`).toBeTruthy();
    }
  });

  it("las cuentas que no son plata del banco van marcadas", () => {
    const { container } = render(<DetalleEmpresa empresa={empresa("2026-01")} />);
    // Las dos marcadas de enero son justo las negativas.
    expect(container.textContent).toMatch(/no salió del banco/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔑 un mes sin contabilidad NO se pinta como cero", () => {
  it("agosto (sin cerrar) no muestra un solo $0.00", () => {
    const { container } = render(<DetalleEmpresa empresa={empresa("2026-08")} />);
    expect(container.textContent).not.toMatch(/\$\s?0\.00/);
  });

  it("y dice hasta dónde llega la contabilidad", () => {
    const { container } = render(<DetalleEmpresa empresa={empresa("2026-08")} />);
    expect(container.textContent).toMatch(/sin cerrar/i);
    expect(container.textContent).toMatch(/enero 2026/i);
  });

  it("febrero (incompleto) tampoco se pinta como cero", () => {
    // Febrero tiene UN asiento suelto y ni una cuenta de gasto: el caso real
    // más peligroso del archivo.
    const e = empresa("2026-02");
    expect(e.resumen.estado).toBe("parcial");
    const { container } = render(<DetalleEmpresa empresa={e} />);
    expect(container.textContent).not.toMatch(/\$\s?0\.00/);
  });

  it("un mes CERRADO sí muestra su monto (si no, la pantalla no serviría)", () => {
    const { container } = render(<DetalleEmpresa empresa={empresa("2026-01")} />);
    expect(container.textContent).toMatch(/\$11,685\.66/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el ISR va aparte, en su propia línea al final", () => {
  const conIsr: EmpresaResumen = {
    empresaKey: "vistana",
    nombre: "Vistana International",
    resumen: resumirMes(
      "2026-03",
      [
        {
          asiento: "01-032026", descripcion: "ASIENTO CIERRE 2026-03", fecha: "2026-03-31",
          mes: "2026-03", cuenta: "6.03.07.00.00", cuentaNombre: "FLETES Y ACARREO",
          debitoCent: 10000, creditoCent: 0, netoCent: 10000, linea: 1,
        },
        {
          asiento: "01-032026", descripcion: "ASIENTO CIERRE 2026-03", fecha: "2026-03-31",
          mes: "2026-03", cuenta: "6.05.01.00.00", cuentaNombre: "IMPUESTO SOBRE LA RENTA",
          debitoCent: 500000, creditoCent: 0, netoCent: 500000, linea: 2,
        },
      ],
      COBERTURA,
    ),
    avisos: [],
    ultimoMesCerrado: "2026-03",
  };

  it("el ISR no se revuelve con los gastos de operación", () => {
    expect(conIsr.resumen.cuentas.map((c) => c.corta)).toEqual(["6.03.07"]);
    expect(conIsr.resumen.isr.map((c) => c.corta)).toEqual(["6.05.01"]);
  });

  it("pero SÍ cuenta en el total", () => {
    render(<DetalleEmpresa empresa={conIsr} />);
    // 100 de operación + 5.000 de ISR = 5.100
    expect(screen.getAllByText(/\$5,100\.00/).length).toBeGreaterThan(0);
  });

  it("y aparece rotulado como impuesto sobre la renta", () => {
    const { container } = render(<DetalleEmpresa empresa={conIsr} />);
    expect(container.textContent).toMatch(/impuesto sobre la renta/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("los avisos se muestran", () => {
  it("el de salarios faltantes de enero llega a la pantalla", () => {
    const e = empresa("2026-01", {
      avisos: [
        {
          tipo: "salarios",
          texto:
            "Este mes no tiene ni un peso de salarios. O falta el asiento de planilla, o los salarios se registran en otro lado. Falta confirmarlo con la contadora.",
        },
      ],
    });
    const { container } = render(<DetalleEmpresa empresa={e} />);
    expect(container.textContent).toMatch(/no tiene ni un peso de salarios/i);
  });

  it("el del alquiler de Boston se muestra tal cual", () => {
    const e = empresa("2026-01", {
      empresaKey: "confecciones_boston",
      nombre: "Confecciones Boston",
      avisos: [
        {
          tipo: "alquiler",
          texto:
            "Boston paga el alquiler completo y todavía no le ha facturado a Fashion Wear. Hasta que lo haga, acá el gasto se ve MÁS ALTO de lo que le toca.",
        },
      ],
    });
    const { container } = render(<DetalleEmpresa empresa={e} />);
    expect(container.textContent).toMatch(/Boston paga el alquiler completo/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL MÓDULO SE LLAMA "Gastos", A SECAS — y es el ÚNICO de gastos que queda.
//
// 🩸 Historia, porque explica por qué este bloque existe: la primera versión de
// este PR lo estrenó como "Gastos por Empresa" al lado del viejo "Gastos de
// Empresa" — UNA PREPOSICIÓN de diferencia, uno debajo del otro en el menú.
// Para alguien no técnico eso no son dos módulos, es un typo. Se corrigió a
// "Gastos según Contabilidad", y después Daniel decidió el paso siguiente:
// retirar el módulo viejo (la carga MANUAL, 0 filas en toda su historia) y
// dejar éste con el nombre corto.
//
// El candado NO se desactivó al desaparecer el par: se GENERALIZÓ a todo el
// catálogo y vive en `src/__tests__/lib/saldos-banco-modulo.test.ts`
// ("los nombres de los módulos no se confunden entre sí"). Acá quedan las dos
// cosas propias de ESTE módulo: cómo se llama y que la `key` no se mueva.
describe("el módulo del mayor se llama \"Gastos\" y es el único", () => {
  it("label corto, key intacta, y ningún otro módulo de gastos", () => {
    const mayor = ALL_MODULES.find((m) => m.key === "gastos-contabilidad")!;
    expect(mayor).toBeTruthy();
    expect(mayor.label).toBe("Gastos");
    expect(mayor.href).toBe("/gastos-contabilidad");
    expect(mayor.group).toBe("operacion");

    // 🔴 La `key` NO cambia con el label: la migración del #463 y la fila de
    // `role_permissions` ya corrieron con `gastos-contabilidad`.
    expect(ALL_MODULES.find((m) => m.key === "gastos-empresa")).toBeUndefined();
    expect(ALL_MODULES.filter((m) => /gasto/i.test(m.label))).toHaveLength(1);
  });

  it("la pantalla dice el mismo nombre que el menú", () => {
    const fuente = fs.readFileSync(
      path.join(__dirname, "..", "..", "app", "gastos-contabilidad", "GastosContabilidadClient.tsx"),
      "utf8",
    );
    expect(fuente).toContain('module="Gastos"');
    // El <h1> dice lo mismo, y no queda ningún nombre largo en la pantalla.
    expect(fuente).toMatch(/>\s*Gastos\s*<\/h1>/);
    expect(fuente).not.toContain("Gastos según Contabilidad");
    expect(fuente).not.toContain("Gastos por Empresa");
    expect(fuente).not.toContain("Gastos de Empresa");
  });
});
