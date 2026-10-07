// 🔴 UN SOLO AVISO EN LÍNEA (Daniel, 2-oct-2026: «esto se puede optimizar, esos
// tipos de mensaje across el sistema»). Regla en docs/diseno.md › «Detalles
// aprendidos». Todo aviso dentro de una pantalla es <Aviso>
// (src/components/ui/Aviso.tsx), detrás de AVISOS_2026_10.
//
// El candado: ninguna caja de aviso NUEVA (fondo amber/red/blue/yellow-50 con
// borde) fuera del componente. Techo POR ARCHIVO que solo baja: cuenta los usos
// que no son avisos (chips, campos inválidos, celdas) y la excepción de
// Usuarios › Editar usuario. 2-oct-2026: con el «sí» de Daniel se borraron las
// cajas de antes (`legado`) y el techo bajó de 185 a 71.
import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react";
import { textoDelAviso } from "@/lib/asistencia/relojes-en-la-fila";

const CAJA = /bg-(amber|red|blue|yellow)-50(?![0-9/])/;
const TECHO: Record<string, number> = {
  "app/admin/usuarios/page.tsx": 1,
  "app/asistencia/EstadoReloj.tsx": 2,
  "app/asistencia/PlanillaTab.tsx": 2,
  "app/asistencia/PrestamosTab.tsx": 1,
  "app/asistencia/aprobaciones/PorColaborador.tsx": 2,
  "app/cxc/components/TiraTotales.tsx": 1,
  "app/gastos-contabilidad/components/ResumenEgresos.tsx": 1,
  "app/gastos-contabilidad/components/saldos/SaldosBancarios.tsx": 2,
  "app/despachos/[id]/page.tsx": 1,
  "app/despachos/components/EtiquetasPendientes.tsx": 2,
  "app/despachos/components/EtiquetasPorEnvio.tsx": 1,
  "app/despachos/components/EtiquetasView.tsx": 1,
  "app/despachos/components/FacturasDelCliente.tsx": 1,
  "app/despachos/components/GuiasList.tsx": 1,
  "app/marketing/components/EntregasSection.tsx": 3,
  "app/marketing/components/FacturasSection.tsx": 1,
  "app/marketing/mobiliario/page.tsx": 1,
  "app/prestamos/PrestamosClient.tsx": 1,
  "app/prestamos/components/types.ts": 2,
  "app/productos/cargar/AlarmaDescripcionesNuevas.tsx": 1,
  "app/productos/cargar/CurvasView.tsx": 1,
  "app/productos/cargar/DepuradorClient.tsx": 4,
  "app/productos/cargar/FacturasTiendaClient.tsx": 3,
  "app/productos/cargar/ReebokClient.tsx": 5,
  "app/reclamos/components/EmpresaList.tsx": 1,
  "app/reclamos/components/EmpresaSelector.tsx": 3,
  "app/reclamos/components/ReclamoDetail.tsx": 1,
  "app/reclamos/components/ReclamoForm.tsx": 1,
  "app/reclamos/components/SettlementModal.tsx": 1,
  "app/recordatorios/components/CalendarioMes.tsx": 1,
  "app/recordatorios/components/LineaNueva.tsx": 1,
  "app/recordatorios/components/RecordatorioFormModal.tsx": 2,
  "components/Sidebar.tsx": 1,
  "components/catalogo/BarraModoPedido.tsx": 1,
  "components/catalogo/CatalogoStickyCartBar.tsx": 1,
  "components/catalogo/CheckoutClient.tsx": 2,
  "components/catalogo/ConfirmacionClient.tsx": 1,
  "components/catalogo/EnviarDocumentoSwitch.tsx": 1,
  "components/marketing/FacturaCard.tsx": 3,
  "components/marketing/PreciosProveedorAyuda.tsx": 2,
  "components/multifashion/ClientesMultifashionSubtab.tsx": 2,
  "components/multifashion/MultifashionResumenView.tsx": 1,
  "components/multifashion/ProductosSubtab.tsx": 1,
  "components/multifashion/VentaHoyCard.tsx": 1,
  "components/ui/Chip.tsx": 2,
};

function* archivos(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!p.endsWith("__tests__")) yield* archivos(p); }
    else if (/\.tsx?$/.test(n) && !n.includes(".test.")) yield p;
  }
}

function contar(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const raiz of ["src/app", "src/components"])
    for (const f of archivos(raiz)) {
      if (f.endsWith("components/ui/Aviso.tsx")) continue;
      const n = readFileSync(f, "utf8").split("\n").filter((l) => CAJA.test(l) && l.includes("border")).length;
      if (n) out[f.replace(/^src\//, "")] = n;
    }
  return out;
}

describe("aviso en línea: candado", () => {
  it("ninguna caja de aviso nueva fuera de <Aviso> (techo por archivo, solo baja)", () => {
    const hoy = contar();
    const pasados = Object.entries(hoy)
      .filter(([f, n]) => n > (TECHO[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} (techo ${TECHO[f] ?? 0}) → usa <Aviso> de @/components/ui/Aviso`);
    expect(pasados).toEqual([]);
  });

  // 🔁 CAMBIÓ DE DIRECCIÓN (2-oct-2026): nacía apagado («la pantalla de hoy, al
  // pie de la letra»). Daniel aprobó y se prendió. El control al revés se queda:
  // con el interruptor apagado, una caja con `legado` sigue dibujando lo de antes.
  it("el interruptor está prendido: Daniel aprobó el 2-oct-2026", async () => {
    const src = readFileSync("src/lib/ui/avisos-2026-10.ts", "utf8");
    expect(src).toMatch(/Daniel aprobó el 2-oct-2026/);
    expect(src).toMatch(/export const AVISOS_2026_10 = true;/);
  });

  it("control al revés: apagado, `legado` sigue mandando", async () => {
    vi.resetModules();
    vi.doMock("@/lib/ui/avisos-2026-10", () => ({ AVISOS_2026_10: false }));
    const { Aviso } = await import("@/components/ui/Aviso");
    render(<Aviso legado={<p>caja de antes</p>}>texto nuevo</Aviso>);
    expect(screen.getByText("caja de antes")).toBeTruthy();
    expect(screen.queryByText("texto nuevo")).toBeNull();
    vi.doUnmock("@/lib/ui/avisos-2026-10");
  });

  it("excepción documentada: la nota del rol propio en Usuarios queda chica", () => {
    const u = readFileSync("src/app/admin/usuarios/page.tsx", "utf8");
    expect(u).toMatch(/EXCEPCIÓN a <Aviso>/);
    expect(u).toMatch(/Cambiar tu propio rol te quitará acceso de administrador\./);
  });

  it("los dos avisos de Daniel ya pasaron al componente", () => {
    const pedido = readFileSync("src/components/catalogo/PedidoDetalleClient.tsx", "utf8");
    expect(pedido).toMatch(/No se puede editar\./);
    const reloj = readFileSync("src/app/asistencia/EstadoReloj.tsx", "utf8");
    expect(reloj).toMatch(/<Aviso/);
  });
});

describe("aviso en línea: prendido", () => {
  it("ícono, texto y la acción a la derecha en la misma fila; sin legado", async () => {
    vi.resetModules();
    vi.doMock("@/lib/ui/avisos-2026-10", () => ({ AVISOS_2026_10: true }));
    const { Aviso } = await import("@/components/ui/Aviso");
    const { container } = render(
      <Aviso tono="aviso" accion={{ texto: "Duplicar y corregir", onClick: () => {} }} ayuda="También en Switch." legado={<p>caja de antes</p>}>
        Pedido ya enviado a Switch (#16-000002125). No se puede editar.
      </Aviso>,
    );
    expect(screen.queryByText("caja de antes")).toBeNull();
    const caja = container.querySelector("[data-aviso=aviso]")!;
    expect(caja.className).toContain("bg-amber-50");
    expect(caja.className).toContain("rounded-lg");
    expect(caja.querySelector("svg")).toBeTruthy();
    const boton = screen.getByText("Duplicar y corregir");
    expect(boton.closest(".ml-auto")).toBeTruthy();
    expect(screen.queryByText("También en Switch.")).toBeNull();
    screen.getByLabelText("Más información").click();
    vi.doUnmock("@/lib/ui/avisos-2026-10");
  });

  it("error es role=alert; info es gris", async () => {
    vi.resetModules();
    vi.doMock("@/lib/ui/avisos-2026-10", () => ({ AVISOS_2026_10: true }));
    const { Aviso } = await import("@/components/ui/Aviso");
    const { container } = render(<><Aviso tono="error">a</Aviso><Aviso tono="info">b</Aviso></>);
    expect(container.querySelector("[data-aviso=error]")!.getAttribute("role")).toBe("alert");
    expect(container.querySelector("[data-aviso=info]")!.className).toContain("bg-gray-50");
    vi.doUnmock("@/lib/ui/avisos-2026-10");
  });
});

describe("relojes: el texto del aviso", () => {
  it("«Relojes de Multifashion y Boston sin señal · hace 1 día»", () => {
    expect(textoDelAviso([
      { dispositivo: "reloj acs", salud: "callado", minutosSinNoticias: 2613 },
      { dispositivo: "reloj cboston", salud: "callado", minutosSinNoticias: 2600 },
    ])).toBe("Relojes de Multifashion y Boston sin señal · hace 1 día");
  });
  it("uno solo y un reloj al día no se nombra", () => {
    expect(textoDelAviso([
      { dispositivo: "reloj cboston", salud: "callado", minutosSinNoticias: 130 },
      { dispositivo: "reloj acs", salud: "al_dia", minutosSinNoticias: 3 },
    ])).toBe("Reloj de Boston sin señal · hace 2 horas");
  });
  it("todos al día: el mismo texto de la pastilla", () => {
    expect(textoDelAviso([{ dispositivo: "reloj acs", salud: "al_dia", minutosSinNoticias: 3 }]))
      .toBe("Reloj de Multifashion al día · hace 3 minutos");
  });
});
