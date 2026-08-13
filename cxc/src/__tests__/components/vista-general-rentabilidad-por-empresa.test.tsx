/**
 * 🔴 LA REGLA DE DANIEL: LA RENTABILIDAD ES POR EMPRESA, NO DEL GRUPO.
 *
 * Textual (13-ago-2026):
 *
 *   "no quiero Rentabilidad del grupo, lo quiero por empresa"
 *
 * Son DOS afirmaciones y las dos se prueban acá:
 *   1. cada empresa muestra SU rentabilidad — su utilidad bruta menos SU gasto;
 *   2. no existe ningún número que junte a dos empresas.
 *
 * ── POR QUÉ ESTE TEST PINTA LA PANTALLA EN VEZ DE LEER EL ARCHIVO ───────────
 *
 * 🩸 En este mismo módulo ya se comprobó por mutación que un candado de texto no
 * sirve: el guard del cero silencioso de egresos se pudo desarmar con
 * `if (false)` sin que nada se pusiera rojo, porque el barrido encontraba el
 * mensaje del `throw` ya inalcanzable y se daba por satisfecho. Un
 * `expect(FUENTE).not.toContain("rentabilidadGrupo")` tendría el mismo defecto:
 * pasaría en verde con el total puesto si la variable se llamara distinto.
 *
 * Así que acá se PINTA la lista con montos elegidos para que cualquier forma de
 * juntarlas dé un número inconfundible, y se exige que ese número no aparezca.
 *
 * ── 🩸 EL ERROR MÁS CARO NO ES SUMAR: ES RESTAR CERO ────────────────────────
 *
 * A la empresa que NO tiene el gasto cargado no se le puede tratar el gasto como
 * $0: su rentabilidad saldría igual a su utilidad bruta —o sea, preciosa— y se
 * vería EXACTAMENTE igual que la de una empresa que de verdad gana plata. Por
 * eso la tercera empresa de este arnés no tiene gasto, y se exige que en su
 * lugar aparezca el motivo en palabras y NUNCA su utilidad bruta.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import RentabilidadPorEmpresa, {
  type RentabilidadEmpresaRow,
} from "@/app/vista-general/RentabilidadPorEmpresa";
import { rentabilidadEmpresa } from "@/lib/vista-general-calc";

afterEach(cleanup);

// ── El arnés ────────────────────────────────────────────────────────────────
//
// Los números están elegidos para que TODA forma de juntar empresas produzca un
// valor que no pertenece a ninguna:
//
//   A  ventas 100.000 · utilidad 30.000 · gasto 20.000 → rentabilidad  $10k
//   B  ventas 200.000 · utilidad 40.000 · gasto 70.000 → rentabilidad −$30k
//   C  ventas 400.000 · utilidad 90.000 · SIN GASTO    → sin número
//
//   suma de rentabilidades A+B ....... −$20k   ← no puede existir
//   utilidad de las 3 − gasto de A+B .. $70k   ← el error de mezclar universos
//   utilidad de A+B − gasto de A+B .... −$20k
//
const A = { ventas: 100_000, utilidad: 30_000, gasto: 20_000 };
const B = { ventas: 200_000, utilidad: 40_000, gasto: 70_000 };
const C = { ventas: 400_000, utilidad: 90_000, gasto: null };

function fila(
  key: string,
  name: string,
  e: { ventas: number; utilidad: number; gasto: number | null },
  extra: Partial<RentabilidadEmpresaRow> = {},
): RentabilidadEmpresaRow {
  const r = rentabilidadEmpresa(e);
  return {
    key,
    name,
    ventas: e.ventas,
    utilidad: e.utilidad,
    gasto: e.gasto,
    motivo: null,
    texto: null,
    ultimoMesCerrado: "2026-01",
    rentabilidad: r?.monto ?? null,
    pct: r?.pct ?? null,
    estado: r === null ? "sin_gastos" : r.monto < 0 ? "rojo" : "verde",
    ...extra,
  };
}

const FILAS: RentabilidadEmpresaRow[] = [
  fila("vistana", "Vistana International", A),
  fila("fashion_wear", "Fashion Wear", B),
  fila("confecciones_boston", "Confecciones Boston", C, {
    motivo: "sin_cerrar",
    texto: "Todavía no hay contabilidad de este mes. La contabilidad llega hasta enero 2026.",
  }),
];

const pintar = () => render(<RentabilidadPorEmpresa rows={FILAS} mes="2026-08" />);

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 cada empresa contra LO SUYO", () => {
  it("las tres empresas se ven, con su nombre", () => {
    pintar();
    // Dos formas (tarjetas < md y tabla desde md) se pintan las dos en jsdom,
    // así que cada nombre aparece 2 veces. Lo que importa es que esté.
    for (const n of ["Vistana International", "Fashion Wear", "Confecciones Boston"]) {
      expect(screen.getAllByText(n).length).toBeGreaterThan(0);
    }
  });

  it("cada una muestra SU rentabilidad: $10k y -$30k", () => {
    pintar();
    // Si esto fallara, el test de abajo pasaría por no haber pintado nada.
    expect(screen.getAllByText("$10k").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-$30k").length).toBeGreaterThan(0);
  });

  it("y el porcentaje es sobre las ventas de ESA empresa", () => {
    pintar();
    // 10.000 / 100.000 = 10.0 % · −30.000 / 200.000 = −15.0 %
    expect(screen.getAllByText("10.0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-15.0%").length).toBeGreaterThan(0);
    // El % del "grupo" (−20.000 / 300.000 = −6.7 %) no es de nadie.
    expect(screen.queryByText("-6.7%")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 ningún número junta dos empresas", () => {
  it("no aparece la suma de las rentabilidades (-$20k)", () => {
    const { container } = pintar();
    expect(container.textContent).not.toContain("-$20k");
  });

  it("tampoco la mezcla de universos (utilidad de las 3 − gasto de 2 = $70k)", () => {
    const { container } = pintar();
    expect(container.textContent).not.toContain("$70k");
  });

  it("ni las ventas juntas ($700k), ni la utilidad junta ($160k), ni el gasto junto ($90k)", () => {
    const { container } = pintar();
    for (const prohibido of ["$700k", "$160k", "$90k"]) {
      expect(container.textContent).not.toContain(prohibido);
    }
  });

  it("la sección DICE que no hay total del grupo", () => {
    // No es decoración: sin la frase, alguien suma las filas de cabeza.
    pintar();
    expect(screen.getByText(/No hay un total del grupo/i)).toBeTruthy();
  });

  it("y se llama por lo que es, no 'Semáforo' (jerga que nadie busca)", () => {
    pintar();
    expect(screen.getByText("Rentabilidad por empresa")).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🩸 la empresa SIN gasto cargado no muestra un número lindo", () => {
  it("su rentabilidad va en blanco, NUNCA su utilidad bruta ($90k)", () => {
    const { container } = pintar();
    // $90k sería el número precioso y falso: utilidad − 0.
    expect(container.textContent).not.toContain("$90k");
    // Su casilla de rentabilidad está vacía (—), que es lo honesto.
    const celdas = container.querySelectorAll('[data-col="rentabilidad"]');
    const vacias = [...celdas].filter((c) => c.textContent?.trim() === "—");
    expect(vacias.length).toBeGreaterThan(0);
  });

  it("y en su lugar la pantalla DICE POR QUÉ", () => {
    pintar();
    // La píldora trae el motivo exacto: "Sin cerrar" no es "Falta planilla".
    expect(screen.getAllByText("Sin cerrar").length).toBeGreaterThan(0);
  });

  it("al abrirla, el desglose explica en palabras en vez de restar", () => {
    const { container } = pintar();
    const fila = container.querySelector('[data-fila-semaforo="confecciones_boston"]');
    expect(fila).toBeTruthy();
    fireEvent.click(fila!.querySelector("button") ?? fila!);
    expect(screen.getAllByText(/La contabilidad llega hasta enero 2026/).length).toBeGreaterThan(0);
  });

  it("mientras que una empresa CON gasto sí muestra la resta, con sus dos cifras", () => {
    const { container } = pintar();
    const fila = container.querySelector('[data-fila-semaforo="vistana"]');
    fireEvent.click(fila!.querySelector("button") ?? fila!);
    const desglose = container.querySelector('[data-col="utilidad"]');
    expect(desglose?.textContent).toBe("$30,000");
    expect(container.querySelector('[data-col="gastos"]')?.textContent).toBe("$20,000");
    expect(container.querySelector('[data-col="rentabilidad-detalle"]')?.textContent).toBe("$10,000");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 y el dato que viaja tampoco trae una rentabilidad de grupo", () => {
  /**
   * Recorre el payload de `/api/dashboard/vista-general` y junta todo campo cuyo
   * nombre hable de rentabilidad y que NO esté adentro de un elemento de
   * `semaforo[]`. Una "rentabilidad del grupo" viviría justamente ahí: al lado
   * de `ventas` y `margen`. Se ejecuta sobre el objeto de verdad, así que un
   * campo nuevo con cualquier nombre de contenedor queda cazado.
   */
  function rentabilidadesFueraDeSemaforo(payload: Record<string, unknown>): string[] {
    const fuera: string[] = [];
    const buscar = (valor: unknown, ruta: string) => {
      if (Array.isArray(valor)) valor.forEach((x, i) => buscar(x, `${ruta}[${i}]`));
      else if (valor && typeof valor === "object") {
        for (const [k, v] of Object.entries(valor)) {
          if (/rentabilidad/i.test(k) && typeof v === "number") fuera.push(`${ruta}.${k}=${v}`);
          buscar(v, `${ruta}.${k}`);
        }
      }
    };
    for (const [k, v] of Object.entries(payload)) {
      if (k === "semaforo") continue;
      if (/rentabilidad/i.test(k)) fuera.push(`${k}`);
      buscar(v, k);
    }
    return fuera;
  }

  const payload = {
    generadoEn: "2026-08-13T00:00:00.000Z",
    mes: "2026-08",
    ventas: { total: 700_000, empresasCount: 3, byEmpresa: [] },
    margen: { pct: 0.2, utilidad: 160_000 },
    // 🔴 Sin `total`: la suma de gastos entre empresas se retiró del payload el
    // 13-ago-2026 (ver `GastosPorEmpresa.tsx`). El fixture refleja la respuesta
    // REAL — si volviera a traer un total, este arnés dejaría de parecerse a la
    // pantalla que dice probar.
    gastos: { disponible: true, empresasConGasto: 2, empresasTotal: 8, porEmpresa: [] },
    disponibilidad: { total: 629_531.03, fechaMasVieja: "2026-08-01", cuentas: 8 },
    semaforo: FILAS,
    cxc: { total: 1, corriente: 1, vigilancia: 0, vencido: 0, empresasCount: 6, topClientes: [] },
    cxp: { total: 1, corriente: 1, vigilancia: 0, vencido: 0, empresasCount: 6, topProveedores: [] },
    reclamos: { antiguos: [], total: 0 },
  };

  it("la respuesta NO tiene ninguna rentabilidad fuera de semaforo[]", () => {
    expect(rentabilidadesFueraDeSemaforo(payload)).toEqual([]);
  });

  it("y no existe la clave `rentabilidad` de primer nivel", () => {
    expect(Object.keys(payload)).not.toContain("rentabilidad");
  });

  it("el barrido SÍ caza una rentabilidad de grupo si alguien la agrega", () => {
    // Sin esta prueba, un barrido roto devolvería [] siempre y pasaría en verde.
    const conGrupo = { ...payload, resumen: { rentabilidadGrupo: -20_000 } };
    expect(rentabilidadesFueraDeSemaforo(conGrupo)).toEqual(["resumen.rentabilidadGrupo=-20000"]);
  });

  it("🔴 la DISPONIBILIDAD no se tocó: sigue siendo su propio número", () => {
    // Daniel la mira todos los días y no entra en este cambio.
    expect(payload.disponibilidad.total).toBe(629_531.03);
  });
});
