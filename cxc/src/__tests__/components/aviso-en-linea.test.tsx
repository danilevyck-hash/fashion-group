// 🔴 UN SOLO AVISO EN LÍNEA (Daniel, 2-oct-2026: «esto se puede optimizar, esos
// tipos de mensaje across el sistema»). Regla en docs/diseno.md › «Detalles
// aprendidos». Todo aviso dentro de una pantalla es <Aviso>
// (src/components/ui/Aviso.tsx), detrás de AVISOS_2026_10.
//
// El candado: ninguna caja de aviso NUEVA (fondo amber/red/blue/yellow-50 con
// borde) fuera del componente. Techo POR ARCHIVO que solo baja: hoy cuenta las
// cajas viejas que viven en `legado` y los usos que no son avisos (chips,
// campos inválidos, celdas). Al prender el interruptor y borrar el legado, baja.
import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react";
import { textoDelAviso } from "@/lib/asistencia/relojes-en-la-fila";

const CAJA = /bg-(amber|red|blue|yellow)-50(?![0-9/])/;
const TECHO: Record<string, number> = {
  "app/admin/usuarios/NovedadesTab.tsx": 1,
  "app/admin/usuarios/VendedorSwitchSection.tsx": 1,
  "app/admin/usuarios/VisitasTab.tsx": 1,
  "app/admin/usuarios/page.tsx": 1,
  "app/asistencia/AprobacionesTab.tsx": 4,
  "app/asistencia/ConfiguracionTab.tsx": 3,
  "app/asistencia/CorregirMarcacionModal.tsx": 2,
  "app/asistencia/EstadoReloj.tsx": 2,
  "app/asistencia/MovimientosQuincenaTab.tsx": 1,
  "app/asistencia/PlanillaTab.tsx": 8,
  "app/asistencia/PrestamosTab.tsx": 1,
  "app/asistencia/aprobaciones/PorColaborador.tsx": 2,
  "app/asistencia/colaboradores/SeccionOtrosServicios.tsx": 1,
  "app/boston/tabs/PlanillaBoston.tsx": 2,
  "app/cxc/components/EnviarEmailModal.tsx": 2,
  "app/cxc/components/EstadoCuentaDrawer.tsx": 1,
  "app/cxc/components/HojaCobrar.tsx": 2,
  "app/cxc/components/TiraTotales.tsx": 1,
  "app/gastos-contabilidad/GastosContabilidadClient.tsx": 1,
  "app/gastos-contabilidad/components/ResumenEgresos.tsx": 1,
  "app/gastos-contabilidad/components/saldos/SaldosBancarios.tsx": 3,
  "app/gastos-contabilidad/components/saldos/SaldosBancoTab.tsx": 1,
  "app/guias/[id]/page.tsx": 3,
  "app/guias/components/AtarClienteModal.tsx": 1,
  "app/guias/components/EtiquetasPendientes.tsx": 2,
  "app/guias/components/EtiquetasPorEnvio.tsx": 4,
  "app/guias/components/EtiquetasView.tsx": 5,
  "app/guias/components/FacturasDelCliente.tsx": 1,
  "app/guias/components/GuiasConfiguracionView.tsx": 1,
  "app/guias/components/GuiasList.tsx": 2,
  "app/marcacion/MarcacionClient.tsx": 1,
  "app/marketing/components/CerrarPeriodoModal.tsx": 4,
  "app/marketing/components/DetallePeriodoView.tsx": 1,
  "app/marketing/components/EntregasSection.tsx": 3,
  "app/marketing/components/FacturasSection.tsx": 1,
  "app/marketing/components/FotosSection.tsx": 1,
  "app/marketing/components/celular/PiezasCelular.tsx": 1,
  "app/marketing/mobiliario/page.tsx": 1,
  "app/prestamos/PrestamosClient.tsx": 1,
  "app/prestamos/components/AplicarQuincenaModal.tsx": 1,
  "app/prestamos/components/NuevoMovimientoModal.tsx": 1,
  "app/prestamos/components/types.ts": 2,
  "app/productos/cargar/AlarmaDescripcionesNuevas.tsx": 3,
  "app/productos/cargar/CatalogoDescripcionesAdmin.tsx": 2,
  "app/productos/cargar/CurvasView.tsx": 3,
  "app/productos/cargar/DepuradorClient.tsx": 12,
  "app/productos/cargar/DepuradorDispatcher.tsx": 1,
  "app/productos/cargar/FacturasTiendaClient.tsx": 9,
  "app/productos/cargar/FormulasConfig.tsx": 2,
  "app/productos/cargar/HistorialView.tsx": 1,
  "app/productos/cargar/MiExcelFotosClient.tsx": 3,
  "app/productos/cargar/ReebokClient.tsx": 14,
  "app/productos/cargar/ReglasView.tsx": 2,
  "app/proveedores/ProveedoresListClient.tsx": 1,
  "app/reclamos/components/EmpresaList.tsx": 1,
  "app/reclamos/components/EmpresaSelector.tsx": 3,
  "app/reclamos/components/ReclamoDetail.tsx": 1,
  "app/reclamos/components/ReclamoForm.tsx": 1,
  "app/reclamos/components/SettlementModal.tsx": 1,
  "app/recordatorios/components/CalendarioMes.tsx": 1,
  "app/recordatorios/components/LineaNueva.tsx": 1,
  "app/recordatorios/components/RecordatorioFormModal.tsx": 2,
  "components/Sidebar.tsx": 1,
  "components/SugerenciasCliente.tsx": 1,
  "components/catalogo/BarraModoPedido.tsx": 1,
  "components/catalogo/BulkDeletePedidosModal.tsx": 1,
  "components/catalogo/CatalogoStickyCartBar.tsx": 1,
  "components/catalogo/CheckoutClient.tsx": 3,
  "components/catalogo/ConfirmacionClient.tsx": 2,
  "components/catalogo/EnviarDocumentoSwitch.tsx": 1,
  "components/catalogo/PedidoDetalleClient.tsx": 5,
  "components/catalogo/PedidoPublicoClient.tsx": 1,
  "components/marketing/BorradorFacturaCard.tsx": 2,
  "components/marketing/EntregaForm.tsx": 1,
  "components/marketing/FacturaCard.tsx": 3,
  "components/marketing/FacturaForm.tsx": 1,
  "components/marketing/PdfUploader.tsx": 1,
  "components/marketing/PreciosProveedorAyuda.tsx": 2,
  "components/multifashion/ClientesMultifashionSubtab.tsx": 2,
  "components/multifashion/MetasSubtab.tsx": 2,
  "components/multifashion/MultifashionResumenView.tsx": 1,
  "components/multifashion/ProductosSubtab.tsx": 2,
  "components/multifashion/VentaHoyCard.tsx": 1,
  "components/referencia/ReferenciaView.tsx": 4,
  "components/ui/Chip.tsx": 2,
  "components/ventas/ProductosView.tsx": 1,
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

  it("el interruptor nace apagado: la pantalla de hoy, al pie de la letra", async () => {
    const src = readFileSync("src/lib/ui/avisos-2026-10.ts", "utf8");
    expect(src).toMatch(/export const AVISOS_2026_10 = false;/);
    const { Aviso } = await import("@/components/ui/Aviso");
    render(<Aviso legado={<p>caja de antes</p>}>texto nuevo</Aviso>);
    expect(screen.getByText("caja de antes")).toBeTruthy();
    expect(screen.queryByText("texto nuevo")).toBeNull();
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
