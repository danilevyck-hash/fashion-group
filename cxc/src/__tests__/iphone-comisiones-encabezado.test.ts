// ─────────────────────────────────────────────────────────────────────────────
// iPhone 390×844 — el encabezado de /comisiones (jul-2026).
//
// PROBLEMA MEDIDO (navegador real, build de producción, datos de producción):
// del borde de arriba al primer número de comisión había **480.5px**, el 57%
// de la pantalla. Con el área útil real de Safari (~664px) se veían 4 de 6
// vendedores. Eran cuatro bloques apilados: título grande, fila de 5 controles,
// acordeón "Criterios" y una fila entera solo para el botón Excel.
//
// DESPUÉS: **193.5px** y los 6 vendedores en la primera pantalla. Escritorio
// 378.5 → 223.5px.
//
// ── ACTUALIZACIÓN 30-jul-2026 (#365, tarjetas en el celular) ──────────────────
// La tabla de 7 columnas pasó a TARJETAS bajo `md` (ver ComisionesTarjetas.tsx),
// así que en el iPhone ya no hay `<thead>` sobre el primer número. Medido de
// nuevo en el navegador: **113px** en "Todas las empresas" y **165px** en "Por
// empresa" (esa suma la fila del selector de empresa), con los 5 vendedores +
// el total del mes en la primera pantalla de Safari. La cuenta de abajo NO se
// aflojó: sigue incluyendo los 34.5px del encabezado de la tabla, así que el
// presupuesto de 200px es ahora un techo con MÁS aire, no menos. El límite que
// congela este test es el de la BARRA DE CONTROLES, que es lo único que este
// código gobierna en los dos layouts.
//
// Este test CONGELA ese logro. No renderiza (vitest no tiene layout): reconstruye
// el alto a partir de lo que dice la FUENTE — el padding de <main>, la
// separación entre filas y cuántas filas tiene la barra — más las dos piezas
// que ya se midieron en el navegador y no dependen de este código (el header
// sticky de la app y el encabezado de la tabla). Si alguien agrega una fila,
// engorda el padding o devuelve el título grande, la cuenta pasa de 200px y el
// build se pone ROJO.
//
// Mismo patrón que iphone-targets-*.test.ts: se protege una clase concreta de
// Tailwind, no un render.
//
// Verificación en navegador: `node scripts/_medir-comisiones-encabezado.mjs`
// (solo lectura; ver los gotchas en su encabezado).
//
// ── 🔄 6-oct-2026 · RE-APUNTADO A LA v2 («como Apple») ────────────────────────
// Daniel aprobó `COMISIONES_APPLE_V2_2026_10` (prendido hoy). Lo que este
// candado cuida NO cambia —el primer número en la primera pantalla, controles de
// 44 px, cero scroll lateral, «Actualizar» que recarga—, pero la forma sí:
//   · el primer número ES el total a pagar, el número grande (la clase de
//     Ventas y CxC), debajo de UNA fila de empresa y mes: el presupuesto se
//     cumple por construcción y lo que se congela es que no nazca otra fila;
//   · la computadora tiene UNA fila de controles (empresa · período · Descargar
//     ▾ · ⚙) y el ⓘ de criterios vive en la línea del pie;
//   · ya no hay barra negra al pie que el ☰ tape.
// La pantalla de antes sigue en el código con el interruptor en `false`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { COMISIONES_APPLE_V2_2026_10 } from "@/lib/comisiones/apple-v2";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");

const page = leer("app/comisiones/ComisionesPageClient.tsx");
const shell = leer("components/comisiones/ComisionesView.tsx");
const computadora = leer("components/comisiones/ComisionesComputadoraV2.tsx");
const portada = leer("components/comisiones/celular/PortadaComisionesCelular.tsx");
const criterios = leer("components/comisiones/ComisionesCriterios.tsx");
const periodo = leer("components/comisiones/ComisionesPeriodo.tsx");
const consolidado = leer("components/comisiones/ComisionesConsolidadoView.tsx");
const porEmpresa = leer("components/comisiones/ComisionesPorEmpresaView.tsx");
const tarjetas = leer("components/comisiones/ComisionesTarjetas.tsx");

/** El bloque de la fila de controles de la computadora v2 (hasta el aviso de rechazos). */
function filaDeLaComputadora(): string {
  const i = computadora.indexOf('<div data-comisiones-v2');
  const j = computadora.indexOf("<AvisoRechazosSwitch", i);
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return computadora.slice(i, j);
}

describe("Comisiones v2 — el total es el primer número de la pantalla", () => {
  it("la v2 está prendida (Daniel, 6-oct-2026) y es la que se monta", () => {
    expect(COMISIONES_APPLE_V2_2026_10).toBe(true);
    expect(shell).toContain("v2 = COMISIONES_APPLE_V2_2026_10");
  });

  it("celular: título, UNA fila de empresa y mes, y enseguida el número grande", () => {
    const fila = portada.indexOf("data-mes-celular");
    const numero = portada.indexOf("data-numero-comisiones");
    const lista = portada.indexOf("{children}");
    expect(fila).toBeGreaterThan(-1);
    expect(numero).toBeGreaterThan(fila);
    expect(lista).toBeGreaterThan(numero);
    // Entre la fila del mes y el número no nace otra fila de controles.
    const entre = portada.slice(fila, numero);
    expect(entre.match(/<div className="mt-3 flex/g) ?? []).toHaveLength(0);
    // La cifra de Ventas y CxC (36 px, peso normal), no una negrita.
    expect(portada).toContain("CLASE_TOTAL_CELULAR");
  });

  it("computadora: UNA fila de controles y debajo el número grande", () => {
    const fila = filaDeLaComputadora();
    expect(fila.match(/<div className="flex flex-wrap items-center/g) ?? []).toHaveLength(1);
    expect(computadora.indexOf("data-numero-comisiones")).toBeGreaterThan(computadora.indexOf("<AvisoRechazosSwitch"));
    expect(computadora.indexOf("data-numero-comisiones")).toBeLessThan(computadora.indexOf("{children}"));
  });

  it("no volvió el título grande de la página (lo dicen la portada y el breadcrumb)", () => {
    expect(page).not.toMatch(/<h1/);
    expect(page).not.toContain("font-display");
    expect(page).not.toContain("text-3xl");
  });

  it("🔴 no hay barra negra al pie: las filas v2 no dibujan el total", () => {
    const v2 = tarjetas.slice(tarjetas.indexOf("function FilasConsolidadoV2"));
    expect(v2).not.toContain("<TarjetaTotal");
    expect(shell).toContain("totalArriba={enCelular || v2}");
  });
});


/**
 * CANDADO del #365 — en el celular la tabla de Comisiones no se arrastra.
 *
 * 🩸 MEDIDO en el navegador el 30-jul-2026 a 390px (build de producción, datos
 * de producción, `node scripts/_medir-comisiones-tabla.mjs`):
 *
 *   Todas las empresas ... 7 columnas, 984px de contenido en 356px útiles →
 *        **628px de arrastre lateral**. La columna Total —la que se va a mirar—
 *        quedaba fuera de la pantalla.
 *   Por empresa .......... 6 columnas, 636px, y NI SIQUIERA arrastraba: el
 *        `Card` de arriba tiene `overflow-hidden`, así que **279px quedaban
 *        RECORTADOS** y "Com. cobro" y "Com. total" no se podían ver de ninguna
 *        manera. Peor que el scroll: invisible y sin aviso.
 *
 *   DESPUÉS: **0 px en los dos modos.**
 *
 * ── SEGUNDA VUELTA (#367, 30-jul-2026): los CINCO anchos en 0 ────────────────
 * Daniel fijó la regla general: *"todo tiene q estar hecho para ipad iphone y
 * desktop"*. El #365 dejó el iPhone en 0 pero el iPad seguía arrastrando, así
 * que se midieron los dos iPad en sus dos orientaciones. Ancho ÚTIL real
 * (dentro de la tarjeta, ya descontada la barra lateral):
 *
 *   viewport   útil   "Todas" antes   "Por empresa" antes   ahora
 *   390 px     356    628 arrastre    279 RECORTADOS        0 · 0
 *   834 px     552    432 arrastre     84 arrastre          0 · 0
 *   1024 px    742    242 arrastre      0                   0 · 0
 *   1180 px    898     86 arrastre      0                   0 · 0
 *   1440 px   1158      0               0                   0 · 0
 *
 * **A 834px la tabla es IMPOSIBLE, y eso decidió el corte.** Los datos de las 7
 * columnas —puro texto, sin un píxel de relleno y sin encabezados— miden 554px
 * contra 552 disponibles: no entra ni en el mejor caso concebible. Por eso las
 * tarjetas suben de `md` (768) a **`lg` (1024)**.
 * De 1024 para arriba la tabla SÍ entra, y ahí se la hizo entrar en vez de
 * mandar 7 tarjetas a una pantalla ancha: los encabezados de empresa dejan de
 * forzar su ancho bajo `xl` y el relleno pasa de px-3/px-4 a px-2/px-3.
 * min-content 984 → **650**, con **92px de holgura a 1024** (alcanza para que
 * las 5 comisiones pasen a 6 cifras y siga entrando). **≥xl no se tocó:**
 * min-content 985 y holgura 173px a 1440, igual que antes.
 */
describe("Comisiones — la tabla ancha son TARJETAS bajo lg", () => {
  it("las dos vistas montan las tarjetas y esconden su tabla bajo lg", () => {
    for (const [nombre, src] of [
      ["consolidado", consolidado],
      ["por empresa", porEmpresa],
    ] as const) {
      // La tabla vive dentro de un Card que solo aparece en ≥lg.
      expect(src, nombre).toMatch(/className="hidden [^"]*lg:block"/);
      expect(src, nombre).toContain("<ComisionesTarjetas");
    }
    // Y las tarjetas son del celular Y del iPad vertical.
    expect(tarjetas).toContain("lg:hidden");
    // `md` dejaría la tabla imposible de 834px en pantalla: 554px de datos
    // pelados contra 552px útiles. Medido, no estimado.
    expect(tarjetas).not.toContain("md:hidden");
  });

  it("el escritorio (≥xl) conserva el ancho de siempre; lo que se aprieta es el iPad", () => {
    // El ajuste que hace entrar la tabla a 1024/1180 va SOLO bajo `xl` (1280).
    // A 1440 el min-content sigue siendo 985px, idéntico al de antes del PR.
    // Encabezados de empresa: nowrap sólo en xl.
    // (6-oct-2026: el encabezado es `ThOrden derecha`, que pone el text-right.)
    expect(consolidado).toContain('derecha className="px-2 py-2 font-medium xl:whitespace-nowrap xl:px-3"');
    // Nombre del vendedor: en xl vuelve a una sola línea.
    expect(consolidado).toMatch(/xl:whitespace-nowrap xl:px-4/);
    // Y no puede quedar ningún `whitespace-nowrap` incondicional en la tabla:
    // sería el que vuelve a empujar el min-content a 984.
    const cuerpoTabla = consolidado.slice(consolidado.indexOf("<thead>"));
    expect(cuerpoTabla).not.toMatch(/className="[^"]*\bwhitespace-nowrap\b(?![^"]*xl:)/);
    // Las dos tablas recuperan su relleno de escritorio en xl.
    for (const [nombre, src] of [
      ["consolidado", consolidado],
      ["por empresa", porEmpresa],
    ] as const) {
      expect(src, nombre).toContain("xl:px-4");
    }
  });

  it("ninguna tabla queda dentro de un overflow-hidden sin poder arrastrarse", () => {
    // Un `Card` con `overflow-hidden` recorta sin dejar arrastrar: lo que
    // sobresale se vuelve INALCANZABLE. Cada tabla necesita su propio
    // `overflow-x-auto` en el medio.
    for (const [nombre, src] of [
      ["consolidado", consolidado],
      ["por empresa", porEmpresa],
    ] as const) {
      const i = src.indexOf('<div className="overflow-x-auto">');
      const j = src.indexOf('<table className="w-full text-sm">');
      expect(i, `${nombre}: la tabla no tiene un overflow-x-auto propio`).toBeGreaterThan(-1);
      expect(j, `${nombre}: no encontré la tabla`).toBeGreaterThan(i);
    }
  });

  it("las tarjetas usan el MISMO formateador que la tabla — ningún número cambia", () => {
    // fmtMoney, no el compacto: una comisión es plata que se le paga a alguien,
    // así que van los centavos, igual que en la tabla y en el Excel.
    expect(tarjetas).toContain('import { fmtMoney } from "@/lib/ventas/format"');
    expect(tarjetas).not.toContain("formatCompactCurrency");
  });

  // 🔄 6-oct-2026: con la v2 el total va ARRIBA (bloque de arriba); esto cuida
  // la pantalla de antes, que sigue detrás del interruptor apagado.
  it("sin la v2, el total del mes va ABAJO, donde estaba el tfoot", () => {
    // Un "hero" arriba empujaría la primera fila y se comería el encabezado de
    // 193px que costó ganar. Las tarjetas arrancan pegadas a la barra.
    const iTotal = tarjetas.indexOf("function TarjetaTotal");
    expect(iTotal).toBeGreaterThan(-1);
    for (const fn of ["ComisionesTarjetasConsolidado", "ComisionesTarjetasPorEmpresa"]) {
      const cuerpo = tarjetas.slice(tarjetas.indexOf(`export function ${fn}`));
      const fin = cuerpo.indexOf("</ListaTarjetas>");
      const dentro = cuerpo.slice(0, fin);
      // <TarjetaTotal> es lo ÚLTIMO de la lista.
      expect(dentro.indexOf("<TarjetaTotal"), fn).toBeGreaterThan(
        dentro.lastIndexOf("map("),
      );
    }
  });

  it("el mecanismo de las tarjetas vive en UN archivo, no uno por vista", () => {
    // Las dos vistas lo importan del mismo módulo; ninguna dibuja su propia
    // <article> de tarjeta.
    for (const [nombre, src] of [
      ["consolidado", consolidado],
      ["por empresa", porEmpresa],
    ] as const) {
      expect(src, nombre).toContain('from "./ComisionesTarjetas"');
      expect(src, nombre).not.toContain("<article");
    }
  });
});

describe("Comisiones v2 — lo que Daniel usa sigue a un toque", () => {
  it("UN selector de empresa y el ⚙, sin pestañas", () => {
    const fila = filaDeLaComputadora();
    expect(fila).toContain("<SelectTrigger");
    expect(fila).toContain('aria-label="Configuración"');
    expect(shell).toContain("OPCIONES_VISTA");
    for (const t of ['"Todas las empresas"', '"Por empresa"', '"Multifashion"']) expect(shell).not.toContain(t);
  });

  it("el período es UN control, con Rango", () => {
    expect(filaDeLaComputadora()).toContain("<ComisionesPeriodo");
    expect(filaDeLaComputadora()).toContain("onRango={onRango}");
  });

  it("🔴 UN «Descargar» en la computadora y en el celular", () => {
    const fila = filaDeLaComputadora();
    expect(fila.match(/<MenuDescargaComision/g) ?? []).toHaveLength(1);
    expect(fila).toContain("rotulo={ROTULO_DESCARGAR_V2}");
    expect(computadora).not.toContain("rotuloDescargarPdf");
    expect(portada).toContain("onClick={() => setDescarga(true)}");
    // Las vistas hijas siguen siendo dueñas del cálculo del papel.
    expect(consolidado).toContain("exportComisionesConsolidado");
    expect(porEmpresa).toContain("exportComisionesResumen");
  });
});

describe("Comisiones v2 — Criterios y la frescura NO se borraron", () => {
  it("el texto de los criterios está intacto", () => {
    expect(criterios).toContain("facturas con utilidad &gt;20% menos notas de crédito");
    expect(criterios).toContain("excluyendo retenciones de ITBMS");
  });

  it("el ⓘ vive en la línea del pie, con la frescura por empresa y su punto ámbar", () => {
    const pie = computadora.slice(computadora.indexOf("export function PieComisionesV2"));
    expect(pie).toContain("<ComisionesCriterios aviso={syncStale}>");
    expect(pie).toContain("<SyncStatus");
    expect(pie).toContain("onStale={onStale}");
    expect(shell).toContain("<PieComisionesV2");
  });

  it("la frescura se ve sin abrir nada: la línea común, junto al número", () => {
    expect(computadora).toContain("<LineaDeFrescura");
    expect(portada).toContain("<LineaDeFrescura");
  });
});

describe("Comisiones v2 — 44px al tacto", () => {
  const archivos: [string, string][] = [
    ["computadora v2", computadora],
    ["criterios", criterios],
    ["período", periodo],
    ["tarjetas", tarjetas],
  ];

  it.each(archivos)("todo lo tocable de %s llega a 44px", (_nombre, src) => {
    const botones = src.split("<button").slice(1).map((c) => {
      const hasta = c.indexOf("</button");
      return hasta > -1 ? c.slice(0, hasta) : c;
    });
    expect(botones.length).toBeGreaterThan(0);
    for (const b of botones) {
      const clases = b.match(/className=(?:"([^"]*)"|\{`([\s\S]*?)`\})/);
      expect(clases, b.slice(0, 160)).toBeTruthy();
      expect(clases![1] ?? clases![2]).toMatch(/min-h-\[44px\]|h-11/);
    }
  });

  it("el control de período mide igual en mayo que en julio", () => {
    expect(periodo).toContain("w-[110px]");
    expect(periodo).toContain("etiquetaPeriodoCorta(year, mes)");
  });

  it("la fila de la computadora baja de línea antes que salirse", () => {
    expect(filaDeLaComputadora()).toContain("flex flex-wrap items-center");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// 🩸 "Actualizar ahora" tiene que RECARGAR lo que se ve.
//
// Daniel arregló el vendedor de unos clientes en Switch, tocó el botón en
// Comisiones, la base quedó correcta ($35.511,65 a REINALDO ESPINOSA) y la
// tabla siguió diciendo DEFAULT — con un toast ROJO que le aseguraba que "los
// datos están frescos". Eran frescos en la base y viejos en la pantalla.
//
// Dos defectos, los dos de raíz:
//   1. `onSuccess` era OPCIONAL y Comisiones no lo pasaba.
//   2. La rama "fresco" (cooldown) ni refrescaba ni era un éxito.
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 sincronizar y no refrescar es peor que no sincronizar", () => {
  const boton = readFileSync(
    path.join(process.cwd(), "src/components/shared/SyncNowButton.tsx"),
    "utf8",
  );

  it("onSuccess es OBLIGATORIO — que lo cace el compilador", () => {
    // Con `?` había 12 usos y 8 sin recarga. Ninguno se iba a notar hasta que
    // alguien mirara una cifra que no cambiaba.
    expect(boton).toContain("onSuccess: () => void | Promise<void>;");
    expect(boton).not.toContain("onSuccess?: ()");
    expect(boton).toContain("await onSuccess();");
  });

  it('"ya está fresco" REFRESCA la vista y NO es un error', () => {
    const rama = /r\.tipo === "fresco"[\s\S]*?\} else \{/.exec(boton)?.[0] ?? "";
    expect(rama).toContain("await refrescarVista()");
    expect(rama).toContain("showToast(r.detalle, false)"); // false = verde, 3s
    expect(rama).not.toContain("showToast(r.detalle, true)");
  });

  it("Comisiones recarga la tabla al terminar", () => {
    const vista = readFileSync(
      path.join(process.cwd(), "src/components/comisiones/ComisionesView.tsx"),
      "utf8",
    );
    expect(vista).toContain("onSuccess={() => setRefreshKey((k) => k + 1)}");
    // v2: la línea de frescura de la computadora y del celular también recarga.
    expect(vista).toContain("onActualizado={() => setRefreshKey((k) => k + 1)}");
    expect(computadora).toContain("onSuccess={onActualizado}");
    expect(vista).toContain("refreshKey={refreshKey}");
  });

  it("y las dos vistas hijas vuelven a pedir los datos", () => {
    for (const f of [
      "src/components/comisiones/ComisionesPorEmpresaView.tsx",
      "src/components/comisiones/ComisionesConsolidadoView.tsx",
    ]) {
      const src = readFileSync(path.join(process.cwd(), f), "utf8");
      expect(src, f).toContain("refreshKey");
      // El contador tiene que estar en las dependencias, si no no dispara nada.
      expect(src, `${f}: refreshKey no está en las deps`).toMatch(/\}, \[[^\]]*refreshKey\]\)/);
    }
  });
});
