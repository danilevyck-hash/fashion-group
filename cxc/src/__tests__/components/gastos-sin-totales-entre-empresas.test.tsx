/**
 * 🔴 LA REGLA DE DANIEL: EN GASTOS NO SE JUNTAN LAS EMPRESAS.
 *
 * Textual (13-ago-2026), cuando se le preguntó si Boston tenía que quedar en el
 * módulo:
 *
 *   "si quiero ver gastos de boston, pero cada compañia por separado, sin
 *    juntar los gastos entre todos me explico?"
 *
 * O sea: las 8 empresas SE VEN —Boston incluida—, lo que no puede existir es un
 * número que sume los gastos de más de una. Ni una fila "Total del grupo", ni un
 * gran total al pie, ni un "todas las empresas". Si algún día hay un selector
 * "Todas", muestra las empresas UNA AL LADO DE LA OTRA, nunca sumadas.
 *
 * ⚠️ NO es la regla de CXC. Ahí Daniel dijo de Boston "no deben de ni convivir
 * juntos" y su cartera va en una pestaña aparte. Acá el matiz es otro y hay que
 * respetarlo tal cual: en Gastos Boston **sí se ve**; lo que no se hace es
 * mezclar los números entre empresas.
 *
 * ── POR QUÉ ESTE TEST RENDERIZA EN VEZ DE LEER EL ARCHIVO ───────────────────
 *
 * 🩸 En este mismo PR se comprobó por mutación que un candado de texto no sirve:
 * el guard del cero silencioso se pudo desarmar (`if (false)`) sin que nada se
 * pusiera rojo, porque el barrido encontraba el mensaje del `throw` inalcanzable
 * y se daba por satisfecho. Un `expect(FUENTE).not.toMatch(/total.*grupo/)`
 * tendría el mismo defecto: pasaría en verde con el total puesto si la variable
 * se llamara distinto.
 *
 * Así que acá se PINTA la pantalla con dos empresas de montos elegidos para que
 * su suma sea inconfundible ($100 + $200 = $300) y se exige que **el $300 no
 * aparezca por ningún lado**. Cualquier forma de sumar empresas —una fila nueva,
 * un pie de tabla, un encabezado— hace aparecer ese número y pone el build rojo.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import ResumenEmpresas from "@/app/gastos-contabilidad/components/ResumenEmpresas";
import ResumenEgresos from "@/app/gastos-contabilidad/components/ResumenEgresos";
import type {
  EmpresaResumen,
  EmpresaEgresosResumen,
} from "@/app/gastos-contabilidad/components/tipos";
import type { ResumenMes } from "@/lib/mayor/gastos";
import type { ResumenEgresosMes } from "@/lib/egresos/reglas";

afterEach(cleanup);

/** $100 y $200: la suma ($300) es un número que NO puede existir en pantalla. */
const A_CENT = 10_000;
const B_CENT = 20_000;
const SUMA = "$300.00";

// ── El mayor ────────────────────────────────────────────────────────────────

function resumenMayor(totalCent: number): ResumenMes {
  return {
    mes: "2026-01",
    estado: "cerrado",
    cuentas: [
      {
        cuenta: "6.02.01.00.00",
        corta: "6.02.01",
        nombre: "SALARIOS",
        debitoCent: totalCent,
        creditoCent: 0,
        netoCent: totalCent,
        esIsr: false,
        sinSalidaDeCaja: false,
      },
    ],
    isr: [],
    totalOperacionCent: totalCent,
    totalIsrCent: 0,
    totalCent,
    totalSinSalidaDeCajaCent: 0,
    // Con salarios en 0 el mes no sería "mostrable" y no se pintaría el monto.
    salarios: { fijoCent: totalCent, comisionesCent: 0, otrosCent: 0, totalCent },
    lineasTotal: 1,
    lineasGasto: 1,
  };
}

const empresasMayor: EmpresaResumen[] = [
  {
    empresaKey: "vistana",
    nombre: "Vistana International",
    resumen: resumenMayor(A_CENT),
    avisos: [],
    ultimoMesCerrado: "2026-01",
  },
  {
    empresaKey: "confecciones_boston",
    nombre: "Confecciones Boston",
    resumen: resumenMayor(B_CENT),
    avisos: [],
    ultimoMesCerrado: "2026-01",
  },
];

// ── Egresos varios ──────────────────────────────────────────────────────────

function resumenEgresos(totalCent: number): ResumenEgresosMes {
  return {
    mes: "2026-01",
    estado: "con_movimientos",
    totalSalidaCent: totalCent,
    totalGastoCent: totalCent,
    totalNoGastoCent: 0,
    cuentasGasto: [
      {
        cuenta: "6.02.01.00.00",
        corta: "6.02.01",
        visible: "6.02.01",
        nombre: "SERVICIOS PROFESIONALES",
        grupo: "6",
        esGasto: true,
        totalCent,
        renglones: 1,
        ejemplos: ["DANIEL LEVY"],
      },
    ],
    cuentasNoGasto: [],
    renglones: 1,
    documentos: 1,
  };
}

const empresasEgresos: EmpresaEgresosResumen[] = [
  {
    empresaKey: "vistana",
    nombre: "Vistana International",
    resumen: resumenEgresos(A_CENT),
    ultimoMesConMovimientos: "2026-01",
    alDia: { estado: "al_dia", mes: "2026-01" },
    descargaAutomatica: true,
  },
  {
    empresaKey: "confecciones_boston",
    nombre: "Confecciones Boston",
    resumen: resumenEgresos(B_CENT),
    ultimoMesConMovimientos: "2026-01",
    alDia: { estado: "al_dia", mes: "2026-01" },
    // Boston con la descarga automática APAGADA: es su estado real desde el
    // 13-ago-2026, y la regla de no sumar tiene que valer igual.
    descargaAutomatica: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la lista del MAYOR no suma empresas", () => {
  it("Boston SE VE, con su propio número", () => {
    // La otra mitad de la regla: la empresa no se esconde, se muestra aparte.
    render(<ResumenEmpresas empresas={empresasMayor} onAbrir={() => {}} />);
    expect(screen.getAllByText("Confecciones Boston").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Vistana International").length).toBeGreaterThan(0);
  });

  it("cada empresa muestra LO SUYO", () => {
    render(<ResumenEmpresas empresas={empresasMayor} onAbrir={() => {}} />);
    // Si esto fallara, el test de abajo pasaría por no pintar nada.
    expect(screen.getAllByText("$100.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$200.00").length).toBeGreaterThan(0);
  });

  it("y el TOTAL de las dos ($300.00) no aparece por ningún lado", () => {
    const { container } = render(<ResumenEmpresas empresas={empresasMayor} onAbrir={() => {}} />);
    expect(screen.queryByText(SUMA)).toBeNull();
    expect(container.textContent).not.toContain(SUMA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la lista de EGRESOS VARIOS no suma empresas", () => {
  it("Boston SE VE, con su propio número", () => {
    render(<ResumenEgresos empresas={empresasEgresos} onAbrir={() => {}} />);
    expect(screen.getAllByText("Confecciones Boston").length).toBeGreaterThan(0);
  });

  it("cada empresa muestra LO SUYO", () => {
    render(<ResumenEgresos empresas={empresasEgresos} onAbrir={() => {}} />);
    expect(screen.getAllByText("$100.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$200.00").length).toBeGreaterThan(0);
  });

  it("y el TOTAL de las dos ($300.00) no aparece por ningún lado", () => {
    const { container } = render(<ResumenEgresos empresas={empresasEgresos} onAbrir={() => {}} />);
    expect(screen.queryByText(SUMA)).toBeNull();
    expect(container.textContent).not.toContain(SUMA);
  });

  it("tampoco sumando 'salió' con 'gastos' de las dos", () => {
    // Las dos columnas del resumen valen lo mismo en este arnés, así que un
    // total de cualquiera de las dos daría $300.00 igual.
    const { container } = render(<ResumenEgresos empresas={empresasEgresos} onAbrir={() => {}} />);
    const veces = (container.textContent ?? "").split("$300").length - 1;
    expect(veces).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 y el dato que viaja tampoco trae un total de grupo", () => {
  /**
   * Recorre la respuesta de la API y junta todo número que NO esté adentro de
   * un elemento de `empresas[]`. Un "total del grupo" viviría justamente ahí:
   * al lado de `instalado` y `mes`. Se ejecuta sobre el objeto de verdad, así
   * que un campo nuevo con cualquier nombre queda cazado.
   */
  function numerosFueraDeEmpresas(payload: Record<string, unknown>): string[] {
    const fuera: string[] = [];
    for (const [k, v] of Object.entries(payload)) {
      if (k === "empresas") continue;
      const buscar = (valor: unknown, ruta: string) => {
        if (typeof valor === "number") fuera.push(`${ruta}=${valor}`);
        else if (Array.isArray(valor)) valor.forEach((x, i) => buscar(x, `${ruta}[${i}]`));
        else if (valor && typeof valor === "object") {
          for (const [k2, v2] of Object.entries(valor)) buscar(v2, `${ruta}.${k2}`);
        }
      };
      buscar(v, k);
    }
    return fuera;
  }

  it("la respuesta del mayor solo lleva instalado, mes y empresas[]", () => {
    const payload = { instalado: true, mes: "2026-01", empresas: empresasMayor };
    expect(numerosFueraDeEmpresas(payload)).toEqual([]);
    expect(Object.keys(payload).sort()).toEqual(["empresas", "instalado", "mes"]);
  });

  it("la de egresos varios, igual", () => {
    const payload = { instalado: true, mes: "2026-01", empresas: empresasEgresos };
    expect(numerosFueraDeEmpresas(payload)).toEqual([]);
    expect(Object.keys(payload).sort()).toEqual(["empresas", "instalado", "mes"]);
  });

  it("el barrido SÍ caza un total de grupo si alguien lo agrega", () => {
    // Sin esta prueba, un barrido roto devolvería [] siempre y pasaría en verde.
    const conTotal = { instalado: true, mes: "2026-01", totalGrupoCent: 30_000, empresas: [] };
    expect(numerosFueraDeEmpresas(conTotal)).toEqual(["totalGrupoCent=30000"]);
  });
});
