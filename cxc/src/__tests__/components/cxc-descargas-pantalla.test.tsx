/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CXC — LAS DESCARGAS Y EL SALDO A FAVOR, MIRANDO LA PANTALLA (8-sep-2026).
 *
 * Los mismos hechos que `cxc-descargas.test.ts` sostiene leyendo el código, acá
 * probados por CONDUCTA: se monta el componente REAL y se cuenta lo que aparece
 * en el DOM. Un barrido de texto no ve si un botón se dibuja.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import MenuDescargar from "@/app/cxc/components/MenuDescargar";
import ClientRow from "@/app/cxc/components/ClientRow";
import ClientTable from "@/app/cxc/components/ClientTable";
import { ContextMenuProvider } from "@/components/ui";
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";

const noop = () => {};
const sinAviso = () => null;

const EMPRESAS: Company[] = [
  { key: "vistana", name: "Vistana International", brand: "Vistana" },
] as unknown as Company[];

function hacerCliente(llave: string, total: number): ConsolidatedClient {
  return {
    nombre_normalized: llave,
    companies: {
      vistana: {
        nombre: llave, codigo: "D-25",
        d0_30: total, d31_60: 0, d61_90: 0, d91_120: 0,
        d121_180: 0, d181_270: 0, d271_365: 0, mas_365: 0, total,
        ultimoPagoFecha: null, ultimoPagoMonto: null,
        ultimaCompraFecha: null, ultimaCompraMonto: null,
      },
    },
    correo: "", telefono: "", celular: "", contacto: "",
    total, current: total, watch: 0, overdue: 0,
    d0_30: total, d31_60: 0, d61_90: 0, d91_120: 0, d121_plus: 0,
  } as unknown as ConsolidatedClient;
}

const DEBE = hacerCliente("CITY MALL PASO CANOA", 1200);
const A_FAVOR = hacerCliente("VIVA PANAMA DUTTY FREE", -1147.52);

// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 el menú «Descargar» dibuja DOS líneas y CUATRO botones", () => {
  it("las dos líneas, con PDF y EXCEL cada una y sin subtítulo", () => {
    render(<MenuDescargar onDescargar={noop} />);
    expect(screen.getByText("Todos los clientes")).toBeTruthy();
    expect(screen.getByText("Total por cliente")).toBeTruthy();
    expect(screen.getByText("Detallado por compañía")).toBeTruthy();
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);
    // 🩸 Los subtítulos grises del menú viejo no vuelven.
    expect(screen.queryByText(/Hoja de cálculo/)).toBeNull();
    expect(screen.queryByText(/listo para imprimir/)).toBeNull();
    cleanup();
  });

  it("🩸 y no queda ni un CSV", () => {
    render(<MenuDescargar onDescargar={noop} />);
    expect(document.body.textContent).not.toContain("CSV");
    cleanup();
  });

  it("cada botón avisa QUÉ y en qué FORMATO", () => {
    const espia = vi.fn();
    render(<MenuDescargar onDescargar={espia} />);
    fireEvent.click(screen.getByLabelText("Total por cliente en PDF"));
    fireEvent.click(screen.getByLabelText("Detallado por compañía en EXCEL"));
    expect(espia.mock.calls).toEqual([
      ["total-por-cliente", "pdf"],
      ["por-compania", "excel"],
    ]);
    cleanup();
  });

  it("se toca con el dedo: 44 px de alto en los cuatro", () => {
    render(<MenuDescargar onDescargar={noop} />);
    for (const b of screen.getAllByRole("menuitem")) {
      expect(b.className).toContain("min-h-[44px]");
    }
    cleanup();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("🩸 al saldo A FAVOR no se le cobra", () => {
  function pintarFila(client: ConsolidatedClient) {
    return render(
      <ClientRow
        client={client}
        isExpanded={false}
        onToggle={noop}
        onCobrar={noop}
        seleccionado={false}
        onSeleccionar={noop}
        avisoSinPagar={null}
      />,
    );
  }

  it("el que DEBE tiene su botón «Cobrar»", () => {
    pintarFila(DEBE);
    expect(screen.getByRole("button", { name: "Cobrar" })).toBeTruthy();
    cleanup();
  });

  it("🔴 el que tiene saldo a favor NO lo tiene", () => {
    pintarFila(A_FAVOR);
    expect(screen.queryByRole("button", { name: "Cobrar" })).toBeNull();
    cleanup();
  });

  it("🔴 tampoco la casilla de «mandar a varios» — mandar a varios es cobrar", () => {
    pintarFila(A_FAVOR);
    expect(screen.queryByLabelText(/^Seleccionar a /)).toBeNull();
    cleanup();
    pintarFila(DEBE);
    expect(screen.getByLabelText("Seleccionar a CITY MALL PASO CANOA")).toBeTruthy();
    cleanup();
  });

  it("⚠️ pero SIGUE VIÉNDOSE, en su bloque «Saldo a favor»", () => {
    render(
      <ContextMenuProvider>
        <ClientTable
          filtered={[DEBE, A_FAVOR]}
          roleCompanies={EMPRESAS}
          companyFilter="all"
          toggleSort={noop}
          sortArrow={() => ""}
          onCobrar={noop}
          onOpenEstado={noop}
          seleccion={new Set()}
          onSeleccionar={noop}
          onSeleccionarTodos={noop}
          avisoSinPagarDe={sinAviso}
          marcaEnvioDe={sinAviso}
        />
      </ContextMenuProvider>,
    );
    expect(screen.getByText("VIVA PANAMA DUTTY FREE")).toBeTruthy();
    const titulo = screen.getByText(/Saldo a favor/);
    // Dentro de SU bloque no hay un solo «Cobrar» (ni el de la fila ni el del
    // panel desplegable, que el acordeón dibuja aunque esté cerrado).
    const bloque = titulo.parentElement as HTMLElement;
    expect([...bloque.querySelectorAll("button")].map((b) => b.textContent)).not.toContain("Cobrar");
    cleanup();
  });
});
