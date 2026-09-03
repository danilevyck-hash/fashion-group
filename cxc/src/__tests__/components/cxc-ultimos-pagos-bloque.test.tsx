// ─────────────────────────────────────────────────────────────────────────────
// CANDADO del bloque «Últimos pagos» — lo que Daniel VE.
//
// Daniel (3-sep-2026): "no me interesa saber qué factura pagó, solo ver sus
// últimos 3 pagos y fecha en CXC". El bloque dice tres líneas `12 ago 2026 ·
// $1,250.00`, o «Sin pagos registrados». Nada de número de recibo ni factura.
//
//  1. El texto de cada línea (fecha con fmtDate + monto con fmt) y el de vacío.
//  2. Que el bloque esté en las TRES superficies: CXC escritorio
//     (ContactPanel), CXC celular (PanelCxcMobile) y la cartera de Boston
//     (BostonTab) — y que cada cartera use SU hook.
//  3. Que en escritorio se pida recién al expandir (`activo={isExpanded}`):
//     el panel de los 211 clientes vive montado aunque esté cerrado.
//  4. Que el bloque se dibuje POR EMPRESA (el mapa de `visibleCompanies`),
//     no como una lista única mezclada.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import UltimosPagos from "@/components/cxc/UltimosPagos";
import { lineaPago, PAGOS_POR_EMPRESA, SIN_PAGOS, TITULO_ULTIMOS_PAGOS } from "@/lib/cxc/ultimos-pagos";

afterEach(cleanup);

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

describe("el texto", () => {
  it("una línea es `fecha · $monto`, con la fecha de fmtDate y el monto con dos decimales", () => {
    expect(lineaPago({ fecha: "2026-08-12", monto: 1250 })).toBe("12 ago 2026 · $1,250.00");
    expect(lineaPago({ fecha: "2026-07-22", monto: 187651.51 })).toBe("22 jul 2026 · $187,651.51");
  });

  it("son TRES por empresa, y el título y el vacío son los que pidió Daniel", () => {
    expect(PAGOS_POR_EMPRESA).toBe(3);
    expect(TITULO_ULTIMOS_PAGOS).toBe("Últimos pagos");
    expect(SIN_PAGOS).toBe("Sin pagos registrados");
  });
});

describe("el bloque dibujado", () => {
  it("con pagos: el título y una línea por pago, en orden", () => {
    render(
      <UltimosPagos
        empresa="Fashion Wear"
        pagos={[
          { fecha: "2026-08-20", monto: 63592.15 },
          { fecha: "2026-07-22", monto: 187651.51 },
          { fecha: "2026-06-29", monto: 117777.33 },
        ]}
      />,
    );
    expect(screen.getByText("Últimos pagos")).toBeTruthy();
    expect(screen.getByText("Fashion Wear", { exact: false })).toBeTruthy();
    const lineas = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(lineas).toEqual(["20 ago 2026 · $63,592.15", "22 jul 2026 · $187,651.51", "29 jun 2026 · $117,777.33"]);
  });

  it("sin pagos dice «Sin pagos registrados», nunca $0.00", () => {
    render(<UltimosPagos pagos={[]} />);
    expect(screen.getByText("Sin pagos registrados")).toBeTruthy();
    expect(screen.queryByText(/\$0\.00/)).toBeNull();
  });

  it("mientras carga no inventa nada, y si falla lo dice", () => {
    const { unmount } = render(<UltimosPagos pagos={null} />);
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.queryByText("Sin pagos registrados")).toBeNull();
    unmount();
    render(<UltimosPagos pagos="error" />);
    expect(screen.getByText("No se pudieron cargar los pagos.")).toBeTruthy();
  });
});

describe("las tres superficies lo montan, cada cartera con SU hook", () => {
  it("CXC escritorio: ContactPanel, un bloque POR EMPRESA, y se pide recién al expandir", () => {
    const panel = leer("src/app/admin/components/ContactPanel.tsx");
    expect(panel).toContain('from "@/components/cxc/UltimosPagos"');
    expect(panel).toContain("useUltimosPagosGrupo(codigo, activo)");
    expect(panel).not.toContain("useUltimosPagosBoston");
    // Por empresa: el bloque se dibuja dentro del map de las empresas visibles.
    expect(panel).toMatch(/visibleCompanies\.map\(\(co\) => \(\s*<UltimosPagos/);
    expect(panel).toContain("pagos={ultimosPagos.de(co.key)}");
    const tabla = leer("src/app/admin/components/ClientTable.tsx");
    expect(tabla).toContain("activo={isExpanded}");
  });

  it("CXC celular: PanelCxcMobile, adentro de la tarjeta de cada empresa", () => {
    const movil = leer("src/app/admin/components/PanelCxcMobile.tsx");
    expect(movil).toContain('from "@/components/cxc/UltimosPagos"');
    expect(movil).toContain("useUltimosPagosGrupo(codigo, true)");
    expect(movil).toContain("<UltimosPagos pagos={ultimosPagos.de(row.key)} compacto />");
    expect(movil).not.toContain("useUltimosPagosBoston");
  });

  it("Boston: BostonTab usa el hook de Boston y NO el del grupo", () => {
    const boston = leer("src/components/cxc/BostonTab.tsx");
    expect(boston).toContain("useUltimosPagosBoston(clienteSwitchId)");
    expect(boston).not.toContain("useUltimosPagosGrupo");
    expect(boston).not.toContain("/api/cxc/ultimos-pagos");
    // La cartera le manda el id de Switch con el que se piden los pagos.
    expect(leer("src/app/api/cxc/boston/route.ts")).toContain("cliente_switch_id: r.cliente_switch_id == null ? null : Number(r.cliente_switch_id)");
  });
});
