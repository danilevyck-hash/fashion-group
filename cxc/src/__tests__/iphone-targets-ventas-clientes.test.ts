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
import { readFileSync, existsSync } from "fs";
import path from "path";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf-8");

// 🔄 CAMBIO DE DIRECCIÓN, CON NOTA FECHADA (11-sep-2026). Data Health vivió
// dentro de Usuarios como 2ª pestaña desde el 13-ago-2026 y ese día su PANTALLA
// se retiró entera — Daniel: «data health quiero que el sistema o tú mida todo
// pero no verlo… no lo uso y no lo quiero usar». El archivo
// `DataHealthTab.tsx` ya no existe, así que el bloque táctil que lo medía
// cambió de dirección (ver abajo) en vez de borrarse: ahora exige que NO haya
// nada que medir. La medición de integridad no se tocó — vive en el cron
// `integrity-check` y en `data_integrity_checks`.
const usuarios = leer("app/admin/usuarios/page.tsx");
const panelCxc = leer("app/cxc/components/PanelCxcMobile.tsx");
const clientes = leer("app/clientes/ClientesListClient.tsx");
const vistaGeneral = leer("app/vista-general/page.tsx");
const proveedores = leer("app/proveedores/ProveedoresListClient.tsx");

/** Piso de legibilidad: ninguna de estas pantallas baja de 12px. */
const PISO_PX = 12;

/** Todas las clases `text-[Npx]` de un archivo. */
function tamanosArbitrarios(src: string): number[] {
  return [...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => parseFloat(m[1]));
}

describe("Data Health — ya no hay pantalla que medir (11-sep-2026)", () => {
  // El bloque anterior exigía tarjetas en angosto, tabla con scroller de `lg`
  // para arriba y un botón de 44px dentro de `DataHealthTab.tsx`. Esa pantalla
  // se retiró, así que la garantía pasó a ser la contraria: el archivo no
  // existe y nada del sistema lo importa. Lo que medía no se aflojó — dejó de
  // haber superficie.
  it("`DataHealthTab.tsx` no existe", () => {
    expect(existsSync(path.join(process.cwd(), "src/app/admin/usuarios/DataHealthTab.tsx"))).toBe(false);
  });

  it("la página de Usuarios no lo monta ni lo importa", () => {
    expect(usuarios).not.toContain("DataHealthTab");
  });

  // CONTROL: lo que SÍ quedó de esa pantalla —las otras pestañas— sigue
  // cumpliendo el contrato táctil de 44px. Sin esto, el bloque de arriba
  // pasaría igual con la pantalla de Usuarios rota.
  it("CONTROL: Usuarios conserva sus tocables de 44px", () => {
    expect(usuarios).toContain("min-h-[44px]");
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

// 🔴 CAMBIÓ DE DIRECCIÓN (4-sep-2026). Este bloque medía la estrella ⭐ de la
// card de CXC: 44x44, sin propagar el clic a la fila y con `gap-0` para no
// comerle ancho al nombre. Los favoritos se retiraron del CXC entero — Daniel:
// *«quita favoritos»*; `cxc_favorites` tuvo 0 filas en toda su historia — así
// que ahora se exige lo contrario: que no haya un segundo control táctil
// compitiendo con «expandir» dentro de la misma card.
describe("CXC mobile — la card tiene UN solo control táctil", () => {
  it("la estrella de favorito no está", () => {
    expect(panelCxc).not.toContain("Quitar favorito");
    expect(panelCxc).not.toContain("Marcar favorito");
    expect(panelCxc).not.toContain("isFavorite");
  });

  it("CONTROL: expandir sigue siendo la acción de la card, y el «···» sus 44x44", () => {
    expect(panelCxc).toContain("aria-expanded={isExpanded}");
    const overflow = leer("components/ui/OverflowMenu.tsx");
    expect(overflow).toContain("min-h-[44px] min-w-[44px]");
  });
});

describe("Nombres cortados — letra más chica, nunca por debajo de 12px", () => {
  it("🔄 CXC mobile: el nombre del cliente SUBE a 14px (5-sep-2026)", () => {
    // El `tracking-tight` lo agregó el PR de ancho (ver
    // iphone-ancho-nombres.test.ts): aprieta el interletrado, NO el cuerpo de
    // la letra — los 12px siguen intactos.
    // 🩸 Estaba en 12 —el PISO del sistema— porque la estrella ⭐ y el menú
    // "···" le comían el ancho a la derecha. La estrella se fue el 4-sep y el
    // "···" el 5 (sus acciones viven en la hoja «Cobrar»): ese ancho volvió al
    // nombre y la letra pudo subir. `tracking-tight` se queda.
    expect(panelCxc).toContain('className="block truncate text-[14px] font-medium leading-5 tracking-tight text-gray-900"');
    expect(panelCxc).not.toContain("text-[12px] font-medium leading-5 tracking-tight");
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
    for (const [nombre, src] of Object.entries({ panelCxc, vistaGeneral, proveedores, clientes, usuarios })) {
      for (const px of tamanosArbitrarios(src)) {
        // text-[10px]/[11px] existen como decoración (badges, sufijos de
        // empresa), NO como el dato principal. El piso aplica a los nombres.
        if (px < PISO_PX) {
          expect(px, `${nombre}: text-[${px}px] debe ser decoración, no un nombre`).toBeGreaterThanOrEqual(10);
        }
      }
    }
    // El dato principal de cada lista nunca baja de 12px. En el CXC eso es el
    // NOMBRE del cliente, que desde el 5-sep-2026 está en 14 (ver arriba); los
    // `text-[11px]` que aparecen son decoración: el rótulo de cada chip de
    // tramo dentro de la tarjeta negra, el «no paga hace N d» y la marca de
    // «le enviaste…», todos debajo o al lado del dato, nunca EN LUGAR de él.
    const nombre = panelCxc.match(/className="block truncate text-\[(\d+)px\] font-medium leading-5 tracking-tight/);
    expect(nombre, "no se encontró el nombre del cliente en la tarjeta").toBeTruthy();
    expect(Number(nombre![1])).toBeGreaterThanOrEqual(PISO_PX);
  });
});

describe("Clientes — llamar es la acción natural del módulo", () => {
  // ⚠️ CAMBIÓ DE LUGAR EL 5-sep-2026, no de regla. Con el rediseño de la lista,
  // el correo y el teléfono salieron de la tarjeta y viven en UN componente,
  // `Contacto`, que dibuja la columna «Cómo contactarlo» en la tabla y la línea
  // de la tarjeta en el celular. Las tres exigencias son las mismas y ahora se
  // cumplen en un solo lugar en vez de dos.
  const contacto = () => {
    const i = clientes.indexOf("function Contacto(");
    expect(i).toBeGreaterThan(-1);
    return clientes.slice(i);
  };

  it("el teléfono de la card mobile es un target de 44x44", () => {
    // Antes: link tel: de 18px de alto (x26 en la primera página).
    const bloque = contacto();
    expect(bloque).toContain("min-h-[44px]");
    expect(bloque).toContain("min-w-[44px]");
    expect(bloque).toContain("href={tHref ?? undefined}");
    // El tamaño grande solo en la tarjeta: en la tabla del escritorio no hace
    // falta y estiraría la fila.
    expect(bloque).toContain("tocable ?");
  });

  it("tocar el teléfono no navega a la ficha del cliente", () => {
    expect(contacto()).toContain("e.stopPropagation()");
  });

  it("el teléfono conserva su etiqueta accesible", () => {
    expect(clientes).toContain("aria-label={`Llamar a ${nombre}`}");
  });

  it("🔴 y lo que FALTA se dice en rojo, no con un guion gris", () => {
    // El trabajo de esta pantalla: de 150 clientes, 50 no tienen correo, 48 no
    // tienen teléfono y 31 no tienen ninguno de los dos (medido 5-sep-2026).
    expect(contacto()).toContain('text-red-600">{c.falta}');
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

  it("el toggle 'Ver N sin saldo' y 'Descargar Excel' llegan a 44px", () => {
    // 6-sep-2026: el verbo pasó de «Exportar» a «Descargar» en los 5 botones que
    // no lo decían (Daniel: «a»). Medido: el sistema dice «Descargar» 23 veces.
    expect(proveedores).toContain("inline-flex min-h-[44px] items-center text-xs text-gray-400");
    const i = proveedores.indexOf("Descargar Excel");
    expect(proveedores.slice(i - 400, i)).toContain("min-h-[44px]");
  });
});

describe("Campos de formulario de las listas", () => {
  it("los buscadores miden 44px", () => {
    // ⚠️ 5-sep-2026: el select de provincia de Clientes se RETIRÓ (99 de los 150
    // clientes no tienen provincia; Daniel: «si, no sirve»), así que ya no hay
    // un segundo control que medir en esa pantalla. Los chips que lo reemplazan
    // tienen su propia altura y su candado en `clientes-lista-pantalla`.
    expect(clientes).toContain('className="flex-1 border border-gray-200 rounded-md px-3 min-h-[44px] text-sm');
    expect(clientes).not.toContain("Todas las provincias");
    expect(proveedores).toContain('className="w-full border border-gray-200 rounded-md px-3 min-h-[44px] text-sm');
  });
});
