/**
 * CANDADO DE PANTALLA — lo que se VE en el CXC.
 *
 * Dos cosas, las dos medidas contra producción el 14-ago-2026 y aprobadas por
 * Daniel:
 *
 *  1. La pestaña "Confecciones Boston" NO se le dibuja a quien no la puede leer.
 *     Los 3 vendedores activos la veían y **siempre** recibían el error del 403.
 *
 *  2. El menú "···" tiene EXACTAMENTE 4 opciones. Eran 7 (6 en celular): las dos
 *     "Ya contacté" escribían en `cxc_contact_log` sin que nadie pintara el
 *     resultado —141 filas, ninguna en los últimos 90 días— y "Ver en
 *     directorio" tampoco servía. Daniel, textual: *"sobre darle seguimiento no
 *     es algo que quiero para ese módulo, llamo al cliente por fuera y ya"*.
 *
 * 🩸 POR QUÉ PINTA DE VERDAD y no barre el archivo: el menú se arma en DOS
 * componentes (la tabla del escritorio y la tarjeta del celular) y solo existe
 * DESPUÉS de tocar el "···" — un menú que queda con 5 opciones en una de las dos
 * pantallas se ve normal en el código y está mal en la mano de quien cobra. Acá
 * se abre el menú y se leen las opciones.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";
import type { ConsolidatedClient } from "@/lib/types";
import type { Company } from "@/lib/companies";

// El banner de frescura y el botón de sync salen a la red: no son lo que se
// prueba acá y en jsdom solo agregan ruido.
vi.mock("@/components/shared/SyncStatus", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));

import TabsCartera from "@/app/admin/components/TabsCartera";
import ClientTable from "@/app/admin/components/ClientTable";
import PanelCxcMobile from "@/app/admin/components/PanelCxcMobile";
import { ContextMenuProvider } from "@/components/ui";
import { ROLES_BOSTON } from "@/lib/cxc/boston-roles";

/** Las 4 que quedan, en su orden, iguales en las dos pantallas. */
const MENU_ESPERADO = ["Estado de cuenta", "WhatsApp", "Enviar email", "Copiar mensaje"];

/** Las que se retiraron: si alguna vuelve, esto se pone rojo. */
const RETIRADAS = ["Ya contacté · Llamada", "Ya contacté · Visita", "Ver en directorio"];

const SIN_BOSTON = ["vendedor", "bodega", "contabilidad", "gerente_acs"] as const;

// ─────────────────────────── 1. LAS PESTAÑAS ───────────────────────────

describe("TabsCartera — la pestaña de Boston solo para quien la puede leer", () => {
  const pintar = (role: string) =>
    render(<TabsCartera role={role} tab="grupo" onTab={() => {}} />);

  it("admin y secretaria ven las DOS pestañas", () => {
    for (const rol of ROLES_BOSTON) {
      const { unmount } = pintar(rol);
      expect(screen.getByRole("button", { name: "Grupo · 6 empresas" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Confecciones Boston" })).toBeTruthy();
      unmount();
    }
  });

  it("🔴 el vendedor NO ve la pestaña de Boston — ni el texto en ningún lado", () => {
    for (const rol of SIN_BOSTON) {
      const { container, unmount } = pintar(rol);
      const botones = within(container).getAllByRole("button").map((b) => b.textContent);
      expect(botones, rol).toEqual(["Grupo · 6 empresas"]);
      // Ni escondida, ni gris, ni deshabilitada: no está.
      expect(container.textContent, rol).not.toContain("Boston");
      unmount();
    }
  });

  it("la pestaña del grupo sigue ahí para todos (no se le quitó nada a nadie)", () => {
    for (const rol of [...ROLES_BOSTON, ...SIN_BOSTON]) {
      const { unmount } = pintar(rol);
      expect(screen.getByRole("button", { name: "Grupo · 6 empresas" })).toBeTruthy();
      unmount();
    }
  });

  it("la coletilla de Boston solo aparece con la pestaña de Boston activa", () => {
    const { container } = render(<TabsCartera role="admin" tab="boston" onTab={() => {}} />);
    expect(container.textContent).toContain("se lleva aparte");
  });
});

// ─────────────────────────── 2. EL MENÚ "···" ───────────────────────────

const EMPRESAS: Company[] = [{ key: "fashion_wear", name: "Fashion Wear" }] as Company[];
const vacio = { d0_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, d121_180: 0, d181_270: 0, d271_365: 0, mas_365: 0 };

const CLIENTE: ConsolidatedClient = {
  nombre_normalized: "CITY MALL PASO CANOA",
  companies: {
    fashion_wear: {
      nombre: "City Mall Paso Canoa", codigo: "D-25", ...vacio,
      d0_30: 1000, total: 1000,
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

/** Abre el "···" de la fila y devuelve las etiquetas de sus opciones. */
function opcionesDelMenu(): string[] {
  fireEvent.click(screen.getByLabelText(`Acciones de ${CLIENTE.nombre_normalized}`));
  return screen.getAllByRole("menuitem").map((b) => b.textContent!);
}

function pintarEscritorio() {
  return render(
    <ContextMenuProvider>
      <ClientTable
        filtered={[CLIENTE]}
        roleCompanies={EMPRESAS}
        roleClients={[CLIENTE]}
        companyFilter="all"
        setCompanyFilter={noop}
        riskFilter="all"
        setRiskFilter={noop}
        search=""
        setSearch={noop}
        sortKey="total"
        sortDir="desc"
        toggleSort={noop}
        sortArrow={() => ""}
        userRole="admin"
        onOpenEmail={noop}
        onSaveEdit={noop}
        onWhatsApp={noop}
        onCopyMessage={noop}
        onOpenEstado={noop}
      />
    </ContextMenuProvider>,
  );
}

function pintarCelular() {
  return render(
    <PanelCxcMobile
      filtered={[CLIENTE]}
      roleClients={[CLIENTE]}
      cxcCompanies={EMPRESAS}
      search=""
      setSearch={noop}
      riskFilter="all"
      setRiskFilter={noop}
      companyFilter="all"
      setCompanyFilter={noop}
      favorites={new Set()}
      onToggleFavorite={noop}
      onOpenEmail={noop}
      onWhatsApp={noop}
      onCopyMessage={noop}
      onOpenEstado={noop}
      canExport={false}
      onExportarCsv={noop}
      empresaRestriction={null}
    />,
  );
}

describe.each([
  ["escritorio (ClientTable)", pintarEscritorio],
  ["celular (PanelCxcMobile)", pintarCelular],
])("el menú ··· de %s", (_nombre, pintar) => {
  it("🔴 tiene EXACTAMENTE 4 opciones, y son éstas", () => {
    pintar();
    expect(opcionesDelMenu()).toEqual(MENU_ESPERADO);
  });

  it("🔴 no quedó ni un rastro del seguimiento de cobro", () => {
    pintar();
    const items = opcionesDelMenu();
    for (const retirada of RETIRADAS) expect(items).not.toContain(retirada);
    expect(items.some((i) => /contact|seguimiento|directorio/i.test(i))).toBe(false);
  });
});

describe("las dos pantallas ofrecen lo MISMO", () => {
  it("mismo menú, mismo orden, en escritorio y en celular", () => {
    const escritorioRender = pintarEscritorio();
    const escritorio = opcionesDelMenu();
    expect(escritorio).toHaveLength(4); // se leyó algo real, no una lista vacía
    escritorioRender.unmount();

    pintarCelular();
    expect(opcionesDelMenu()).toEqual(escritorio);
  });
});

// ─────────────────────────── 3. LO QUE NO SE TOCÓ ───────────────────────────

describe("las acciones que quedan siguen funcionando", () => {
  it("cada opción llama a SU handler", () => {
    const llamados: string[] = [];
    render(
      <ContextMenuProvider>
        <ClientTable
          filtered={[CLIENTE]}
          roleCompanies={EMPRESAS}
          roleClients={[CLIENTE]}
          companyFilter="all"
          setCompanyFilter={noop}
          riskFilter="all"
          setRiskFilter={noop}
          search=""
          setSearch={noop}
          sortKey="total"
          sortDir="desc"
          toggleSort={noop}
          sortArrow={() => ""}
          userRole="admin"
          onOpenEmail={() => llamados.push("email")}
          onSaveEdit={noop}
          onWhatsApp={() => llamados.push("whatsapp")}
          onCopyMessage={() => llamados.push("copiar")}
          onOpenEstado={() => llamados.push("estado")}
        />
      </ContextMenuProvider>,
    );

    for (const label of MENU_ESPERADO) {
      fireEvent.click(screen.getByLabelText(`Acciones de ${CLIENTE.nombre_normalized}`));
      fireEvent.click(screen.getByRole("menuitem", { name: label }));
    }
    expect(llamados).toEqual(["estado", "whatsapp", "email", "copiar"]);
  });
});
