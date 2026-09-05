// ─────────────────────────────────────────────────────────────────────────────
// iPhone 390x844 — los 3 casos donde achicar la letra NO alcanzó (26-jul-2026).
//
// Continuación de #297/#298/#299. Ahí se bajó el cuerpo de la letra hasta el
// piso de 12px y aun así quedaban nombres cortados: la única salida era
// recuperar ANCHO. Medido por CDP (Emulation.setDeviceMetricsOverride 390x844,
// dsf 3, mobile true) contra los datos reales de producción:
//
//   CXC (98 clientes)   7 nombres cortados  →  0
//   Préstamos (12)     12 nombres cortados  →  0
//   Vista General       3 subtítulos cortados → 0 (tarjeta 110px → 128px)
//
// Tests de FUENTE, mismo patrón que iphone-targets-*.test.ts: lo que se
// protege es la clase de Tailwind concreta que hizo el ancho, porque el tamaño
// real ya se midió en el navegador. Si alguien devuelve el chevron, el gap
// grande o el `truncate`, los nombres vuelven a cortarse en silencio.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf-8");

const panelCxc = leer("app/admin/components/PanelCxcMobile.tsx");
const prestamos = leer("app/prestamos/PrestamosClient.tsx");
const vistaGeneral = leer("app/vista-general/page.tsx");
const syncNow = leer("components/shared/SyncNowButton.tsx");

/** Bloque de la cabecera de la card de CXC (nombre + monto + acciones). */
function cabeceraCxc(): string {
  const i = panelCxc.indexOf('<div className="flex items-start justify-between');
  const j = panelCxc.indexOf("<BucketChip", i);
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return panelCxc.slice(i, j);
}

describe("CXC mobile — el ancho sale de la derecha, no de la letra", () => {
  it("el chevron de la card desapareció", () => {
    // Era un adorno: TODA la fila ya abre/cierra la card. Costaba 22px
    // (14 del ícono + 8 del gap) del ancho del nombre.
    const cab = cabeceraCxc();
    expect(cab).not.toContain("rotate-180");
    expect(cab).not.toContain('<polyline points="6 9 12 15 18 9"/>');
  });

  it("la fila sigue siendo el control de expandir (aria-expanded intacto)", () => {
    // Sin chevron, el único indicador de estado es el panel desplegado + la
    // semántica. Si esto se pierde, la card deja de ser accesible.
    expect(panelCxc).toContain("aria-expanded={isExpanded}");
    expect(panelCxc).toContain('role="button"');
  });

  it("los gaps de la cabecera están al mínimo (gap-2 fuera, gap-1 dentro)", () => {
    expect(panelCxc).toContain('<div className="flex items-start justify-between gap-2 px-3 py-3">');
    expect(panelCxc).toContain('<div className="flex shrink-0 items-center gap-1">');
  });

  it('el "···" conserva 44x44 y se mete en el padding con -mr-3', () => {
    // Espejo del -ml-3 de la estrella: gana 12px SIN tocar el área de tap.
    const cab = cabeceraCxc();
    expect(cab).toContain('<span className="-mr-3" onClick={e => e.stopPropagation()}>{actionsMenu}</span>');
    // El botón real vive en OverflowMenu y no se tocó.
    const overflow = leer("components/ui/OverflowMenu.tsx");
    expect(overflow).toContain("min-h-[44px] min-w-[44px]");
  });

  it("🔴 la estrella de favorito ya no está, y el nombre se quedó con sus 44px", () => {
    // Cambió de dirección el 4-sep-2026: los favoritos ⭐ se retiraron del CXC
    // (Daniel: «quita favoritos»; `cxc_favorites` tuvo 0 filas en su historia).
    // Este test medía que la estrella conservara su área de tap; hoy mide que
    // no vuelva — devolverla le come 44px al nombre, que es justo lo que este
    // archivo existe para proteger.
    expect(panelCxc).not.toContain("Quitar favorito");
    expect(panelCxc).not.toContain("isFavorite");
    expect(panelCxc).not.toContain("★");
    // CONTROL: la cabecera de la card sigue ahí, con su nombre.
    expect(cabeceraCxc()).toContain("{client.nombre_normalized}");
  });

  it("el nombre gana con tracking-tight, no bajando de 12px", () => {
    expect(panelCxc).toContain("text-[12px] font-medium leading-5 tracking-tight");
    // Piso duro: ningún text-[Npx] por debajo de 12 en el nombre.
    const px = [...panelCxc.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => parseFloat(m[1]));
    expect(px.filter((p) => p < 12)).toHaveLength(0);
  });
});

/**
 * 30-jul-2026 — EL LAYOUT DE ESTE BLOQUE NO CAMBIÓ; CAMBIÓ EL ANCHO EN QUE
 * ARRANCA. Los chips siguen bajando a la línea 2 y la columna de quincena
 * sigue sin ocupar ancho cuando la fila es angosta: lo único que se movió es
 * el corte, de `sm` (640) a `lg` (1024).
 *
 * 🩸 EL CORTE ESTABA DESALINEADO CON LA BARRA LATERAL. Las columnas de
 * progreso (w-36) y quincena (w-24) se encendían en 640 px, pero la barra
 * lateral entra en 768 (`md:ml-56`) y se lleva **224 px**. Entre 768 y 1023
 * pasan las dos cosas a la vez —240 px de columnas nuevas Y 224 px menos de
 * ancho— y el nombre, único elástico de la fila, se queda con las sobras.
 *
 * MEDIDO en el navegador con los 12 nombres REALES de la base
 * (`scripts/_medir-prestamos-nombre.mjs`), nombres cortados:
 *
 *              390     834     1024    1440
 *   antes       0      11/12     0       0
 *   después     0        0       0       0
 *
 * El peor era "MARIA BETHANCOURTH": pedía 184 px y a 834 le caían **105**
 * (−79). Ahora le caben 382. A 1024 y 1440 no cambió nada — ahí el corte ya
 * estaba encendido y el nombre entraba con 300 y 652 px de aire. **El
 * escritorio no se tocó.**
 *
 * El `truncate` se QUEDA: es el mecanismo correcto para un nombre que no
 * entra. Lo que estaba mal era que no entrara.
 */
describe("Préstamos — los chips bajan a la línea 2 en mobile y iPad", () => {
  it("la columna de quincena solo existe desde lg (en iPhone y iPad no ocupa ancho)", () => {
    expect(prestamos).toContain('<div className="hidden shrink-0 text-center lg:block lg:w-24">');
    // La versión vieja ocupaba ~86-90px SIEMPRE, incluso en 358px de fila.
    expect(prestamos).not.toContain('<div className="shrink-0 text-center sm:w-24">');
    // Y la de `sm` la encendía a 640, con la barra lateral ya comiendo 224px.
    expect(prestamos).not.toContain('text-center sm:block sm:w-24');
  });

  it("en mobile y iPad el chip viaja a la línea de la empresa con su TEXTO completo", () => {
    expect(prestamos).toContain('<div className="flex shrink-0 items-center gap-1.5 lg:hidden">{badges}{chipQuincena}</div>');
    // Los dos estados se siguen leyendo: el color solo no los distingue.
    expect(prestamos).toContain("✓ Deducida");
    expect(prestamos).toContain("⚠ Pendiente");
  });

  it("los badges de estado se declaran UNA vez y se renderizan en ambos layouts", () => {
    expect(prestamos).toContain("const badges = [");
    expect(prestamos).toContain("const chipQuincena =");
    // Desktop: en la línea 1, junto al nombre (como siempre).
    expect(prestamos).toContain('<div className="hidden shrink-0 items-center gap-2 lg:flex">{badges}</div>');
  });

  it("el gap de la fila baja a 2 en mobile y deja sm:gap-4 intacto", () => {
    expect(prestamos).toContain("flex items-center gap-2 sm:gap-4 rounded-lg border p-3 sm:px-4");
  });

  it("el nombre usa tracking-tight (sin bajar el cuerpo de la letra)", () => {
    expect(prestamos).toContain('<span data-empleado-campo="nombre" className="font-medium truncate tracking-tight">{emp.nombre}</span>');
  });

  it("el saldo y el menú de acciones no se tocaron", () => {
    expect(prestamos).toContain('<div className="shrink-0 text-right min-w-[72px]">');
    expect(prestamos).toContain("<OverflowMenu");
  });
});

describe("Vista General — el subtítulo del KPI envuelve, no se corta", () => {
  it("el contenedor del subtítulo ya no lleva truncate", () => {
    // Con truncate se perdía justo el "(parcial)" de
    // "▼ 20.3% vs julio 2025 (parcial)" — el aviso de que la comparación
    // está incompleta. Peor que una tarjeta 18px más alta.
    expect(vistaGeneral).toContain('<div className="text-xs mt-1 tabular-nums min-h-[2rem] sm:min-h-0">');
    expect(vistaGeneral).not.toContain('<div className="text-xs mt-1 tabular-nums truncate">');
  });

  it("el texto del subtítulo de Ventas dice contra qué compara el mes en curso", () => {
    // CAMBIÓ DE DIRECCIÓN el 3-sep-2026: «(parcial)» avisaba que la comparación
    // era contra el mes ENTERO del año pasado. Ahora el mes en curso compara
    // contra los MISMOS DÍAS y el subtítulo lo dice con las fechas
    // («vs 1–3 sep 2025»); «(parcial)» queda solo para cuando esa lectura
    // falló y no hay fechas que decir.
    expect(vistaGeneral).toContain("ventas.parcial && ventas.prevHasta ? `1–${fechaCorta(ventas.prevHasta)}");
    expect(vistaGeneral).toContain('{ventas.parcial && !ventas.prevHasta ? " (parcial)" : ""}');
  });

  it("min-h reserva 2 líneas solo en mobile (desktop queda como estaba)", () => {
    const i = vistaGeneral.indexOf('className="text-xs mt-1 tabular-nums min-h-[2rem]');
    expect(vistaGeneral.slice(i, i + 80)).toContain("sm:min-h-0");
  });
});

describe("SyncNowButton — 44px de alto en las 4 pantallas donde aparece", () => {
  it("el botón llega a 44px", () => {
    // Medía 147.3x32 en /admin, /ventas, /proveedores y /clientes.
    expect(syncNow).toContain("inline-flex min-h-[44px] items-center");
    expect(syncNow).not.toContain('className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5');
  });
});
