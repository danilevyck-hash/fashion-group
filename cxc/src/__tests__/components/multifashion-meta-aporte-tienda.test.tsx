// ─────────────────────────────────────────────────────────────────────────────
// CANDADO de "los aportes suman 96% Y LA PANTALLA DICE POR QUÉ".
//
// 🩸 POR QUÉ RENDERIZA EN VEZ DE LEER EL ARCHIVO. La primera versión de este
// candado buscaba `textoAporteNoAsignado` dentro del .tsx — y **borrar la línea
// entera de la pantalla lo dejaba en VERDE**, porque el `import` de arriba ya
// contiene ese texto. Es la cuarta vez que este repo paga el mismo error (ver
// CLAUDE.md: el `revalidateOnFocus` de Reclamos, el `<h1>` de Saldos, el
// `fetchMayorAsientos` del mayor). Un candado que se cumple con su propia
// plomería da permiso para romper.
//
// Los números son los MEDIDOS contra producción el 14-ago-2026 sobre may-jul
// (`scripts/_verif-meta-mide-la-tienda.ts`): tienda $147.737,77 · las 4
// $141.705,00 = 95,9% · el 4,1% restante son códigos viejos abiertos en Switch.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MetaAvanceCard } from "@/components/multifashion/MetaAvanceCard";
import { MetasEnVendedoras } from "@/components/multifashion/MetasEnVendedoras";
import { avanceMeta } from "@/lib/multifashion/metas-avance";
import type { MetaConAvance } from "@/lib/multifashion/metas-lectura";

// `MetasEnVendedoras` lee por SWR. Acá se le sirve el payload directo: lo que
// se está probando es lo que DIBUJA, no cómo lo pide.
const datosSwr = { valor: null as unknown };
vi.mock("swr", () => ({
  default: () => ({ data: datosSwr.valor }),
}));

const TIENDA = 147737.77;

const LAS_CUATRO: [string, number][] = [
  ["Sheynee Batista", 47857.0],
  ["Milagros Torres", 41416.1],
  ["Jailine", 35260.48],
  ["Jennifer Miranda", 17171.42],
];
const SUMA_CUATRO = 141705.0;

function metaGrupal(over: Partial<MetaConAvance> = {}): MetaConAvance {
  const avance = avanceMeta({
    desde: "2026-05-01",
    hasta: "2026-07-31",
    hoy: "2026-06-15",
    objetivo: 420000,
    vendido: TIENDA,
    pesos: [],
  });
  return {
    id: "m1",
    nombre: "Meta del viaje",
    desde: "2026-05-01",
    hasta: "2026-07-31",
    objetivo: 420000,
    tipo: "grupal",
    premio: "Un viaje para todas",
    premioMonto: 2000,
    activa: true,
    participantes: LAS_CUATRO.map(([nombre]) => ({
      clave: nombre.toUpperCase(),
      nombre,
      objetivoIndividual: null,
    })),
    avance,
    porVendedora: LAS_CUATRO.map(([nombre, vendido]) => ({
      clave: nombre.toUpperCase(),
      nombre,
      vendido,
      aporte: vendido / TIENDA,
      objetivo: null,
      avance: null,
    })),
    aporteNoAsignado: 1 - SUMA_CUATRO / TIENDA,
    fuente: "rpc",
    temporadaDisponible: false,
    ...over,
  };
}

const pintarTarjeta = (meta: MetaConAvance) =>
  render(<MetaAvanceCard meta={meta} puedeEditar={false} onEditar={() => {}} />);

const pintarVendedoras = (metas: MetaConAvance[]) => {
  datosSwr.valor = { instalado: true, metas };
  return render(<MetasEnVendedoras />);
};

afterEach(() => {
  cleanup();
  datosSwr.valor = null;
});

describe("la tarjeta de la meta muestra la venta de la TIENDA", () => {
  it("🔴 el monto grande es el total de la tienda, no la suma de las 4", () => {
    pintarTarjeta(metaGrupal());
    expect(screen.getByText("$147,737.77")).toBeTruthy();
    expect(screen.queryByText("$141,705.00")).toBeNull();
  });

  it("dice que la meta cuenta toda la venta, no solo la de ellas", () => {
    pintarTarjeta(metaGrupal());
    expect(
      screen.getByText(/La meta cuenta toda la venta de la tienda/i),
    ).toBeTruthy();
  });

  it("🔴 EXPLICA por qué los aportes no llegan al 100%", () => {
    pintarTarjeta(metaGrupal());
    const linea = screen.getByText(/que falta son ventas hechas con el código/i);
    expect(linea.textContent).toContain("El 4%");
    expect(linea.textContent).toContain("no está en esta lista");
    expect(linea.textContent).toContain("Cuentan para la meta igual");
  });

  it("los aportes que se ven suman 96%, y son porción de la tienda", () => {
    pintarTarjeta(metaGrupal());
    // 47.857,00 / 147.737,77 = 32%  (contra 34% si midiera solo a las 4)
    expect(screen.getByText(/32% del avance/)).toBeTruthy();
    expect(screen.queryByText(/34% del avance/)).toBeNull();
  });

  it("sin nada que explicar (todo asignado) la línea NO se dibuja", () => {
    pintarTarjeta(metaGrupal({ aporteNoAsignado: 0 }));
    expect(screen.queryByText(/que falta son ventas hechas con el código/i)).toBeNull();
  });

  it("⚠️ en una meta POR VENDEDORA no aparece ninguna de las dos líneas", () => {
    pintarTarjeta(
      metaGrupal({
        tipo: "vendedora",
        aporteNoAsignado: 0,
        porVendedora: LAS_CUATRO.map(([nombre, vendido]) => ({
          clave: nombre.toUpperCase(),
          nombre,
          vendido,
          aporte: vendido / SUMA_CUATRO,
          objetivo: 40000,
          avance: avanceMeta({
            desde: "2026-05-01",
            hasta: "2026-07-31",
            hoy: "2026-06-15",
            objetivo: 40000,
            vendido,
            pesos: [],
          }),
        })),
      }),
    );
    expect(screen.queryByText(/La meta cuenta toda la venta de la tienda/i)).toBeNull();
    expect(screen.queryByText(/que falta son ventas hechas con el código/i)).toBeNull();
    expect(screen.getByText(/La meta de cada una/i)).toBeTruthy();
  });
});

describe("la pestaña Vendedoras dice lo MISMO", () => {
  it("🔴 muestra la línea del faltante, con el mismo porcentaje", () => {
    pintarVendedoras([metaGrupal()]);
    const linea = screen.getByText(/que falta son ventas hechas con el código/i);
    expect(linea.textContent).toContain("El 4%");
  });

  it("el encabezado dice que la meta cuenta toda la venta de la tienda", () => {
    pintarVendedoras([metaGrupal()]);
    expect(screen.getByText(/Esta meta cuenta toda la venta de la/i)).toBeTruthy();
    expect(screen.getByText(/La tienda lleva/i)).toBeTruthy();
  });

  it("⚠️ SIN PODIO: no numera ni premia posiciones", () => {
    const { container } = pintarVendedoras([metaGrupal()]);
    for (const prohibido of ["🥇", "🥈", "🥉", "1º", "2º", "3º"]) {
      expect(container.textContent ?? "").not.toContain(prohibido);
    }
  });
});
