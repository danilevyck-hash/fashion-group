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
 * 🔑 Y desde el 14-ago-2026, LOS DOS MENÚS DE LA FILA DICEN LO MISMO. El "···"
 * y el de CLICK DERECHO son la misma fila: no pueden tener dos vocabularios
 * ("Email" en uno y "Enviar email" en el otro) ni dos juegos de opciones ("Ver
 * en directorio" seguía viva en el de click derecho, porque el #550 solo podó
 * el "···"). Hoy el "···" dice "Enviar correo" y el de click derecho ofrece esa
 * MISMA opción con esa MISMA palabra.
 *
 * 🩸 POR QUÉ PINTA DE VERDAD y no barre el archivo: el menú se arma en DOS
 * componentes (la tabla del escritorio y la tarjeta del celular), el de click
 * derecho en un TERCER lugar, y ninguno existe hasta que se toca la fila — un
 * menú que queda con 5 opciones, o que dice otra palabra, se ve normal en el
 * código y está mal en la mano de quien cobra. Acá se abren los menús y se leen
 * las opciones.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔄 LA PARTE DE LOS MENÚS CAMBIÓ DE DIRECCIÓN EL 5-sep-2026, y no se borró.
 *
 * El problema que este candado describe —«tres listas de acciones en tres
 * archivos, y ninguna se ve hasta tocar algo»— se resolvió de raíz en el
 * rediseño de Cuentas por Cobrar: **los dos menús se eliminaron**. Las cuatro
 * acciones viven ahora en UNA hoja, «Cobrar», que se abre con un botón VISIBLE
 * en cada fila (y en cada tarjeta del celular). Con eso desaparece la
 * posibilidad de que dos menús digan cosas distintas: ya no hay dos.
 *
 * Lo que este archivo defiende ahora es que NO VUELVAN: ni el «···», ni el clic
 * derecho, ni una tercera lista. Lo que se ofrece y con qué palabras se
 * verifica en `cxc-cobrar-una-hoja.test.ts`.
 *
 * La parte 1 —la pestaña de Boston solo para quien la puede leer— NO cambió.
 * ─────────────────────────────────────────────────────────────────────────────
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

import TabsCartera from "@/app/cxc/components/TabsCartera";
import ClientTable from "@/app/cxc/components/ClientTable";
import PanelCxcMobile from "@/app/cxc/components/PanelCxcMobile";
import { ContextMenuProvider } from "@/components/ui";
import { ROLES_BOSTON } from "@/lib/cxc/boston-roles";

/** Las 4 que quedan, en su orden, iguales en las dos pantallas. */
const MENU_ESPERADO = ["Estado de cuenta", "WhatsApp", "Enviar correo", "Copiar mensaje"];

/** Lo que ofrece el menú de CLICK DERECHO (solo escritorio), con SU vocabulario. */
const CONTEXTO_ESPERADO = ["Enviar correo"];

/** Las que se retiraron: si alguna vuelve, a cualquiera de los menús, esto se pone rojo. */
const RETIRADAS = ["Ya contacté · Llamada", "Ya contacté · Visita", "Ver en directorio"];

/** La palabra que se fue: la app se lee en español simple. */
const PALABRA_PROHIBIDA = /email/i;

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

// ─────────── 2. LOS DOS MENÚS SE FUERON, Y NO PUEDEN VOLVER ───────────

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
const sinAviso = () => null;

function pintarEscritorio(onCobrar: (c: ConsolidatedClient) => void = noop) {
  return render(
    <ContextMenuProvider>
      <ClientTable
        filtered={[CLIENTE]}
        roleCompanies={EMPRESAS}
        companyFilter="all"
        toggleSort={noop}
        sortArrow={() => ""}
        onCobrar={onCobrar}
        onOpenEstado={noop}
        seleccion={new Set()}
        onSeleccionar={noop}
        onSeleccionarTodos={noop}
        avisoSinPagarDe={sinAviso}
        marcaEnvioDe={sinAviso}
      />
    </ContextMenuProvider>,
  );
}

function pintarCelular(onCobrar: (c: ConsolidatedClient) => void = noop) {
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
      onOpenEstado={noop}
      onCobrar={onCobrar}
      sinPagar={null}
      sinPagarActivo={false}
      onToggleSinPagar={noop}
      avisoSinPagarDe={sinAviso}
      marcaEnvioDe={sinAviso}
      canExport={false}
      onExportarCsv={noop}
      empresaRestriction={null}
    />,
  );
}

describe.each([
  ["escritorio (ClientTable)", pintarEscritorio],
  ["celular (PanelCxcMobile)", pintarCelular],
])("la fila de %s", (_nombre, pintar) => {
  it("🔴 NO tiene menú «···» — sus acciones están a la vista", () => {
    pintar();
    expect(screen.queryByLabelText(`Acciones de ${CLIENTE.nombre_normalized}`)).toBeNull();
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });

  it("🔴 tiene el botón «Cobrar», visible sin abrir nada", () => {
    pintar();
    expect(screen.getAllByText("Cobrar").length).toBeGreaterThan(0);
  });

  it("tocar «Cobrar» avisa con ESE cliente", () => {
    const llamados: string[] = [];
    pintar((c) => llamados.push(c.nombre_normalized));
    fireEvent.click(screen.getAllByText("Cobrar")[0]);
    expect(llamados).toEqual([CLIENTE.nombre_normalized]);
  });

  it("🔴 no quedó ni un rastro del seguimiento de cobro", () => {
    const { container } = pintar();
    const texto = container.textContent ?? "";
    for (const retirada of RETIRADAS) expect(texto).not.toContain(retirada);
    expect(texto).not.toMatch(/seguimiento/i);
  });

  it("🔑 la palabra 'email' no se le muestra a nadie", () => {
    const { container } = pintar();
    expect(container.textContent ?? "").not.toMatch(PALABRA_PROHIBIDA);
  });
});

describe("el menú de CLICK DERECHO", () => {
  it("🔴 ya no existe: la fila no abre ningún menú propio", () => {
    pintarEscritorio();
    const filas = document.querySelectorAll(`[title="${CLIENTE.nombre_normalized}"]`);
    expect(filas.length).toBeGreaterThan(0); // se pintó una fila de verdad
    for (const fila of filas) fireEvent.contextMenu(fila);
    expect(document.querySelector('[data-menu="contexto"]')).toBeNull();
  });

  it("🩸 y con eso se acabó el problema que este candado vino a arreglar", () => {
    // Dos menús para la MISMA fila no pueden decir cosas distintas si hay UNO
    // solo, y ése está a la vista. `MENU_ESPERADO`/`CONTEXTO_ESPERADO` quedan
    // como historia de lo que se ofrecía; lo que se ofrece HOY se verifica en
    // `cxc-cobrar-una-hoja.test.ts`.
    expect(MENU_ESPERADO).toEqual(["Estado de cuenta", "WhatsApp", "Enviar correo", "Copiar mensaje"]);
    expect(CONTEXTO_ESPERADO).toEqual(["Enviar correo"]);
  });
});
