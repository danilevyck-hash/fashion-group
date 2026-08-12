// EL CATÁLOGO EN MODO "AGREGANDO A ESTE PEDIDO" (12-ago-2026).
//
// Daniel: *"¿POR QUÉ AL AGREGAR ME SALE ASÍ? en vez de mandarme al catálogo? es
// lo más natural, ¿no?"*. El "+ Agregar productos" del pedido lleva al catálogo
// de la marca con `?agregarA=<id>`, y ahí cada Agregar escribe en ESE pedido.
//
// Acá va el contrato PURO (parámetro, roles, mapa, textos) más los candados
// estáticos que sostienen las tres reglas que no se pueden aflojar:
//   1. los roles de la pantalla son los MISMOS que acepta el PATCH /item;
//   2. tocar un filtro no puede apagar el modo (el modo vive en la URL, y la
//      URL se reescribe en cada cambio de filtro);
//   3. en modo pedido no se toca el carrito, y el modal viejo no vuelve.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";
import {
  PARAM_AGREGAR_A, ROLES_QUE_AGREGAN, puedeAgregarAlPedido, idAgregarA,
  hrefCatalogoAgregando, hrefPedidoDetalle, querySinPerderModo, mapaEnPedido,
  tituloPedido, envioBloquea,
} from "@/lib/catalogo/modo-pedido";
import { getMarcaTheme, MARCAS_UI } from "@/lib/catalogo/marcas-ui";

const SRC = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("cómo se entra y se sale del modo", () => {
  it("el modo viaja en la URL — sobrevive un refresh y se puede compartir", () => {
    expect(hrefCatalogoAgregando("/catalogo/tommy", "abc-123")).toBe("/catalogo/tommy?agregarA=abc-123");
    expect(idAgregarA(new URLSearchParams("agregarA=abc-123"))).toBe("abc-123");
  });

  it("sin el parámetro, el catálogo es el de siempre", () => {
    expect(idAgregarA(new URLSearchParams(""))).toBeNull();
    expect(idAgregarA(new URLSearchParams("gender=women"))).toBeNull();
    expect(idAgregarA(null)).toBeNull();
  });

  it("el id del query es dato no confiable: se recorta y se acota", () => {
    expect(idAgregarA(new URLSearchParams("agregarA=%20%20"))).toBeNull();
    expect(idAgregarA(new URLSearchParams(`agregarA=${"x".repeat(65)}`))).toBeNull();
    expect(idAgregarA(new URLSearchParams(`agregarA=${"x".repeat(64)}`))).toBe("x".repeat(64));
  });

  it("'Listo, volver al pedido' vuelve al detalle de ESE pedido", () => {
    expect(hrefPedidoDetalle("calvin", "abc-123")).toBe("/catalogo/calvin/pedido/abc-123");
  });

  it("cambiar un filtro NO apaga el modo (la URL se reescribe entera)", () => {
    const params = new URLSearchParams();
    params.set("gender", "women");
    expect(querySinPerderModo(params, "abc-123")).toBe("gender=women&agregarA=abc-123");
  });

  it("sin modo, la URL de filtros queda como siempre", () => {
    const params = new URLSearchParams();
    params.set("gender", "women");
    expect(querySinPerderModo(params, null)).toBe("gender=women");
    expect(querySinPerderModo(new URLSearchParams(), null)).toBe("");
  });
});

describe("quién puede agregar", () => {
  it("los tres roles que editan el pedido", () => {
    expect(puedeAgregarAlPedido("admin")).toBe(true);
    expect(puedeAgregarAlPedido("secretaria")).toBe(true);
    expect(puedeAgregarAlPedido("vendedor")).toBe(true);
  });

  it("bodega, el 'cliente' legacy de Reebok y una sesión sin rol NO", () => {
    expect(puedeAgregarAlPedido("bodega")).toBe(false);
    expect(puedeAgregarAlPedido("cliente")).toBe(false);
    expect(puedeAgregarAlPedido("contabilidad")).toBe(false);
    expect(puedeAgregarAlPedido("")).toBe(false);
    expect(puedeAgregarAlPedido(null)).toBe(false);
  });

  it("CANDADO: son EXACTAMENTE los que acepta el PATCH /item", () => {
    // Uno de más = un botón que el server contesta 403; uno de menos = alguien
    // que sí puede editar el pedido y no puede agregar desde el catálogo.
    const route = SRC("src/app/api/catalogo/[marca]/orders/[id]/item/route.ts");
    const m = route.match(/requireRole\(req,\s*\[([^\]]+)\]/);
    expect(m).toBeTruthy();
    const delRoute = m![1].split(",").map((s) => s.trim().replace(/["']/g, "")).sort();
    expect([...ROLES_QUE_AGREGAN].sort()).toEqual(delRoute);
  });
});

describe("lo que la pantalla dice y muestra", () => {
  it("la barra nombra el pedido y a quién es", () => {
    expect(tituloPedido({ order_number: "TOM-010", client_name: "Aidy Shop No.2" }))
      .toBe("TOM-010 · Aidy Shop No.2");
  });

  it("un pedido sin nombre de cliente igual dice a cuál se agrega", () => {
    expect(tituloPedido({ order_number: "TOM-010", client_name: "" })).toBe("TOM-010");
    expect(tituloPedido({ order_number: "", client_name: "Aidy" })).toBe("Aidy");
    expect(tituloPedido(null)).toBe("este pedido");
  });

  it("las tarjetas muestran los bultos que YA tiene el pedido", () => {
    const m = mapaEnPedido([
      { product_id: "p1", quantity: 9 },
      { product_id: "p2", quantity: 1 },
    ]);
    expect(m.get("p1")).toBe(9);
    expect(m.get("p2")).toBe(1);
    expect(m.get("p3")).toBeUndefined();
    expect(mapaEnPedido(null).size).toBe(0);
  });

  it("un envío ACTIVO a Switch bloquea; 'pendiente' y 'error' no", () => {
    expect(envioBloquea("enviado")).toBe(true);
    expect(envioBloquea("verificado")).toBe(true);
    expect(envioBloquea("pendiente")).toBe(false);
    expect(envioBloquea("error")).toBe(false);
    expect(envioBloquea(null)).toBe(false);
  });
});

describe("candados estáticos", () => {
  const GRID = () => SRC("src/components/catalogo/CatalogoVendedorPage.tsx");
  const PEDIDO = () => SRC("src/components/catalogo/PedidoDetalleClient.tsx");

  it("el modal viejo se RETIRÓ — una sola forma de agregar productos", () => {
    expect(existsSync(path.join(process.cwd(), "src/components/catalogo/AgregarProductosModal.tsx"))).toBe(false);
    expect(PEDIDO()).not.toContain("AgregarProductosModal");
  });

  it("'+ Agregar productos' navega al catálogo en modo pedido", () => {
    expect(PEDIDO()).toContain("hrefCatalogoAgregando");
    // Y guarda ANTES de irse: el auto-save tiene 2 s de debounce.
    expect(PEDIDO()).toMatch(/irAlCatalogoAgregando[\s\S]{0,400}await performSave\(\)/);
  });

  it("el grid conserva el modo al reescribir la URL de filtros", () => {
    const src = GRID();
    // La URL que se reescribe al filtrar tiene que pasar por el helper: si se
    // armara a mano, tocar "Mujer" apagaría el modo.
    expect(src).toMatch(/querySinPerderModo\(params, agregarA\)[\s\S]{0,300}history\.replaceState/);
    // Y el efecto se vuelve a correr si cambia el pedido al que se agrega.
    expect(src).toMatch(/\[gender, category, search, bultosFilter, precioRango, agregarA\]/);
  });

  it("en modo pedido las tarjetas escriben en el PEDIDO, no en el carrito", () => {
    const src = GRID();
    expect(src).toContain("const onQtyChange = modo.activo ? modo.setQty : handleQtyChange;");
    expect(src).toContain("modo.activo ? modo.enPedido :");
    // La barra del carrito no puede aparecer en modo pedido.
    expect(src).toContain("{!modo.activo && cartCount > 0 && (");
  });

  it("el carrito solo se toca por lib/catalogo/carrito (nadie escribe storage a mano)", () => {
    const archivos = [
      "src/components/catalogo/CatalogoVendedorPage.tsx",
      "src/components/catalogo/CatalogoPublicoPage.tsx",
      "src/components/catalogo/CheckoutClient.tsx",
      "src/components/catalogo/ProductoDetalleClient.tsx",
    ];
    for (const f of archivos) {
      const src = SRC(f);
      expect(src, `${f} escribe el carrito en localStorage`).not.toMatch(/localStorage\.(setItem|getItem)\(\s*(theme\.)?(cartKey|publicCartKey)/);
      expect(src, `${f} sigue usando las claves viejas`).not.toContain("cartKeyLocal");
      expect(src, `${f} sigue usando las claves viejas`).not.toContain("cartKeySession");
    }
  });

  it("el hook del modo usa el PATCH /item que ya existía (candado Switch incluido)", () => {
    const hook = SRC("src/lib/hooks/useModoPedido.ts");
    expect(hook).toMatch(/orders\/\$\{orderId\}\/item/);
    expect(hook).toContain('method: "PATCH"');
    expect(hook).toContain("res.status === 409");
    // Y nunca toca el carrito.
    expect(hook).not.toContain("cartKey");
    expect(hook).not.toContain("localStorage");
  });

  it("el tema de las 4 marcas expone UNA clave de carrito", () => {
    for (const m of MARCAS_UI) {
      const theme = getMarcaTheme(m)!;
      expect(typeof theme.cartKey).toBe("string");
      expect(theme.cartKey.length).toBeGreaterThan(0);
      expect((theme as unknown as Record<string, unknown>).cartKeyLocal).toBeUndefined();
      expect((theme as unknown as Record<string, unknown>).cartKeySession).toBeUndefined();
    }
    expect(PARAM_AGREGAR_A).toBe("agregarA");
  });
});
