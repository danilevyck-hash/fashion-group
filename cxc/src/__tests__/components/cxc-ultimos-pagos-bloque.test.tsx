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
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔄 Y VOLVIÓ A CAMBIAR DE DIRECCIÓN EL 5-sep-2026, con el rediseño del módulo.
//
// El corte POR EMPRESA se retiró del CXC del grupo. Medido: los clientes
// grandes le pagan a varias empresas EL MISMO DÍA —el 29-jun-2026 D-25 pagó
// $241.857,77 repartido en las SEIS—, así que «3 pagos por empresa» eran **18
// líneas para decir lo que dicen 3**, y ninguna decía cuánto entró ese día. El
// bloque del grupo se agrupa ahora POR FECHA (`UltimosPagosPorFecha`) y vive
// dentro del panel expandido, junto al desglose por empresa que Daniel eligió
// conservar. Con él se fueron el botón «Últimos pagos ›» y `UltimosPagosFila`.
//
// En BOSTON el bloque por-empresa NO tenía sentido desde el principio —es UNA
// empresa— así que sus 3 pagos se mudaron adentro de su cajón de documentos,
// junto a lo que se está cobrando. Sigue usando SU hook y SU ruta.
//
// Lo que este archivo defiende y NO cambió: el TEXTO de una línea, que son
// tres, y que cada cartera lee por su propio camino.
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

describe("🔄 dónde vive el bloque hoy, y cada cartera con SU hook", () => {
  it("CXC del grupo: POR FECHA, dentro del panel expandido, y se pide al abrirlo", () => {
    const bloque = leer("src/app/cxc/components/UltimosPagosPorFecha.tsx");
    expect(bloque).toContain('from "@/lib/cxc/pagos-por-fecha"');
    expect(bloque).toContain("TITULO_ULTIMOS_PAGOS");
    expect(bloque).toContain("SIN_PAGOS");
    expect(bloque).not.toContain("useUltimosPagosBoston");

    const panel = leer("src/app/cxc/components/ContactPanel.tsx");
    expect(panel).toContain("<UltimosPagosPorFecha");
    // Se pide recién con el panel ABIERTO: en escritorio el panel de los 100
    // clientes vive montado aunque esté cerrado.
    expect(panel).toContain("useUltimosPagosGrupo(codigo, abierto)");
  });

  it("🩸 el corte por empresa y su botón ya no existen en el grupo", () => {
    expect(fs.existsSync(path.join(RAIZ, "src/app/cxc/components/UltimosPagosFila.tsx"))).toBe(false);
    expect(fs.existsSync(path.join(RAIZ, "src/components/cxc/BotonUltimosPagos.tsx"))).toBe(false);
    for (const rel of [
      "src/app/cxc/components/ClientTable.tsx",
      "src/app/cxc/components/PanelCxcMobile.tsx",
    ]) {
      expect(leer(rel), rel).not.toContain("UltimosPagosFila");
      expect(leer(rel), rel).not.toContain("BotonUltimosPagos");
    }
  });

  it("CXC celular: el MISMO bloque por fecha, dentro de la tarjeta abierta", () => {
    const movil = leer("src/app/cxc/components/PanelCxcMobile.tsx");
    expect(movil).toContain("<UltimosPagosPorFecha");
    expect(movil).toContain("useUltimosPagosGrupo(codigo, true)");
    expect(movil).not.toContain("useUltimosPagosBoston");
  });

  it("Boston: sus 3 pagos viven en SU cajón, con SU hook y NO el del grupo", () => {
    const cajon = leer("src/components/cxc/BostonDocumentosDrawer.tsx");
    expect(cajon).toContain("useUltimosPagosBoston");
    expect(cajon).toContain('from "@/components/cxc/UltimosPagos"');
    expect(cajon).not.toContain("useUltimosPagosGrupo");
    expect(cajon).not.toContain("/api/cxc/ultimos-pagos");
    // La cartera le manda el id de Switch con el que se piden los pagos.
    expect(leer("src/app/api/cxc/boston/route.ts")).toContain("cliente_switch_id: r.cliente_switch_id == null ? null : Number(r.cliente_switch_id)");
    expect(leer("src/components/cxc/BostonTab.tsx")).toContain("clienteSwitchId={documentosDe?.cliente_switch_id ?? null}");
  });
});
