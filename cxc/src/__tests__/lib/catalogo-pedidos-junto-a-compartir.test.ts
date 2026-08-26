// ─────────────────────────────────────────────────────────────────────────────
// "PEDIDOS" VIVE EN LA MISMA FILA QUE "COMPARTIR" (12-ago-2026).
//
// Daniel: *"cambia el boton de pedido a la altura de compartir"* + *"en todos
// los catalgoso"*. Estaba arriba del todo, en la barra de la app (junto a
// "← Inicio"), mientras Compartir vivía más abajo, en la fila del logo. Son las
// dos acciones del catálogo y tenían que estar juntas.
//
// Tres cosas que este archivo sostiene, y las tres se pueden romper sin darse
// cuenta:
//  1. NO QUEDA UNA SEGUNDA COPIA en la navbar (dos botones "Pedidos" en la
//     misma pantalla es peor que el problema original).
//  2. EL CATÁLOGO PÚBLICO NO GANA NADA. `CatalogoHeader` lo comparten las dos
//     pantallas; meter ahí un control de sesión se lo regalaría a un cliente
//     sin login. Por eso el botón vive en `CatalogoVendedorPage`, que el
//     público nunca renderiza.
//  3. Se mantiene el MISMO gate de rol que tenía en la navbar (gestores), y el
//     blanco tocable de 44 px en las 4 marcas — de paso lo gana "Compartir",
//     que en 3 de las 4 no lo tenía.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { MARCAS_UI, getMarcaTheme } from "@/lib/catalogo/marcas-ui";
import { COMPROBANTES_ROLES } from "@/lib/catalogo/roles";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

const NAVBAR = "src/components/catalogo/CatalogoNavbar.tsx";
const VENDEDOR = "src/components/catalogo/CatalogoVendedorPage.tsx";
const HEADER = "src/components/catalogo/CatalogoHeader.tsx";
const PUBLICO = "src/components/catalogo/CatalogoPublicoPage.tsx";

describe("🔴 'Pedidos' se mudó, no se duplicó", () => {
  it("la navbar ya no lo dibuja", () => {
    const s = leer(NAVBAR);
    expect(s).not.toMatch(/>Pedidos</);
    expect(s).not.toContain("pedidosHref");
  });

  it("la pantalla del catálogo lo dibuja UNA sola vez", () => {
    const s = leer(VENDEDOR);
    expect((s.match(/>Pedidos</g) || []).length).toBe(1);
    expect(s).toContain("theme.vendorShare.pedidosBtn");
  });

  it("queda en la MISMA fila que Compartir, en los dos layouts", () => {
    const s = leer(VENDEDOR);
    // Layout Joybees/Tommy/Calvin: [Ver pedido | Pedidos | Compartir].
    expect(s).toContain("{pedidosBtn}\n              {shareMenu}");
    // Layout Reebok: Compartir vive en la fila del sync, y Pedidos con él.
    expect(s).toMatch(/\{pedidosBtn\}\s*\n\s*\{filteredCount > 0 && shareMenu\}/);
  });

  it("🩸 Pedidos NO depende de que el filtro tenga resultados (Compartir sí)", () => {
    // Reebok esconde Compartir sin productos filtrados. Llegar a la lista de
    // pedidos no puede depender de eso: sería una salida que desaparece.
    const s = leer(VENDEDOR);
    expect(s).not.toMatch(/filteredCount > 0 && pedidosBtn/);
  });
});

describe("🔴 el catálogo PÚBLICO no gana un control de sesión", () => {
  it("el header compartido no sabe nada de 'Pedidos'", () => {
    expect(leer(HEADER)).not.toContain("Pedidos");
  });

  it("la pantalla pública tampoco", () => {
    const s = leer(PUBLICO);
    expect(s).not.toMatch(/>Pedidos</);
    expect(s).not.toContain("pedidosHref");
  });
});

describe("el gate de rol y el tamaño del blanco tocable", () => {
  it("🔴 el gate SALE de `COMPROBANTES_ROLES` — no hay copia a mano", () => {
    // Este candado exigía los tres `role === "…"` escritos a mano, o sea que
    // fijaba el permiso VIEJO. Al entrar bodega (25-ago-2026, *"Dale acceso a
    // bodega a la lista de pedidos."*) esa copia habría quedado vieja sin que
    // nada se rompiera. Cambia de dirección: hoy exige que la lista sea UNA
    // sola, la constante, y que la pantalla no la vuelva a escribir.
    const s = leer(VENDEDOR);
    expect(s).toContain("COMPROBANTES_ROLES");
    expect(s, 'volvieron los `role === "…"` a mano').not.toMatch(/puedeVerPedidos\s*=\s*role\s*===/);
    expect(s).toContain("{pedidosBtn}");
    // Y la constante es la de los CUATRO: el botón y el servidor dicen lo mismo.
    expect([...COMPROBANTES_ROLES]).toEqual(["admin", "secretaria", "vendedor", "bodega"]);
  });

  it("las 4 marcas tienen Pedidos y Compartir con 44 px", () => {
    for (const marca of MARCAS_UI) {
      const vs = getMarcaTheme(marca)!.vendorShare;
      expect(vs.pedidosBtn, marca).toContain("min-h-[44px]");
      expect(vs.btn, `${marca} — Compartir`).toContain("min-h-[44px]");
    }
  });

  it("la fila puede bajar de línea en vez de aplastarse en 390 px", () => {
    // Con tres botones y el wordmark de Tommy (14:1) no entra todo en una
    // línea a 390 px. `flex-wrap` deja que el grupo baje ENTERO; sin él,
    // flexbox comprime el logo (el bug que ya documenta CatalogoHeader).
    const s = leer(VENDEDOR);
    expect(s).toContain("flex flex-wrap items-start justify-between gap-2");
    expect(s).toContain("flex flex-wrap items-center justify-end gap-2 ml-auto");
  });
});
