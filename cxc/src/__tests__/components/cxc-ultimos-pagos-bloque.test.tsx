// ─────────────────────────────────────────────────────────────────────────────
// CANDADO del bloque «Últimos pagos» — lo que Daniel VE.
//
// Daniel (3-sep-2026): "no me interesa saber qué factura pagó, solo ver sus
// últimos 3 pagos y fecha en CXC". El bloque dice tres líneas `12 ago 2026 ·
// $1,250.00`, o «Sin pagos registrados». Nada de número de recibo ni factura.
//
//  1. El texto de cada línea (fecha con fmtDate + monto con fmt) y el de vacío.
//  2. Que el bloque esté en las TRES superficies: CXC escritorio
//     (ClientTable → UltimosPagosFila), CXC celular (PanelCxcMobile →
//     UltimosPagosFila) y la cartera de Boston (BostonTab) — y que cada
//     cartera use SU hook.
//  3. Que en el grupo se pida recién al CLIC en el botón de la fila
//     (`abierto`): la sub-fila de los 211 clientes vive montada aunque esté
//     cerrada.
//  4. Que el bloque se dibuje POR EMPRESA (el mapa de `visibleCompanies`),
//     no como una lista única mezclada.
//
// ⚠️ CAMBIÓ DE DIRECCIÓN AL DÍA SIGUIENTE (4-sep-2026). El 3-sep el bloque
// nació ADENTRO del panel expandido (`ContactPanel` en escritorio, la tarjeta
// de cada empresa en `MobileClientExpanded` en celular) y este archivo lo
// exigía ahí. Daniel lo vio y dijo, textual: *"lo quiero ahí mismo pero con un
// botón para expandir, no solo al expandir el card, tendría que hacer dos
// expandir para verlo"*. Un clic, no dos. Ahora el bloque vive en UN solo
// lugar —la sub-fila que abre el botón «Últimos pagos ›» de la fila CERRADA,
// el mismo patrón que Boston ya tenía— y salió del panel expandido. Ese
// comportamiento (el botón, el clic único, el cliente que sigue cerrado) tiene
// su propio candado: `cxc-ultimos-pagos-boton-fila.test.tsx`.
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
  it("CXC grupo: UltimosPagosFila, un bloque POR EMPRESA, y se pide recién al clic", () => {
    const fila = leer("src/app/admin/components/UltimosPagosFila.tsx");
    expect(fila).toContain('from "@/components/cxc/UltimosPagos"');
    expect(fila).toContain("useUltimosPagosGrupo(codigo, abierto)");
    expect(fila).not.toContain("useUltimosPagosBoston");
    // Por empresa: el bloque se dibuja dentro del map de las empresas visibles.
    expect(fila).toMatch(/visibleCompanies\.map\(\(co\) => \(\s*<UltimosPagos/);
    expect(fila).toContain("pagos={ultimosPagos.de(co.key)}");
  });

  it("CXC escritorio: ClientTable la monta en la sub-fila del botón, abierta por `pagosOpen`", () => {
    const tabla = leer("src/app/admin/components/ClientTable.tsx");
    expect(tabla).toContain('from "./UltimosPagosFila"');
    expect(tabla).toContain("abierto={pagosOpen}");
    // Y ya NO adentro del panel expandido (ayer sí; hoy Daniel dijo un clic, no dos).
    expect(leer("src/app/admin/components/ContactPanel.tsx")).not.toMatch(/<UltimosPagos|useUltimosPagosGrupo\(/);
  });

  it("CXC celular: PanelCxcMobile la monta en la tarjeta CERRADA, al toque del botón", () => {
    const movil = leer("src/app/admin/components/PanelCxcMobile.tsx");
    expect(movil).toContain('from "./UltimosPagosFila"');
    expect(movil).toContain("<UltimosPagosFila client={client} companyFilter=\"all\" roleCompanies={cxcCompanies} abierto apilado />");
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
