// ─────────────────────────────────────────────────────────────────────────────
// CONDUCTA — «COMPROBANTES»: EL PANEL, SU FILTRO Y EL BOTÓN DE UN TOQUE
// (25-ago-2026)
//
// Se MONTAN las pantallas reales y se TOCAN los botones reales. Ni un barrido
// de texto sobre el .tsx: un barrido se cumple con su propio comentario, y este
// repo ya pagó ese defecto cuatro veces. Lo que se lee es el DOM.
//
// Lo que fija:
//   1. Los TRES chips —Pedidos · Cotizaciones · Borradores— existen, traen sus
//      conteos y FILTRAN de verdad, en las 4 marcas (una sola pieza; Joybees
//      espejo exacto de Reebok). 🔴 NO hay «Todos» y el panel abre en «Pedidos».
//   2. «Cotizaciones» deja SOLO las cotizaciones: es la pregunta que Daniel
//      quería contestar de un vistazo (qué se cotizó y no se vendió).
//   3. 🔴 «Borradores» es `status = 'borrador'`, NO "nunca se envió" — y las
//      filas visibles son EXACTAMENTE el número del chip, en las 4 marcas,
//      contra los conteos MEDIDOS en producción el 25-ago-2026.
//   4. Los vacíos hablan de comprobantes, no de pedidos.
//   5. 🔴 La tabla conserva sus 6 columnas: el filtro no ensanchó nada.
//   6. La confirmación lleva a la lista en UN toque, y el destino DEPENDE DEL
//      ROL — un vendedor nunca sale apuntado a `/catalogos/admin/`.
//
// 🔴 NADA sale a Switch: `fetch` está stubbeado y se cuentan las escrituras.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import PedidosTab, { type UnifiedPedido } from "@/app/catalogos/admin/[marca]/PedidosTab";
import ConfirmacionClient from "@/components/catalogo/ConfirmacionClient";
import { type MarcaUiKey } from "@/lib/catalogo/marcas-ui";

const ROUTER = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/catalogos/admin/reebok",
  useSearchParams: () => new URLSearchParams(""),
}));

const MARCAS: MarcaUiKey[] = ["reebok", "joybees", "tommy", "calvin"];
const HOY = new Date().toISOString();

const base = (over: Partial<UnifiedPedido>): UnifiedPedido => ({
  origen: "mio",
  id_natural: "11111111-1111-4111-8111-111111111111",
  cliente: "Hafez, S.A.",
  total: 2760,
  created_at: HOY,
  vendor: "Rey",
  item_count: 3,
  fuente: "orders",
  ...over,
});

// Datos con la forma de producción (medida el 25-ago-2026). Los seis casos que
// el panel puede tener, uno por variante:
const PEDIDO = base({
  id_natural: "aaaaaaaa-1111-4111-8111-111111111111",
  cliente: "Sporting Shoes",
  numero_pedido: "PED-017",
  switch_numero: "16-000000503",
  switch_documento: "pedido",
  status: "confirmado",
});
const PEDIDO_2 = base({
  id_natural: "dddddddd-4444-4444-8444-444444444444",
  cliente: "Hafez, S.A.",
  numero_pedido: "PED-021",
  switch_numero: "16-000000512",
  switch_documento: "pedido",
  status: "confirmado",
});
const COTIZACION = base({
  id_natural: "cccccccc-3333-4333-8333-333333333333",
  cliente: "A-Amani, S.A.",
  numero_pedido: "PED-020",
  switch_numero: "16-000000511",
  switch_documento: "cotizacion",
  status: "confirmado",
});
// 🔴 EL CASO QUE SEPARA LOS DOS CRITERIOS: PED-018 salió a Switch como PEDIDO y
// su `status` nunca se cerró. Es real (reebok · Hafez, S.A. · $2.520). Con el
// criterio viejo caía en «Pedidos»; ahora cae en «Borradores».
const BORRADOR_EN_SWITCH = base({
  id_natural: "eeeeeeee-5555-4555-8555-555555555555",
  cliente: "Hafez Borrador",
  numero_pedido: "PED-018",
  switch_numero: "16-000000499",
  switch_documento: "pedido",
  status: "borrador",
});
const BORRADOR = base({
  id_natural: "bbbbbbbb-2222-4222-8222-222222222222",
  cliente: "Zapatería Nueva",
  numero_pedido: "PED-019",
  switch_numero: null,
  switch_documento: null,
  status: "borrador",
});
// 🔴 EL OTRO LADO: confirmado que NUNCA salió a Switch. Con el criterio viejo
// caía en «Sin mandar»; ahora cae en «Pedidos», que es el balde de resto — sin
// eso sería una fila INVISIBLE, porque «Todos» ya no existe.
const CONFIRMADO_SIN_SALIR = base({
  id_natural: "ffffffff-6666-4666-8666-666666666666",
  cliente: "Calzados del Istmo",
  numero_pedido: "PED-030",
  switch_numero: null,
  switch_documento: null,
  status: "confirmado",
});
const DEL_LINK = base({
  origen: "link",
  fuente: "publicos",
  id_natural: "ab12cd34",
  cliente: "Nathalie",
  vendor: null,
  numero_pedido: null,
  switch_numero: null,
  switch_documento: null,
  status: null,
});

const TODAS = [PEDIDO, PEDIDO_2, COTIZACION, BORRADOR_EN_SWITCH, BORRADOR, CONFIRMADO_SIN_SALIR, DEL_LINK];

function pintarTab(pedidos: UnifiedPedido[], marca: MarcaUiKey = "reebok") {
  return render(
    <PedidosTab marca={marca} pedidos={pedidos} onRefresh={async () => {}} showToast={vi.fn()} />,
  );
}

/**
 * Los botones del filtro por tipo, leídos del DOM (no de una constante).
 *
 * 🩸 SE EXIGE QUE ESTÉN VISIBLES, no solo que existan. La primera versión de
 * este helper solo los buscaba en el DOM y la mutación «la pantalla no dibuja
 * el filtro» SOBREVIVIÓ: esconder el bloque con `hidden`/`sr-only` deja los
 * botones en el árbol y el candado se ponía verde con un filtro invisible.
 * jsdom no aplica Tailwind, así que la visibilidad se comprueba en las dos
 * capas que sí se pueden leer: el árbol de accesibilidad (`getAllByRole`, que
 * descarta `hidden` y `aria-hidden`) y las clases que esconden.
 */
function botonesTipo(c: HTMLElement): HTMLButtonElement[] {
  const caja = c.querySelector('[data-medir="filtro-tipo-comprobante"]') as HTMLElement | null;
  expect(caja, "el filtro por tipo no está en la pantalla").toBeTruthy();
  const clases = caja!.className.split(/\s+/);
  for (const escondida of ["hidden", "sr-only", "invisible"]) {
    expect(clases, `el filtro por tipo está escondido con .${escondida}`).not.toContain(escondida);
  }
  expect(caja!.getAttribute("hidden"), "el filtro por tipo está hidden").toBeNull();
  expect(caja!.getAttribute("aria-hidden")).not.toBe("true");
  const visibles = within(caja!).getAllByRole("button");
  expect(visibles.length, "el filtro por tipo no tiene botones alcanzables").toBeGreaterThan(0);
  return visibles as HTMLButtonElement[];
}

const tocarTipo = (c: HTMLElement, label: string) => {
  const btn = botonesTipo(c).find((b) => (b.textContent || "").startsWith(label));
  expect(btn, `no hay filtro «${label}»`).toBeTruthy();
  fireEvent.click(btn!);
};

const clientesVisibles = (c: HTMLElement) =>
  [...c.querySelectorAll("tbody tr")].map((tr) => (tr.textContent || "").split("PED-")[0].trim());

const escrituras: string[] = [];
beforeEach(() => {
  ROUTER.push.mockClear();
  escrituras.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method || "GET").toUpperCase() !== "GET") escrituras.push(url);
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

// ── 1. El filtro por tipo, en las 4 marcas ───────────────────────────────────

/** Cuántas filas se ven ahora mismo. Es lo que el chip promete. */
const filasVisibles = (c: HTMLElement) => [...c.querySelectorAll("tbody tr")];

/** El número que pinta el chip `label`, leído del DOM. */
function conteoDelChip(c: HTMLElement, label: string): number {
  const btn = botonesTipo(c).find((b) => (b.textContent || "").startsWith(label));
  expect(btn, `no hay chip «${label}»`).toBeTruthy();
  const n = (btn!.textContent || "").replace(/\s+/g, "").slice(label.length);
  return Number(n);
}

describe("🔴 TRES chips, sin «Todos» — las 4 marcas", () => {
  for (const marca of MARCAS) {
    it(`${marca}: son exactamente Pedidos · Cotizaciones · Borradores`, () => {
      const { container } = pintarTab(TODAS, marca);
      const textos = botonesTipo(container).map((b) => (b.textContent || "").replace(/\s+/g, " ").trim());
      expect(textos).toEqual(["Pedidos4", "Cotizaciones1", "Borradores2"]);
      // 🔴 «Todos» se fue, y «Sin mandar» tampoco vuelve por la ventana.
      expect(textos.join(" ")).not.toContain("Todos");
      expect(textos.join(" ")).not.toContain("Sin mandar");
    });

    it(`${marca}: 🔴 abre en «Pedidos» — sin tocar nada`, () => {
      const { container } = pintarTab(TODAS, marca);
      const activo = botonesTipo(container).find((b) => b.getAttribute("aria-pressed") === "true");
      expect(activo, "ningún chip arranca activo").toBeTruthy();
      expect((activo!.textContent || "").startsWith("Pedidos")).toBe(true);
      // Y lo que se ve de entrada son los 4 pedidos, no las 7 filas.
      expect(filasVisibles(container)).toHaveLength(4);
    });

    it(`${marca}: 🩸 TOCANDO cada chip, las filas visibles son EXACTAMENTE su número`, () => {
      const { container } = pintarTab(TODAS, marca);
      for (const label of ["Pedidos", "Cotizaciones", "Borradores"]) {
        const dice = conteoDelChip(container, label);
        tocarTipo(container, label);
        expect(filasVisibles(container), `el chip «${label}» dice ${dice}`).toHaveLength(dice);
      }
    });

    it(`${marca}: 🔴 los tres chips PARTICIONAN — nada se pierde ni se cuenta dos veces`, () => {
      // Es lo que permite que «Todos» se haya ido: si algún criterio dejara una
      // fila afuera, esa fila sería INVISIBLE en el panel.
      const { container } = pintarTab(TODAS, marca);
      const vistas: string[] = [];
      let suma = 0;
      for (const label of ["Pedidos", "Cotizaciones", "Borradores"]) {
        suma += conteoDelChip(container, label);
        tocarTipo(container, label);
        vistas.push(...clientesVisibles(container));
      }
      expect(suma).toBe(TODAS.length);
      expect(new Set(vistas).size).toBe(TODAS.length);
      for (const p of TODAS) expect(vistas.join(" "), `${p.cliente} no se ve en ningún chip`).toContain(p.cliente);
    });

    it(`${marca}: «Cotizaciones» deja SOLO la cotización`, () => {
      const { container } = pintarTab(TODAS, marca);
      tocarTipo(container, "Cotizaciones");
      const filas = filasVisibles(container);
      expect(filas).toHaveLength(1);
      expect(filas[0].textContent).toContain("A-Amani");
      expect(filas[0].textContent).toContain("Cotización en Switch: 16-000000511");
      expect(clientesVisibles(container).join(" ")).not.toContain("Sporting Shoes");
    });

    it(`${marca}: 🔴 «Borradores» es el STATUS — trae al que SÍ salió a Switch`, () => {
      const { container } = pintarTab(TODAS, marca);
      tocarTipo(container, "Borradores");
      const filas = filasVisibles(container);
      expect(filas).toHaveLength(2);
      const texto = filas.map((t) => t.textContent).join(" ");
      // PED-018 está EN Switch y aun así es borrador: el criterio viejo («nunca
      // se envió») lo habría dejado afuera.
      expect(texto).toContain("PED-018");
      expect(texto).toContain("Pedido en Switch: 16-000000499");
      expect(texto).toContain("PED-019");
      // Y el confirmado que nunca salió NO es borrador.
      expect(texto).not.toContain("Calzados del Istmo");
      expect(texto).not.toContain("Nathalie");
    });

    it(`${marca}: 🔴 «Pedidos» es el balde de RESTO (el del link no se pierde)`, () => {
      const { container } = pintarTab(TODAS, marca);
      tocarTipo(container, "Pedidos");
      const texto = filasVisibles(container).map((t) => t.textContent).join(" ");
      expect(filasVisibles(container)).toHaveLength(4);
      expect(texto).toContain("Nathalie");             // del link sin convertir
      expect(texto).toContain("Calzados del Istmo");   // confirmado sin salir
      expect(texto).toContain("Sporting Shoes");
      // Y el borrador que está en Switch NO se cuela entre los pedidos.
      expect(texto).not.toContain("PED-018");
      expect(texto).not.toContain("A-Amani");
      // 🩸 La FILA sigue diciendo la verdad aunque el chip la agrupe.
      expect(texto).toContain("No se ha mandado a Switch");
    });
  }

  it("🔴 los conteos MEDIDOS en producción (25-ago-2026), marca por marca", () => {
    // reebok 2 · tommy 3 · joybees 0 · calvin 1 borradores vivos. Los seis, uno
    // por uno, tal como salieron de la base. 🩸 Son 6 sobre las filas VIVAS: la
    // tabla tiene además 67 pedidos borrados que la vista no devuelve, y contar
    // contra `orders` daría 110 en vez de 43.
    const PROD: Record<MarcaUiKey, { numero: string; cliente: string; enSwitch: boolean }[]> = {
      reebok: [
        { numero: "PED-018", cliente: "Hafez, S.A.", enSwitch: true },
        { numero: "PED-019", cliente: "Contado", enSwitch: false },
      ],
      tommy: [
        { numero: "TOM-005", cliente: "Contado", enSwitch: false },
        { numero: "TOM-006", cliente: "Contado", enSwitch: false },
        { numero: "TOM-023", cliente: "Wolf Mall Center Int", enSwitch: false },
      ],
      joybees: [],
      calvin: [{ numero: "CKP-007", cliente: "ACTIVE SHOES, S.A.", enSwitch: false }],
    };
    for (const marca of MARCAS) {
      const borradores = PROD[marca].map((b, i) =>
        base({
          id_natural: `prod-${marca}-${i}`,
          cliente: b.cliente,
          numero_pedido: b.numero,
          switch_numero: b.enSwitch ? "16-000000499" : null,
          switch_documento: b.enSwitch ? "pedido" : null,
          status: "borrador",
        }),
      );
      // Más un puñado de filas vivas que NO son borrador (pedidos y del link).
      const filas = [...borradores, PEDIDO, DEL_LINK, CONFIRMADO_SIN_SALIR];
      const { container } = pintarTab(filas, marca);
      expect(conteoDelChip(container, "Borradores"), `${marca}`).toBe(PROD[marca].length);
      tocarTipo(container, "Borradores");
      expect(filasVisibles(container)).toHaveLength(PROD[marca].length);
      for (const b of PROD[marca]) {
        expect(container.textContent, `${marca} ${b.numero}`).toContain(b.numero);
      }
      cleanup();
    }
  });

  it("🔴 Joybees es espejo EXACTO de Reebok: mismos rótulos y mismos conteos", () => {
    const r = pintarTab(TODAS, "reebok");
    const rt = botonesTipo(r.container).map((b) => b.textContent);
    cleanup();
    const j = pintarTab(TODAS, "joybees");
    expect(botonesTipo(j.container).map((b) => b.textContent)).toEqual(rt);
  });

  it("se puede volver de «Cotizaciones» a «Pedidos» (el filtro no se traba)", () => {
    const { container } = pintarTab(TODAS);
    tocarTipo(container, "Cotizaciones");
    expect(filasVisibles(container)).toHaveLength(1);
    tocarTipo(container, "Pedidos");
    expect(filasVisibles(container)).toHaveLength(4);
  });

  it("el filtro por TIPO y el de ORIGEN se cruzan (no se pisan)", () => {
    const { container } = pintarTab(TODAS);
    fireEvent.click(screen.getByText(/^Del link \(/));
    tocarTipo(container, "Pedidos");
    const filas = filasVisibles(container);
    expect(filas).toHaveLength(1);
    expect(filas[0].textContent).toContain("Nathalie");
    // 🔴 El filtro de ORIGEN conserva su «Todos»: ése NO se tocó.
    expect(screen.getByText(/^Todos \(/)).toBeTruthy();
    fireEvent.click(screen.getByText(/^Todos \(/));
    expect(filasVisibles(container)).toHaveLength(4);
  });
});

// ── 2. Los vacíos, y que la tabla no se ensanchó ─────────────────────────────

describe("los vacíos hablan de COMPROBANTES", () => {
  it("sin nada adentro: «No hay comprobantes aún»", () => {
    pintarTab([]);
    expect(screen.getByText("No hay comprobantes aún")).toBeTruthy();
  });

  it("con un filtro que no trae nada: «Ningún comprobante coincide»", () => {
    const { container } = pintarTab([PEDIDO]);
    tocarTipo(container, "Cotizaciones");
    expect(screen.getByText("Ningún comprobante coincide")).toBeTruthy();
  });

  it("🔴 la tabla conserva sus 6 columnas (el filtro creció hacia ABAJO)", () => {
    const { container } = pintarTab(TODAS);
    const tablas = [...container.querySelectorAll("table")];
    expect(tablas.length).toBeGreaterThan(0);
    for (const t of tablas) {
      expect(within(t as HTMLElement).getAllByRole("columnheader")).toHaveLength(6);
    }
  });

  it("🔴 mirar y filtrar NO escribe nada", () => {
    const { container } = pintarTab(TODAS);
    for (const b of botonesTipo(container)) fireEvent.click(b);
    expect(escrituras).toEqual([]);
  });
});

// ── 3. De la confirmación a la lista, en UN toque ────────────────────────────

const OID = "33333333-3333-4333-8333-333333333333";

function stubConfirmacion(envio: Record<string, unknown> | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method || "GET").toUpperCase() !== "GET") escrituras.push(url);
      const j = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
      if (url.includes("/enviar-switch")) return j({ envio });
      return j({ id: OID, order_number: "PED-017", client_name: "Sporting Shoes", total: 2760 });
    }) as unknown as typeof fetch,
  );
}

const EN_SWITCH = { estado: "verificado", numero_interno: "16-000000503", pedido_switch_id: 7, error_detalle: null, documento: "pedido" };

describe("🔴 la confirmación llega a la lista en UN toque, y cada rol a la suya", () => {
  for (const marca of MARCAS) {
    it(`${marca}: admin → «Ver comprobantes» al panel, con ?tab=pedidos`, async () => {
      sessionStorage.setItem("cxc_role", "admin");
      stubConfirmacion(EN_SWITCH);
      render(<ConfirmacionClient marca={marca} orderId={OID} />);
      const link = (await screen.findByRole("link", { name: "Ver comprobantes" })) as HTMLAnchorElement;
      expect(link).toBeTruthy();
      expect(link.getAttribute("href")).toBe(`/catalogos/admin/${marca}?tab=pedidos`);
    });

    it(`${marca}: VENDEDOR → «Ver pedidos», NUNCA a /catalogos/admin/`, async () => {
      sessionStorage.setItem("cxc_role", "vendedor");
      stubConfirmacion(EN_SWITCH);
      render(<ConfirmacionClient marca={marca} orderId={OID} />);
      const link = (await screen.findByRole("link", { name: "Ver pedidos" })) as HTMLAnchorElement;
      expect(link.getAttribute("href")).toBe(`/catalogo/${marca}/pedidos`);
      expect(screen.queryByRole("link", { name: "Ver comprobantes" })).toBeNull();
      // El 403 que este candado existe para impedir.
      for (const a of document.querySelectorAll("a")) {
        expect(a.getAttribute("href") || "").not.toContain("/catalogos/admin/");
      }
    });
  }

  it("secretaria va al panel igual que admin (CATALOGO_ADMIN_ROLES)", async () => {
    sessionStorage.setItem("cxc_role", "secretaria");
    stubConfirmacion(EN_SWITCH);
    render(<ConfirmacionClient marca="reebok" orderId={OID} />);
    const link = (await screen.findByRole("link", { name: "Ver comprobantes" })) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/catalogos/admin/reebok?tab=pedidos");
  });

  it("🩸 sin rol en la sesión NO se apunta al admin (iría a un 403)", async () => {
    stubConfirmacion(EN_SWITCH);
    render(<ConfirmacionClient marca="reebok" orderId={OID} />);
    const link = (await screen.findByRole("link", { name: "Ver pedidos" })) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/catalogo/reebok/pedidos");
  });

  it("el botón está TAMBIÉN cuando el pedido todavía no salió (es un borrador de la lista)", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    stubConfirmacion(null);
    render(<ConfirmacionClient marca="tommy" orderId={OID} />);
    expect(await screen.findByRole("link", { name: "Ver comprobantes" })).toBeTruthy();
    // Y las dos salidas siguen ofrecidas: el botón nuevo no las tapó.
    expect(screen.getByRole("button", { name: /Pedido/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cotización/ })).toBeTruthy();
  });

  it("🔴 abrir la confirmación y ver el botón NO manda nada a Switch", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    stubConfirmacion(EN_SWITCH);
    render(<ConfirmacionClient marca="calvin" orderId={OID} />);
    await screen.findByRole("link", { name: "Ver comprobantes" });
    expect(escrituras).toEqual([]);
  });

  it("«Volver al catálogo» y «Ver PDF» siguen estando (no se reemplazó nada)", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    stubConfirmacion(EN_SWITCH);
    render(<ConfirmacionClient marca="reebok" orderId={OID} />);
    expect(await screen.findByText("Ver PDF")).toBeTruthy();
    expect(screen.getByText("Volver al catálogo")).toBeTruthy();
  });
});
