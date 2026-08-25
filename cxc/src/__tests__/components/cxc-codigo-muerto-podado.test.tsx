/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CXC — LO QUE NO SE DIBUJABA NI SE LEÍA, SE FUE (24-ago-2026).
 *
 * Cuatro pedazos de código muerto, y el riesgo de los cuatro es el MISMO: no es
 * el peso, es que alguien arregle el buscador EQUIVOCADO y jure que la pantalla
 * no cambia.
 *
 *   1. `ClientTable` tenía un SEGUNDO buscador, un botón «Filtros», una ventana
 *      de filtros y una tira de píldoras — detrás de `!hideSearchAndRiskFilters`,
 *      y el único que monta esa tabla le pasaba la bandera SIEMPRE.
 *   2. `ClientRow` pintaba una tarjeta de celular tras `sm:hidden`, dentro de un
 *      padre que vive tras `hidden md:block`: los dos tramos no se cruzan nunca.
 *   3. `handleSaveEdit` + el prop `onSaveEdit` — el guardado de contacto que ya
 *      no llamaba nadie (la edición se mudó a la ficha `/clientes/[codigo]`).
 *   4. `/api/vendors` y `/api/upload`: 2 de 6 peticiones por apertura del CXC,
 *      contra una base en compute Micro, y NADIE leía sus resultados.
 *
 * 🔑 SON TESTS DE CONDUCTA donde se puede: se monta el componente REAL y se
 * cuenta lo que aparece en el DOM y lo que sale por `fetch`. Los barridos de
 * texto que quedan BORRAN LOS COMENTARIOS PRIMERO — este repo ya pagó cuatro
 * veces el candado que se cumple con su propia explicación.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import fs from "node:fs";
import path from "node:path";
import ClientTable from "@/app/admin/components/ClientTable";
import { ContextMenuProvider } from "@/components/ui";
import useAdminData from "@/app/admin/hooks/useAdminData";
import type { ConsolidatedClient } from "@/lib/types";
import type { Company } from "@/lib/companies";

const RAIZ = process.cwd();
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const leer = (rel: string) => sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

const EMPRESAS: Company[] = [
  { key: "vistana", name: "Vistana International", brand: "Vistana" },
  { key: "fashion_wear", name: "Fashion Wear", brand: "Fashion Wear" },
] as unknown as Company[];

const CLIENTE = {
  nombre_normalized: "CITY MALL PASO CANOA",
  companies: {
    vistana: {
      nombre: "CITY MALL PASO CANOA", codigo: "D-25",
      d0_30: 1000, d31_60: 0, d61_90: 0, d91_120: 0,
      d121_180: 0, d181_270: 0, d271_365: 0, mas_365: 0, total: 1000,
      ultimoPagoFecha: null, ultimoPagoMonto: null,
      ultimaCompraFecha: null, ultimaCompraMonto: null,
    },
  },
  correo: "", telefono: "", celular: "", contacto: "", resultado_contacto: "",
  total: 1000, current: 1000, watch: 0, overdue: 0,
  d0_30: 1000, d31_60: 0, d61_90: 0, d91_120: 0, d121_plus: 0,
  hasOverride: false,
} as unknown as ConsolidatedClient;

const noop = () => {};

function pintarTabla() {
  return render(
    <ContextMenuProvider>
    <ClientTable
      filtered={[CLIENTE]}
      roleCompanies={EMPRESAS}
      roleClients={[CLIENTE]}
      companyFilter="all"
      setCompanyFilter={noop}
      riskFilter="all"
      search=""
      sortKey="total"
      sortDir="desc"
      toggleSort={noop}
      sortArrow={() => ""}
      userRole="admin"
      onOpenEmail={noop}
      onWhatsApp={noop}
      onCopyMessage={noop}
      onOpenEstado={noop}
    />
    </ContextMenuProvider>,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 y 2. EL SEGUNDO BUSCADOR Y LA TARJETA QUE NO SE DIBUJABA
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 la tabla del CXC no tiene un segundo juego de filtros", () => {
  it("no dibuja NINGÚN buscador: el vivo es el de la página padre", () => {
    pintarTabla();
    const buscadores = [...document.querySelectorAll("input")]
      .filter((i) => /Buscar/i.test(i.getAttribute("placeholder") ?? ""));
    expect(buscadores).toHaveLength(0);
  });

  it("no dibuja el botón «Filtros» ni su ventana", () => {
    const { container } = pintarTabla();
    expect(container.textContent).not.toMatch(/Filtros/);
    // Las píldoras de tramo son de `KpiCards`, no de acá.
    expect(container.textContent).not.toMatch(/Vencido reciente \(91-120/);
  });

  it("el filtro de EMPRESA sí se dibuja — eso no era código muerto", () => {
    pintarTabla();
    const select = document.querySelector("select")!;
    expect(select).toBeTruthy();
    expect(select.textContent).toMatch(/Todas mis empresas/);
  });

  it("la fila pinta el nombre del cliente UNA sola vez", () => {
    // Eran dos: la tarjeta de celular (muerta) y la grilla de escritorio.
    pintarTabla();
    const nombres = document.querySelectorAll(`[title="${CLIENTE.nombre_normalized}"]`);
    expect(nombres).toHaveLength(1);
  });

  it("la FILA muestra el saldo dos veces —su tramo y el Total— y ni una más", () => {
    // ⚠️ Se mide DENTRO de la fila (`.border-l-4`), no en todo el árbol: el
    // desglose por empresa de `ContactPanel` es otra cosa y sigue vivo.
    // Con la tarjeta muerta eran TRES: el total de la tarjeta + los dos de la
    // grilla de escritorio.
    pintarTabla();
    const fila = document.querySelector(".border-l-4")!;
    expect((fila.textContent!.match(/1,000\.00/g) ?? []).length).toBe(2);
  });

  it("la fila no dibuja la píldora de estado que era propia de esa tarjeta", () => {
    // El badge redondeado («Por vencer» y compañía) lo pintaba SOLO la tarjeta.
    // Los mismos términos como ENCABEZADO del desglose por empresa se quedan.
    pintarTabla();
    const fila = document.querySelector(".border-l-4")!;
    expect(fila.textContent).not.toMatch(/Por vencer|Vencido reciente|Vencido crítico/);
    expect(fila.querySelectorAll(".rounded-full")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. EL GUARDADO DE CONTACTO QUE NO LLAMABA NADIE
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 el CXC ya no tiene un camino de escritura de contacto sin puerta", () => {
  it("`onSaveEdit` no existe en ninguna de las tres piezas", () => {
    for (const rel of [
      "src/app/admin/page.tsx",
      "src/app/admin/components/ClientTable.tsx",
      "src/app/admin/components/ContactPanel.tsx",
    ]) {
      expect(leer(rel), `${rel} volvió a tener onSaveEdit`).not.toMatch(/onSaveEdit/);
    }
  });

  it("el panel del grupo no escribe overrides ni sincroniza el directorio", () => {
    const src = leer("src/app/admin/page.tsx");
    expect(src).not.toMatch(/handleSaveEdit/);
    expect(src).not.toMatch(/\/api\/directorio\/sync/);
  });

  it("⚠️ pero SIGUE LEYENDO los overrides guardados (no se perdió nada)", () => {
    // La tabla `cxc_client_overrides` y sus filas QUEDAN: un contacto guardado
    // antes le sigue ganando al maestro. Lo que se retiró es la escritura.
    const hook = leer("src/app/admin/hooks/useAdminData.ts");
    expect(hook).toMatch(/\/api\/cxc\/overrides/);
    expect(hook).toMatch(/overrideMap/);
  });

  it("la ficha del cliente SIGUE siendo donde se edita el contacto", () => {
    const ruta = path.join(RAIZ, "src/app/api/clientes/[codigo]/route.ts");
    expect(fs.existsSync(ruta)).toBe(true);
    expect(sinComentarios(fs.readFileSync(ruta, "utf8"))).toMatch(/export async function PATCH/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. DOS PETICIONES MENOS POR CADA APERTURA DEL CXC
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 el CXC deja de pedir lo que nadie lee", () => {
  let pedidos: string[];

  beforeEach(() => {
    pedidos = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      pedidos.push(String(url));
      return { ok: true, json: async () => ({ rows: [] }) } as unknown as Response;
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("no pide `/api/vendors` ni `/api/upload`", async () => {
    renderHook(() => useAdminData(true), {
      wrapper: ({ children }) => (
        <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
      ),
    });
    await waitFor(() => expect(pedidos.length).toBeGreaterThan(0));
    expect(pedidos.some((u) => u.includes("/api/vendors"))).toBe(false);
    expect(pedidos.some((u) => u.startsWith("/api/upload"))).toBe(false);
  });

  it("sigue pidiendo las CUATRO que sí se leen", async () => {
    renderHook(() => useAdminData(true), {
      wrapper: ({ children }) => (
        <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
      ),
    });
    await waitFor(() => expect(pedidos.length).toBe(4));
    for (const esperada of [
      "/api/cxc/aging",
      "/api/cxc/overrides",
      "/api/cxc/ultimo-pago",
      "/api/cxc/ultima-compra",
    ]) {
      expect(pedidos.some((u) => u.startsWith(esperada)), `falta ${esperada}`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. LA VISTA QUE NO SE MOSTRABA EN NINGUNA PANTALLA
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 `CompanySummary` se borró y no vuelve", () => {
  it("el archivo ya no existe", () => {
    expect(fs.existsSync(path.join(RAIZ, "src/app/admin/components/CompanySummary.tsx"))).toBe(false);
  });

  it("nadie en `src/` lo importa", () => {
    const culpables: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { recorrer(p); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        if (p.includes(path.join("__tests__"))) continue;
        if (/CompanySummary/.test(sinComentarios(fs.readFileSync(p, "utf8")))) {
          culpables.push(path.relative(RAIZ, p));
        }
      }
    };
    recorrer(path.join(RAIZ, "src"));
    expect(culpables).toEqual([]);
  });
});
