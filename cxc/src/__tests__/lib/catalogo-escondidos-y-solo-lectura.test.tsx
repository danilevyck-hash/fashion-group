// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGOS — LOS DEFECTOS DEL 11-sep-2026, aprobados por Daniel
//
// 1. El chip «Escondidos» NUNCA aparecía (las 4 marcas): la pantalla tiraba
//    `active === false` antes de contar, y esconder pone `active = false`. Los
//    25 escondidos (Tommy 16 · Calvin 6 · Joybees 2 · Reebok 1) solo volvían
//    tocando la base. Daniel: *«que yo pueda activar o desactivar»*.
//    🔴 NINGÚN estado cambia: se VEN y se pueden devolver, nada más.
// 2. Bodega y David (`gerente_boston`) llenaban el carrito y topaban con 403:
//    ven el catálogo (`CATALOGO_ROLES`) pero no arman pedidos. Ahora las fichas
//    les salen en SOLO LECTURA, y la regla vive en UN lugar (`PEDIDO_ROLES`).
// 3. El aviso negro se quedaba pegado (sin `onDismiss`) en las dos pantallas
//    internas; el público ya lo hacía bien.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import {
  CHIP_ESCONDIDOS, CHIP_SIN_FOTO, CHIP_TODOS, chipsDelCatalogo, pasaElChip, seAdministra,
} from "@/lib/catalogos/admin-chips";
import {
  CATALOGO_ROLES, COMPROBANTES_EDITAR_ROLES, COMPROBANTES_ROLES, PEDIDO_ROLES,
  puedeArmarPedido, puedeVerComprobantes, ROL_LEGACY_CLIENTE,
} from "@/lib/catalogo/roles";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { SYSTEM_ROLE_KEYS } from "@/lib/modules";
import CatalogoProductCard from "@/components/catalogo/CatalogoProductCard";
import CatalogoGroupedCard from "@/components/catalogo/CatalogoGroupedCard";
import { groupByModel, type JoybeesProduct } from "@/components/catalogo/groupByModel";
import type { CatalogoProducto } from "@/components/catalogo/types";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

afterEach(cleanup);

// ═════════════════════════════════════════════════════════════════════════════
// 1 · EL CHIP «ESCONDIDOS» APARECE, Y DESDE AHÍ SE PUEDE «MOSTRAR»
// ═════════════════════════════════════════════════════════════════════════════

describe("1 · lo escondido a mano entra a la pantalla de administrar", () => {
  const vivo = { active: true, oculto_manual: false, image_url: "x", category: "footwear" };
  const apagadoPorSwitch = { active: false, oculto_manual: false, image_url: "x", category: "footwear" };
  const escondido = { active: false, oculto_manual: true, image_url: null, category: "footwear" };
  const catDe = (p: { category?: string }) => p.category;

  it("`seAdministra`: vivo sí, escondido a mano sí, apagado por Switch no", () => {
    expect(seAdministra(vivo)).toBe(true);
    expect(seAdministra(escondido)).toBe(true);
    expect(seAdministra(apagadoPorSwitch)).toBe(false);
    // Sin `active` (Reebok con scope=admin no lo manda apagado) también entra.
    expect(seAdministra({ oculto_manual: false })).toBe(true);
  });

  it("🔴 con un escondido en la lista, el chip «Escondidos (1)» se dibuja", () => {
    const lista = [vivo, apagadoPorSwitch, escondido].filter(seAdministra);
    const chips = chipsDelCatalogo(lista, [{ value: "footwear", label: "Calzado" }], catDe);
    expect(chips.map((c) => `${c.label} ${c.count}`)).toEqual([
      "Todos 1", "Calzado 1", "Sin foto 0", "Escondidos 1",
    ]);
  });

  it("🩸 el filtro viejo (`active !== false`) es exactamente el que escondía el chip", () => {
    const viejo = [vivo, apagadoPorSwitch, escondido].filter((p) => p.active !== false);
    const chips = chipsDelCatalogo(viejo, [], catDe);
    expect(chips.find((c) => c.key === CHIP_ESCONDIDOS)).toBeUndefined();
  });

  it("esconder sigue siendo esconder: un escondido solo pasa por SU chip", () => {
    expect(pasaElChip(escondido, CHIP_ESCONDIDOS, catDe)).toBe(true);
    expect(pasaElChip(escondido, CHIP_TODOS, catDe)).toBe(false);
    expect(pasaElChip(escondido, CHIP_SIN_FOTO, catDe)).toBe(false);
  });

  it("la pantalla filtra con `seAdministra`, no con su propia regla", () => {
    const src = sinComentarios(leer("src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx"));
    expect(src).toContain("products.filter(seAdministra)");
    expect(src).not.toMatch(/filter\(\(p\) => p\.active !== false\)/);
  });

  it("la fila ofrece «Mostrar» al escondido y manda el toggle sin tocar `active`", () => {
    const fila = leer("src/app/catalogos/admin/[marca]/ProductoFila.tsx");
    expect(fila).toContain('{escondido ? "Mostrar" : "Esconder"}');
    expect(fila).toContain("toggleProductOculto(marca, { id: product.id, sku: product.sku || \"\" }, !escondido)");
  });

  it("CONTROL: el PATCH que devuelve un producto recalcula `active` con la regla única", () => {
    const ruta = sinComentarios(leer("src/app/api/catalogo/[marca]/products/route.ts"));
    expect(ruta).toContain("const active = esVisibleEnCatalogo({");
    expect(ruta).toContain(".update({ oculto_manual: oculto, active })");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · VER ≠ PEDIR — una lista, y el catálogo la lee
// ═════════════════════════════════════════════════════════════════════════════

describe("2 · quién arma pedidos: PEDIDO_ROLES, en un solo lugar", () => {
  it("la lista congelada: admin, secretaria y vendedor", () => {
    expect([...PEDIDO_ROLES]).toEqual(["admin", "secretaria", "vendedor"]);
    for (const r of PEDIDO_ROLES) expect(SYSTEM_ROLE_KEYS).toContain(r);
  });

  it("quien VE y no PIDE: bodega y gerente_boston (los dos ven el catálogo)", () => {
    const soloVen = CATALOGO_ROLES.filter((r) => !puedeArmarPedido(r));
    expect([...soloVen]).toEqual(["bodega", "gerente_boston"]);
    for (const r of ["admin", "secretaria", "vendedor"]) expect(puedeArmarPedido(r)).toBe(true);
    expect(puedeArmarPedido("")).toBe(false);
    expect(puedeArmarPedido(null)).toBe(false);
  });

  it("`createRoles` de las 4 marcas SALE de la lista (Reebok suma su 'cliente' legacy)", () => {
    expect(MARCAS_CONFIG.reebok.createRoles).toEqual([...PEDIDO_ROLES, ROL_LEGACY_CLIENTE]);
    for (const marca of ["joybees", "tommy", "calvin"] as const) {
      expect(MARCAS_CONFIG[marca].createRoles, marca).toEqual([...PEDIDO_ROLES]);
    }
    const src = sinComentarios(leer("src/lib/catalogo/marcas.ts"));
    expect(src).not.toMatch(/createRoles:\s*\["admin"/);
  });

  it("el checkout, `send-order` y el detalle leen la MISMA lista", () => {
    expect(sinComentarios(leer("src/app/api/catalogo/checkout/route.ts"))).toContain("const ROLES = pedidoRoles();");
    expect(sinComentarios(leer("src/app/api/catalogo/[marca]/send-order/route.ts"))).toContain("requireRole(req, pedidoRoles())");
    const detalle = sinComentarios(leer("src/components/catalogo/PedidoDetalleClient.tsx"));
    expect(detalle).toContain("const isEditorRole = puedeArmarPedido(role);");
    expect(detalle).not.toMatch(/\["admin", "secretaria", "vendedor"\]/);
  });

  it("«Editar/Duplicar» un comprobante es la misma lista que armarlo", () => {
    expect(COMPROBANTES_EDITAR_ROLES).toBe(PEDIDO_ROLES);
  });

  it("`puedeVerComprobantes` lee COMPROBANTES_ROLES (bodega sí, gerente_boston no)", () => {
    for (const r of COMPROBANTES_ROLES) expect(puedeVerComprobantes(r)).toBe(true);
    expect(puedeVerComprobantes("gerente_boston")).toBe(false);
    expect(puedeVerComprobantes("contabilidad")).toBe(false);
  });
});

describe("2 · el catálogo interno en SOLO LECTURA para quien no arma pedidos", () => {
  const producto: CatalogoProducto = {
    id: "p1", sku: "THS10159C000", name: "Zapato", price: 25, image_url: null,
    category: "footwear", gender: "men", active: true, existencia: 5, disponibilidad: 5,
  } as CatalogoProducto;

  it("la tarjeta plana sin «Agregar» ni control de cantidad — y con todo lo demás", () => {
    render(<CatalogoProductCard marca="tommy" product={producto} qty={0} onQtyChange={() => {}} showStock soloLectura />);
    expect(screen.queryByText("Agregar")).toBeNull();
    expect(screen.getByText("Zapato")).toBeTruthy();
    expect(screen.getByText("THS10159C000")).toBeTruthy();
    cleanup();
    // Con cantidad ya en el carrito tampoco se dibuja el −/+.
    render(<CatalogoProductCard marca="tommy" product={producto} qty={2} onQtyChange={() => {}} showStock soloLectura />);
    expect(screen.queryByText("+")).toBeNull();
  });

  it("CONTROL: sin `soloLectura` la misma tarjeta SÍ ofrece «Agregar»", () => {
    render(<CatalogoProductCard marca="tommy" product={producto} qty={0} onQtyChange={() => {}} showStock />);
    expect(screen.getByText("Agregar")).toBeTruthy();
  });

  it("la tarjeta agrupada (Joybees) hace lo mismo — paridad de las dos tarjetas", () => {
    const p: JoybeesProduct = {
      id: "j1", sku: "UKTRK.BLK-KIDS", name: "Kids Trekking", category: "trekking", gender: "kids",
      price: 13, stock: 95, existencia: 95, disponibilidad: 95, image_url: null, active: true,
      popular: false, is_regalia: false, created_at: "2026-07-01T00:00:00Z",
    };
    const [g] = groupByModel([p]);
    render(<CatalogoGroupedCard marca="joybees" group={g} cartMap={new Map()} onQtyChange={() => {}} showStock soloLectura />);
    expect(screen.queryByText("Agregar")).toBeNull();
    expect((document.body.textContent ?? "")).toContain("Kids Trekking");
    cleanup();
    render(<CatalogoGroupedCard marca="joybees" group={g} cartMap={new Map()} onQtyChange={() => {}} showStock />);
    expect(screen.getByText("Agregar")).toBeTruthy();
  });

  it("la pantalla del catálogo deriva `soloLectura` del rol y lo pasa a las 4 formas de dibujar", () => {
    const src = sinComentarios(leer("src/components/catalogo/CatalogoVendedorPage.tsx"));
    expect(src).toContain('const soloLectura = role !== "" && !puedeArmarPedido(role);');
    expect(src.match(/soloLectura=\{soloLectura\}/g)?.length).toBe(4);
    // Sin carrito no hay «Ver pedido» que ofrecer.
    expect(src).toContain("{!modo.activo && !soloLectura && cartCount > 0 && (");
    // Y la regla no se escribe a mano en la pantalla.
    expect(src).not.toMatch(/role === "bodega"|role === "gerente_boston"/);
  });

  it("en el detalle, los dos correos van detrás de `isEditorRole`; el PDF se queda", () => {
    const src = sinComentarios(leer("src/components/catalogo/PedidoDetalleClient.tsx"));
    const bloque = src.slice(src.indexOf("Compartir pedido"));
    expect(bloque.indexOf("{isEditorRole && (<>")).toBeGreaterThan(0);
    expect(bloque.indexOf("{isEditorRole && (<>")).toBeLessThan(bloque.indexOf("Avisar por correo a Fashion Group"));
    expect(bloque.indexOf("{isEditorRole && (<>")).toBeLessThan(bloque.indexOf("Enviar por email al cliente"));
    expect(bloque.indexOf("Descargar PDF")).toBeLessThan(bloque.indexOf("{isEditorRole && (<>"));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · EL AVISO NEGRO SE CIERRA SOLO
// ═════════════════════════════════════════════════════════════════════════════

describe("3 · el Toast de las dos pantallas internas lleva `onDismiss`", () => {
  for (const rel of ["src/app/catalogos/marcas/page.tsx", "src/components/catalogo/CatalogoVendedorPage.tsx"]) {
    it(rel, () => {
      const src = sinComentarios(leer(rel));
      expect(src).toContain("<Toast message={toast} onDismiss={() => setToast(null)} />");
      expect(src).not.toContain("<Toast message={toast} />");
    });
  }
  it("CONTROL: el público ya lo hacía y sigue igual", () => {
    expect(sinComentarios(leer("src/components/catalogo/CatalogoPublicoPage.tsx"))).toMatch(/<Toast[^>]*onDismiss=/);
  });
});
