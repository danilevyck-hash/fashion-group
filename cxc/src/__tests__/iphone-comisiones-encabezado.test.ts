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
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf-8");

const page = leer("app/comisiones/ComisionesPageClient.tsx");
const shell = leer("components/ventas/ComisionesView.tsx");
const criterios = leer("components/ventas/ComisionesCriterios.tsx");
const periodo = leer("components/ventas/ComisionesPeriodo.tsx");
const consolidado = leer("components/ventas/ComisionesConsolidadoView.tsx");
const porEmpresa = leer("components/ventas/ComisionesPorEmpresaView.tsx");
const tarjetas = leer("components/ventas/ComisionesTarjetas.tsx");

/** Techo acordado: el primer número tiene que verse en la primera pantalla. */
const PRESUPUESTO_PX = 200;

/** Medidos en el navegador — no dependen de este código. */
const ALTO_APPHEADER_MOVIL = 45; // barra sticky de la app en 390px
const ALTO_THEAD_TABLA = 34.5; // encabezado de columnas de la tabla
const BORDE_CARD = 1;

/** Alto táctil mínimo de la casa. */
const TARGET_MIN = 44;

/** Escala de espaciado de Tailwind: `pt-2` = 8px, `space-y-1.5` = 6px, … */
const escala = (n: number) => n * 4;

/** Lee el número de una clase de espaciado (pt-2 → 2). */
function claseEspaciado(src: string, re: RegExp): number {
  const m = src.match(re);
  expect(m, `no encontré ${re} — ¿cambió la estructura del encabezado?`).toBeTruthy();
  return parseFloat(m![1]);
}

/** El padding de arriba de <main> EN MÓVIL (ignora los `md:` de escritorio). */
function padTopMovil(): number {
  const cls = page.match(/<main className="([^"]*)"/);
  expect(cls, "no encontré el <main> de /comisiones").toBeTruthy();
  const clases = cls![1].split(/\s+/).filter((c) => !c.includes(":")); // sin breakpoints
  const pt = clases.find((c) => /^pt-\d/.test(c));
  const py = clases.find((c) => /^py-\d/.test(c));
  const usada = pt ?? py;
  expect(usada, `<main> sin padding de arriba en móvil: ${cls![1]}`).toBeTruthy();
  return escala(parseFloat(usada!.split("-")[1]));
}

/** El bloque JSX de la barra de controles (hasta que arranca la vista hija). */
function barraDeControles(): string {
  const i = shell.indexOf('<div className="space-y-2">');
  const j = shell.indexOf('{mode === "todas"', i);
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return shell.slice(i, j);
}

describe("Comisiones — el encabezado entra en la primera pantalla del iPhone", () => {
  it("la barra de controles tiene DOS filas, ni una más", () => {
    // Cada fila es un <div className="flex …"> hijo directo de la barra. Los
    // botones de adentro usan template literals o `inline-flex`, así que no
    // cuentan. Una tercera fila rompe el presupuesto de 200px.
    const filas = [...barraDeControles().matchAll(/<div className="flex /g)];
    expect(filas).toHaveLength(2);
  });

  it("las dos filas miden 44px (mínimo táctil) y nada más", () => {
    const barra = barraDeControles();
    // Ningún alto fijo mayor que el target mínimo escondido en la barra.
    expect(barra).not.toMatch(/(?<!min-)h-\[\d+px\]/);
    expect(barra).not.toMatch(/\bpy-\d/); // el alto lo da min-h-[44px], no padding
  });

  it("la cuenta del encabezado da menos de 200px en 390px de ancho", () => {
    const padTop = padTopMovil();
    const separacion = escala(claseEspaciado(shell, /<div className="space-y-(\d+(?:\.\d+)?)">/));
    const filas = [...barraDeControles().matchAll(/<div className="flex /g)].length;

    // <main pt> + (filas × 44) + (separación entre filas y antes de la tabla)
    const alto =
      ALTO_APPHEADER_MOVIL +
      padTop +
      filas * TARGET_MIN +
      filas * separacion +
      BORDE_CARD +
      ALTO_THEAD_TABLA;

    // 45 + 8 + 88 + 16 + 1 + 34.5 = 192.5 (medido en el navegador: 193.5).
    expect(alto).toBeLessThan(PRESUPUESTO_PX);
  });

  it("no volvió el título grande (lo dicen el header sticky y el breadcrumb)", () => {
    expect(page).not.toMatch(/<h1/);
    expect(page).not.toContain("font-display");
    expect(page).not.toContain("text-3xl");
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
    expect(consolidado).toContain('className="px-2 py-2 text-right font-medium xl:whitespace-nowrap xl:px-3"');
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

  it("el total del mes va ABAJO, donde estaba el tfoot", () => {
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

describe("Comisiones — lo que Daniel usa sigue a un toque", () => {
  it("el interruptor Todas / Por empresa conserva sus dos etiquetas", () => {
    expect(shell).toContain('"Todas las empresas"');
    expect(shell).toContain('"Por empresa"');
  });

  it("mes y año son UN control, no dos cajas sueltas", () => {
    expect(shell).toContain("<ComisionesPeriodo");
    // El shell ya no arma selectores de mes/año por su cuenta.
    expect(shell).not.toContain("@/components/ui/select");
    expect(shell).not.toContain("SelectTrigger");
  });

  it("'Actualizar ahora' y Excel viven en la barra, no en una fila propia", () => {
    const barra = barraDeControles();
    expect(barra).toContain("<SyncNowButton");
    expect(barra).toContain("Excel");
    // Las vistas hijas ya no dibujan su propio botón Excel (era una fila de
    // 44px + 16px de separación, solo para él).
    expect(consolidado).not.toContain("FileSpreadsheet");
    expect(porEmpresa).not.toContain("FileSpreadsheet");
    // …pero SIGUEN siendo las dueñas del cálculo del Excel.
    expect(consolidado).toContain("exportComisionesConsolidado");
    expect(consolidado).toContain("onExcel?.(");
    expect(porEmpresa).toContain("exportComisionesResumen");
    expect(porEmpresa).toContain("onExcel?.(");
  });
});

describe("Comisiones — Criterios y la fecha de sincronizado NO se borraron", () => {
  it("el texto de los criterios está intacto (explica un cálculo de plata)", () => {
    expect(criterios).toContain("facturas con utilidad &gt;20% menos notas de crédito");
    expect(criterios).toContain("excluyendo retenciones de ITBMS");
    expect(criterios).toContain("Fuente: reportes de Switch");
  });

  it("Criterios vive en un ⓘ que cerrado no ocupa alto propio", () => {
    // El panel es un popover absoluto: no empuja a la tabla hacia abajo.
    expect(criterios).toContain("absolute right-0 top-full");
    expect(criterios).not.toContain("w-full items-center gap-2 px-3 py-2 text-left"); // el acordeón viejo
    expect(barraDeControles()).toContain("<ComisionesCriterios");
  });

  it("la frescura del dato sigue en pantalla, adentro del mismo ⓘ", () => {
    expect(shell).toContain("<SyncStatus");
    expect(shell).toContain('prefix="Sincronizado"');
    // Y si alguna empresa quedó sin actualizar, el ⓘ lo avisa sin abrirlo.
    expect(shell).toContain("onStale={setSyncStale}");
    expect(criterios).toContain("bg-amber-500");
  });
});

describe("Comisiones — 44px al tacto y cero scroll lateral en iPhone", () => {
  const archivos: [string, string][] = [
    ["shell", shell],
    ["criterios", criterios],
    ["período", periodo],
    // Las tarjetas del celular son la superficie que se TOCA en el iPhone:
    // abren el detalle por empresa y despliegan la matriz. Sin esta línea, el
    // 44px quedaba cubierto solo en el encabezado.
    ["tarjetas", tarjetas],
  ];

  it.each(archivos)("todo lo tocable de %s llega a 44px", (_nombre, src) => {
    // Cada <button> del encabezado declara min-h-[44px] o h-11 en su className.
    // (No se puede cortar la etiqueta en el primer ">": las flechas de las
    // arrow functions tienen uno.)
    const botones = src
      .split("<button")
      .slice(1)
      .map((c) => {
        const hasta = c.indexOf("</button");
        return hasta > -1 ? c.slice(0, hasta) : c;
      });
    expect(botones.length).toBeGreaterThan(0);
    for (const b of botones) {
      const clases = b.match(/className=(?:"([^"]*)"|\{`([\s\S]*?)`\})/);
      expect(clases, b.slice(0, 160)).toBeTruthy();
      const valor = clases![1] ?? clases![2];
      expect(valor, valor).toMatch(/min-h-\[44px\]|h-11/);
    }
  });

  it("el ⓘ llega a 44px de ANCHO aunque solo muestre el ícono", () => {
    expect(criterios).toContain("min-w-[44px]");
  });

  it("el control de período mide igual en mayo que en julio", () => {
    // "May 2026" es 8.6px más ancho que "Jul 2026" (medido con la fuente real).
    // Con ancho automático eso alcanzaba para que "Actualizar ahora" se
    // partiera en dos líneas y el encabezado creciera 6px. Ancho fijo en
    // iPhone + mes abreviado = la fila mide lo mismo los 12 meses del año.
    expect(periodo).toContain("w-[110px]");
    expect(periodo).toContain("MESES_CORTOS[mes - 1]");
  });

  it("los controles no se comprimen; si algún día no entran, bajan de línea", () => {
    // flex-wrap es el modo de fallar bueno: nunca saca la página para el
    // costado. shrink-0 evita que un control se achique y parta su texto.
    const barra = barraDeControles();
    expect(barra).toContain("flex flex-wrap items-center");
    // Se verifica lo que IMPORTA (que el botón no se comprima), no el formato
    // exacto del JSX: fijarlo a una línea hizo fallar este test cuando el botón
    // ganó `onSuccess`, que no tiene nada que ver con el layout.
    const boton = /<SyncNowButton[\s\S]*?\/>/.exec(barra)?.[0] ?? "";
    expect(boton).toContain("SYNC_NOW_RECIBOS_OPCIONES");
    expect(boton).toContain('className="shrink-0"');
    expect(periodo).toContain("shrink-0");
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
      path.join(process.cwd(), "src/components/ventas/ComisionesView.tsx"),
      "utf8",
    );
    expect(vista).toContain("onSuccess={() => setRefreshKey((k) => k + 1)}");
    expect(vista).toContain("refreshKey={refreshKey}");
  });

  it("y las dos vistas hijas vuelven a pedir los datos", () => {
    for (const f of [
      "src/components/ventas/ComisionesPorEmpresaView.tsx",
      "src/components/ventas/ComisionesConsolidadoView.tsx",
    ]) {
      const src = readFileSync(path.join(process.cwd(), f), "utf8");
      expect(src, f).toContain("refreshKey");
      // El contador tiene que estar en las dependencias, si no no dispara nada.
      expect(src, `${f}: refreshKey no está en las deps`).toMatch(/\}, \[[^\]]*refreshKey\]\)/);
    }
  });
});
