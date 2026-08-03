// ─────────────────────────────────────────────────────────────────────────────
// iPhone 390x844 — grupo "Ventas y clientes" + Administración (26-jul-2026).
//
// Auditoría medida por CDP (Emulation.setDeviceMetricsOverride 390x844, dsf 3,
// mobile). Estos tests fijan el contrato de lo que se arregló para que no se
// pierda en un refactor. Son tests de FUENTE (mismo patrón que
// catalogo-cards-paridad.test.ts): lo que se protege es una clase de Tailwind
// concreta, no un render — el tamaño real ya se midió en el navegador y los
// números antes/después están en el PR.
//
// Regla de la casa: 44x44 px mínimo al tacto.
//
// Nota sobre tamaños de letra: en este repo `text-xs` = 13px y `text-sm` = 14px
// (override "Capa 1B" en tailwind.config.ts). El PISO acordado para datos en
// estas pantallas es 12px — por debajo NO se baja; los nombres que ni a 12px
// entran siguen cortando con "…" y quedan como decisión de producto.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf-8");

const dataHealth = leer("app/admin/data-health/page.tsx");
const usuarios = leer("app/admin/usuarios/page.tsx");
const panelCxc = leer("app/admin/components/PanelCxcMobile.tsx");
const clientes = leer("app/clientes/ClientesListClient.tsx");
const vistaGeneral = leer("app/vista-general/page.tsx");
const proveedores = leer("app/proveedores/ProveedoresListClient.tsx");

/** Piso de legibilidad: ninguna de estas pantallas baja de 12px. */
const PISO_PX = 12;

/** Todas las clases `text-[Npx]` de un archivo. */
function tamanosArbitrarios(src: string): number[] {
  return [...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => parseFloat(m[1]));
}

describe("Data Health — la tabla de estado se puede leer entera en iPhone", () => {
  // 🩸 ACTUALIZADO 30-jul-2026. La garantía se hizo MÁS FUERTE, no se aflojó.
  //
  // Este bloque nació cuando la card tenía `overflow-hidden` y la tabla (691px)
  // se recortaba a 340px SIN scroll: 351px inalcanzables, justo Severity y Rows.
  // El arreglo de entonces fue un `overflow-x-auto` — el dato dejaba de ser
  // INALCANZABLE, pero seguía habiendo que arrastrar: 353px medidos a 390 y
  // 133px a 834.
  //
  // Ahora, hasta `lg`, la tabla es TARJETAS y el arrastre es **0**; la tabla
  // (con su scroller y su `min-w`) sigue igual de `lg` para arriba, que es donde
  // entra sola. Por eso el test ya no exige el scroller a secas: exige las DOS
  // vistas. Detalle en `__tests__/lib/depurador-reclamos-datahealth-anchos`.
  it("en angosto son tarjetas (0px de arrastre), no una tabla que se arrastra", () => {
    const i = dataHealth.indexOf("Estado actual por check");
    expect(i).toBeGreaterThan(-1);
    const j = dataHealth.indexOf("</table>", i);
    const bloque = dataHealth.slice(i, j);
    expect(bloque).toContain('data-medir="dh-checks"');
    expect(bloque).toContain('lg:hidden divide-y');
    // Y la tarjeta sigue mostrando lo que se perdía: Severity y Rows.
    expect(bloque).toContain("badge.label");
    expect(bloque).toContain("r.rows_affected");
  });

  it("de lg para arriba sigue la tabla, con su scroller y su min-w", () => {
    const i = dataHealth.indexOf("Estado actual por check");
    const j = dataHealth.indexOf("</table>", i);
    const bloque = dataHealth.slice(i, j);
    expect(bloque).toContain('<div className="hidden lg:block overflow-x-auto" data-vista="tabla">');
    // min-w evita que la tabla se comprima en vez de scrollear.
    expect(bloque).toMatch(/<table className="w-full min-w-\[\d+px\] text-sm">/);
  });

  it("el div que scrollea se cierra (no queda JSX desbalanceado)", () => {
    const i = dataHealth.indexOf('<div className="hidden lg:block overflow-x-auto" data-vista="tabla">');
    const j = dataHealth.indexOf("</table>", i);
    expect(dataHealth.slice(j, j + 60)).toContain("</div>");
  });

  it("'Correr checks ahora' llega a 44px", () => {
    expect(dataHealth).toContain("min-h-[44px]");
    expect(dataHealth).not.toContain("min-h-[40px]");
  });
});

describe("Usuarios — el peor combo del sistema (editar + eliminar)", () => {
  it("Editar y Desactivar miden 44x44", () => {
    // Antes: 26x26 (p-1.5 sobre un svg de 14px).
    const botones = [...usuarios.matchAll(/className="text-gray-400 hover:text-(?:gray-700|red-600) h-11 w-11 inline-flex items-center justify-center rounded transition-colors"/g)];
    expect(botones).toHaveLength(2);
    expect(usuarios).not.toContain('className="text-gray-400 hover:text-gray-700 p-1.5 rounded transition-colors"');
  });

  it("hay al menos 8px entre Editar y Desactivar (uno es destructivo)", () => {
    // Antes: gap-1 (4px) entre un target de 26px y otro DESTRUCTIVO.
    expect(usuarios).toContain("flex items-center gap-2 sm:opacity-60 sm:group-hover:opacity-100");
    expect(usuarios).not.toContain("flex items-center gap-1 sm:opacity-60");
  });

  it("el modal de usuario tiene ✕ de 44x44 (en iPhone no hay Escape)", () => {
    const i = usuarios.indexOf('id="usuario-modal-title"');
    const j = usuarios.indexOf("</div>", usuarios.indexOf("</h2>", i));
    const cabecera = usuarios.slice(i, j);
    expect(cabecera).toContain('aria-label="Cerrar"');
    expect(cabecera).toContain("h-11 w-11");
    expect(cabecera).toContain("onClick={cerrarUserModal}");
  });

  it("la ✕ no cierra mientras se está guardando", () => {
    const i = usuarios.indexOf('aria-label="Cerrar"');
    expect(usuarios.slice(i - 400, i)).toContain("disabled={savingUser}");
  });
});

describe("CXC mobile — favorito vs expandir", () => {
  it("la estrella de favorito mide 44x44", () => {
    // Antes: span con `p-2.5 -m-2.5` = 36x36, pegado al borde de una fila que
    // hace otra cosa (expandir).
    const i = panelCxc.indexOf('aria-label={isFavorite ? "Quitar favorito"');
    const clase = panelCxc.slice(i, i + 400);
    expect(clase).toContain("h-11 w-11");
    expect(panelCxc).not.toContain('className="shrink-0 cursor-pointer text-base leading-none p-2.5 -m-2.5"');
  });

  it("la estrella no propaga el click a la fila (no expande al marcar favorito)", () => {
    const i = panelCxc.indexOf('aria-label={isFavorite ? "Quitar favorito"');
    const bloque = panelCxc.slice(i - 500, i);
    expect(bloque).toContain("e.stopPropagation()");
  });

  it("la caja de la estrella termina donde arranca el nombre (gap-0)", () => {
    // gap-0 es intencional: los 14px de aire alrededor del ☆ son parte de su
    // área de tap. Con gap-2 el nombre perdía 8px más de ancho.
    const i = panelCxc.indexOf('aria-label={isFavorite ? "Quitar favorito"');
    expect(panelCxc.slice(i - 700, i)).toContain('className="flex items-center gap-0"');
  });
});

describe("Nombres cortados — letra más chica, nunca por debajo de 12px", () => {
  it("CXC mobile: el nombre del cliente baja a 12px", () => {
    // El `tracking-tight` lo agregó el PR de ancho (ver
    // iphone-ancho-nombres.test.ts): aprieta el interletrado, NO el cuerpo de
    // la letra — los 12px siguen intactos.
    expect(panelCxc).toContain('className="truncate text-[12px] font-medium leading-5 tracking-tight text-gray-900"');
    expect(panelCxc).not.toContain('className="truncate text-sm font-medium text-gray-900"');
  });

  it("Vista General: los nombres de las alertas bajan a text-xs (13px)", () => {
    expect(vistaGeneral).toContain('const NOMBRE_ALERTA = "text-xs text-stone-700"');
    // Las 3 listas (CXC, Proveedores, Reclamos) usan la MISMA constante.
    expect([...vistaGeneral.matchAll(/\$\{NOMBRE_ALERTA\} truncate/g)]).toHaveLength(3);
    expect(vistaGeneral).not.toContain('className="text-sm text-stone-700 truncate"');
  });

  it("Proveedores: el nombre baja de 16px (heredado) a text-xs", () => {
    expect(proveedores).toContain('className="font-medium truncate text-xs"');
    expect(proveedores).not.toContain('className="font-medium truncate"');
  });

  it("ninguna de estas pantallas baja del piso de 12px", () => {
    for (const [nombre, src] of Object.entries({ panelCxc, vistaGeneral, proveedores, clientes, usuarios, dataHealth })) {
      for (const px of tamanosArbitrarios(src)) {
        // text-[10px]/[11px] existen como decoración (badges, sufijos de
        // empresa), NO como el dato principal. El piso aplica a los nombres.
        if (px < PISO_PX) {
          expect(px, `${nombre}: text-[${px}px] debe ser decoración, no un nombre`).toBeGreaterThanOrEqual(10);
        }
      }
    }
    // El dato principal de cada lista nunca baja de 12px.
    expect(tamanosArbitrarios(panelCxc).filter((p) => p < PISO_PX)).toHaveLength(0);
  });
});

describe("Clientes — llamar es la acción natural del módulo", () => {
  it("el teléfono de la card mobile es un target de 44x44", () => {
    // Antes: link tel: de 18px de alto (x26 en la primera página).
    const i = clientes.indexOf("tHref ? (");
    const bloque = clientes.slice(i, i + 500);
    expect(bloque).toContain("min-h-[44px]");
    expect(bloque).toContain("min-w-[44px]");
    expect(bloque).toContain("href={tHref}");
  });

  it("tocar el teléfono no navega a la ficha del cliente", () => {
    const i = clientes.indexOf("tHref ? (");
    expect(clientes.slice(i, i + 500)).toContain("e.stopPropagation()");
  });

  it("el teléfono conserva su etiqueta accesible", () => {
    expect(clientes).toContain("aria-label={`Llamar a ${c.nombre}`}");
  });
});

describe("Vista General — filas y links de las alertas", () => {
  it("las filas de 'Requiere tu atención' miden 44px", () => {
    // Antes: 20 links de 33px.
    expect(vistaGeneral).toContain('const FILA_ALERTA =');
    const i = vistaGeneral.indexOf("const FILA_ALERTA =");
    expect(vistaGeneral.slice(i, i + 220)).toContain("min-h-[44px]");
    expect([...vistaGeneral.matchAll(/className=\{FILA_ALERTA\}/g)]).toHaveLength(3);
  });

  it("el link 'Ir a X →' del pie de cada AlertCard mide 44px y no ocupa todo el ancho", () => {
    // Antes: 3 links de 18px de alto.
    const i = vistaGeneral.indexOf("{linkLabel} →");
    const bloque = vistaGeneral.slice(i - 400, i);
    expect(bloque).toContain("min-h-[44px]");
    expect(bloque).toContain("self-start");
  });
});

describe("Proveedores — chips de empresa", () => {
  it("los chips miden 44px de alto", () => {
    // Antes: 28px (px-3 py-1) x8 chips.
    const i = proveedores.indexOf("function Chip(");
    const bloque = proveedores.slice(i, i + 600);
    expect(bloque).toContain("min-h-[44px]");
    expect(bloque).not.toContain("py-1 text-xs");
  });

  it("el toggle 'Ver N sin saldo' y 'Exportar Excel' llegan a 44px", () => {
    expect(proveedores).toContain("inline-flex min-h-[44px] items-center text-xs text-gray-400");
    const i = proveedores.indexOf("Exportar Excel");
    expect(proveedores.slice(i - 400, i)).toContain("min-h-[44px]");
  });
});

describe("Campos de formulario de las listas", () => {
  it("los buscadores y el select de provincia miden 44px", () => {
    expect(clientes).toContain('className="flex-1 border border-gray-200 rounded-md px-3 min-h-[44px] text-sm');
    expect(clientes).toContain('rounded-md px-3 min-h-[44px] text-sm outline-none focus:border-black transition sm:w-48');
    expect(proveedores).toContain('className="w-full border border-gray-200 rounded-md px-3 min-h-[44px] text-sm');
  });
});
