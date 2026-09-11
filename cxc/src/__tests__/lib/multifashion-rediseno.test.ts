// ─────────────────────────────────────────────────────────────────────────────
// CANDADOS DEL REDISEÑO DE MULTIFASHION (6-sep-2026).
//
// Daniel revisó las SEIS pantallas del escritorio y DIEZ del teléfono con sus
// propios ojos y decidió punto por punto. Lo que este archivo congela:
//
//   1. Cuatro pestañas (Metas adentro de Vendedoras · Caja fuera del menú).
//   2. «Multifashion» en todos lados — el título ya no dice «American Classics».
//   3. La venta de hoy en UNA línea.
//   4. UN control de tiempo por pestaña, con los meses, el año y 3/6/12 meses.
//   5. Vendedoras sin las seis píldoras, con el bono como COLUMNA y las metas
//      enteras abajo.
//   6. Clientes: la cobertura arriba, 10 filas al abrir, mayoreo vacío que no
//      aparece.
//   7. Los nombres capitalizados.
//   8. El año en las tarjetas; el desplegable «Panorama del año», retirado.
//   9. «Cuándo vende la tienda»: UNA sección, y cada línea dice de qué período
//      habla (día más fuerte y hora pico miran 3 meses).
//  10. La proyección dice sobre cuántos días está hecha.
//  11. El encabezado del teléfono en tres bloques.
//  12. Las vendedoras con DOS códigos se juntan (migración pendiente).
//
// 🔴 NINGÚN NÚMERO SE MUEVE por este rediseño: lo único que cambia de valor es
// el ranking de Vendedoras cuando la migración del amarre corra, y ahí lo que
// cambia es cuántas FILAS hay, no la suma (ver el bloque 12).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const raiz = process.cwd();
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");
/** Los barridos borran los comentarios PRIMERO: un candado no se cumple a sí
 *  mismo con su propia explicación. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const sinComentariosSql = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");

import {
  PESTANAS_MULTIFASHION, SUBTAB_VIEJO_A_NUEVO, resolverTabMultifashion,
} from "@/lib/multifashion/pestanas";
import {
  TIPOS_POR_TAB, ajustarPeriodo, anioDelPeriodo, etiquetaPeriodo, mesDelPeriodo,
  opcionesPeriodo, periodoAUrl, periodoDesdeUrl, periodoPorDefecto, periodoSirve,
  type Periodo,
} from "@/lib/multifashion/periodo";
import {
  MESES_DEL_PATRON, ROTULO_ESTE_MES, ROTULO_VENTANA, agregarPatrones, mesesDeLaVentana,
} from "@/lib/multifashion/patrones";
import { FILAS_CLIENTES_AL_ABRIR, coberturaDeClientes } from "@/lib/multifashion/clientes-cobertura";
import { nombreEnPantalla } from "@/lib/multifashion/nombres";

const shell = leer("src/app/multifashion/MultifashionShell.tsx");
const view = leer("src/components/multifashion/MultifashionView.tsx");
const resumen = leer("src/components/multifashion/MultifashionResumenView.tsx");
const vendedoras = leer("src/components/multifashion/VendedorasSubtab.tsx");
const clientes = leer("src/components/multifashion/ClientesMultifashionSubtab.tsx");
const productos = leer("src/components/multifashion/ProductosSubtab.tsx");
const ventaHoy = leer("src/components/multifashion/VentaHoyCard.tsx");
const bonos = leer("src/components/multifashion/BonosSection.tsx");
const rutaVendedoras = leer("src/app/api/multifashion/vendedoras/route.ts");
const rutaBonos = leer("src/app/api/multifashion/bonos/route.ts");
const rutaDetalle = leer("src/app/api/multifashion/detalle-mensual/route.ts");
const migracion = leer("supabase/migrations/20261009120000_multifashion_vendedora_alias.sql");

// ═════════════════════════════════════════════════════════════════════════════
// 1. CUATRO PESTAÑAS
// ═════════════════════════════════════════════════════════════════════════════

describe("1 · seis pestañas → cuatro", () => {
  it("son exactamente Resumen · Vendedoras · Productos · Clientes", () => {
    expect(PESTANAS_MULTIFASHION.map((p) => p.id)).toEqual([
      "resumen", "vendedoras", "productos", "clientes",
    ]);
    expect(PESTANAS_MULTIFASHION.map((p) => p.label)).toEqual([
      "Resumen", "Vendedoras", "Productos", "Clientes",
    ]);
  });

  it("un `?subtab=` viejo redirige y NUNCA deja la pantalla en blanco", () => {
    // 🩸 Antes, `?subtab=cualquiercosa` no caía a ningún default: la tira de
    // pestañas quedaba sola, sin contenido.
    expect(resolverTabMultifashion("metas")).toEqual({ tab: "vendedoras", redirigido: true });
    expect(resolverTabMultifashion("caja")).toEqual({ tab: "resumen", redirigido: true });
    expect(resolverTabMultifashion("overview")).toEqual({ tab: "resumen", redirigido: true });
    expect(resolverTabMultifashion("mes")).toEqual({ tab: "resumen", redirigido: true });
    expect(resolverTabMultifashion("basura")).toEqual({ tab: "resumen", redirigido: true });
    expect(resolverTabMultifashion(null)).toEqual({ tab: "resumen", redirigido: false });
    expect(resolverTabMultifashion("clientes")).toEqual({ tab: "clientes", redirigido: false });
  });

  it("todo destino del mapa de redirección es una pestaña que existe", () => {
    const ids = PESTANAS_MULTIFASHION.map((p) => p.id);
    for (const destino of Object.values(SUBTAB_VIEJO_A_NUEVO)) {
      expect(ids).toContain(destino);
    }
  });

  it("🔴 CAJA se fue del MENÚ, pero su ruta y su caché NO se borran", () => {
    // Patrón `mayor_lineas`: se retira de la navegación, los datos se quedan.
    expect(view).not.toContain('value="caja"');
    expect(view).not.toContain("CajaSubtab");
    // La ruta sigue viva y el componente sigue existiendo.
    expect(() => leer("src/app/api/multifashion/caja/route.ts")).not.toThrow();
    expect(() => leer("src/components/multifashion/CajaSubtab.tsx")).not.toThrow();
    // Y ninguna migración puede dropear su caché.
    const migs = leer("src/lib/backup/tablas.ts");
    expect(migs).toContain("multifashion_caja_diaria");
  });

  it("⚠️ el argumento de retirarla es que NADIE LA USA, no que abra Switch", () => {
    // Ese argumento era falso: la pestaña tiene caché por día. Queda escrito
    // para que nadie lo repita.
    const pestanas = leer("src/lib/multifashion/pestanas.ts");
    expect(pestanas).toContain("8 días en toda su historia");
    expect(pestanas).toMatch(/NO que abra una sesión en Switch|no.*abra una sesión/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. EL NOMBRE
// ═════════════════════════════════════════════════════════════════════════════

describe("2 · «Multifashion» en todos lados", () => {
  it("el título de la pantalla ya no sale de `multi.tienda`", () => {
    // `app_settings.multifashion_tienda` vale «American Classics» y era lo que
    // se leía en el encabezado.
    expect(sinComentarios(shell)).not.toContain("multi?.tienda");
    expect(sinComentarios(shell)).not.toContain("multi.tienda");
    expect(shell).toContain('<h1 className="sr-only">Multifashion</h1>');
    expect(shell).toContain('<p className="text-sm font-medium text-gray-700">Multifashion</p>');
  });

  it("⚠️ la ruta y la clave interna NO se tocan", () => {
    expect(shell).toContain('moduleKey: "multifashion"');
    expect(shell).toContain('empresa: "american_classic"');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. LA VENTA DE HOY, EN UNA LÍNEA
// ═════════════════════════════════════════════════════════════════════════════

describe("3 · «Hoy» pasa de bloque a una línea", () => {
  it("sin ventas dice «sin ventas todavía» y no crece", () => {
    expect(ventaHoy).toContain("sin ventas todavía");
    expect(sinComentarios(ventaHoy)).not.toContain("Todavía no hay ventas hoy");
    // El bloque grande (text-3xl / text-4xl) solo puede existir con ventas.
    expect(sinComentarios(ventaHoy)).not.toContain("md:text-4xl");
  });

  it("🔴 la frescura sigue viajando SIEMPRE — el monto sin ella es media verdad", () => {
    const src = sinComentarios(ventaHoy);
    expect(src).toContain("no pudimos confirmar cuándo se actualizó");
    expect(src).toContain("sin actualizar desde las ");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. UN SOLO CONTROL DE TIEMPO
// ═════════════════════════════════════════════════════════════════════════════

describe("4 · un control de tiempo por pestaña", () => {
  const corte = { anio: 2026, mes: 9 };

  it("la URL guarda el período entero en UN parámetro y vuelve igual", () => {
    const casos: Periodo[] = [
      { tipo: "mes", anio: 2026, mes: 9 },
      { tipo: "anio", anio: 2025 },
      { tipo: "ultimos", n: 3 },
      { tipo: "ultimos", n: 12 },
    ];
    for (const p of casos) {
      expect(periodoDesdeUrl(periodoAUrl(p))).toEqual(p);
    }
    expect(periodoAUrl({ tipo: "mes", anio: 2026, mes: 9 })).toBe("2026-09");
    expect(periodoAUrl({ tipo: "anio", anio: 2026 })).toBe("2026");
    expect(periodoAUrl({ tipo: "ultimos", n: 6 })).toBe("u6");
  });

  it("la basura de la URL cae al default, nunca a un mes 13 ni a una pantalla vacía", () => {
    for (const basura of ["", "  ", "u7", "2026-13", "2026-00", "1999-05", "hola", "2026-9"]) {
      expect(periodoDesdeUrl(basura)).toBeNull();
    }
    expect(periodoPorDefecto(corte)).toEqual({ tipo: "mes", anio: 2026, mes: 9 });
  });

  it("🔴 cada pestaña ofrece SOLO lo que sabe servir", () => {
    // El Resumen es el detalle de UN mes; Productos consulta `periodo=mes|12m`.
    expect(TIPOS_POR_TAB.resumen).toEqual({ mes: true, anio: false, ventanas: [] });
    expect(TIPOS_POR_TAB.productos).toEqual({ mes: true, anio: false, ventanas: [12] });
    expect(TIPOS_POR_TAB.vendedoras.ventanas).toEqual([3, 6, 12]);
    expect(TIPOS_POR_TAB.clientes.ventanas).toEqual([3, 6, 12]);
    expect(periodoSirve("resumen", { tipo: "ultimos", n: 3 })).toBe(false);
    expect(periodoSirve("productos", { tipo: "ultimos", n: 6 })).toBe(false);
    expect(periodoSirve("productos", { tipo: "ultimos", n: 12 })).toBe(true);
    expect(periodoSirve("vendedoras", { tipo: "anio", anio: 2026 })).toBe(true);
  });

  it("🔴 un período que la pestaña no sirve cae a SU MES, no a otra cosa", () => {
    expect(ajustarPeriodo({ tipo: "ultimos", n: 3 }, "resumen", corte))
      .toEqual({ tipo: "mes", anio: 2026, mes: 9 });
    expect(ajustarPeriodo({ tipo: "anio", anio: 2025 }, "resumen", corte))
      .toEqual({ tipo: "mes", anio: 2025, mes: 12 });
    expect(ajustarPeriodo({ tipo: "anio", anio: 2026 }, "productos", corte))
      .toEqual({ tipo: "mes", anio: 2026, mes: 9 });
    // Lo que SÍ sirve pasa intacto.
    expect(ajustarPeriodo({ tipo: "ultimos", n: 12 }, "productos", corte))
      .toEqual({ tipo: "ultimos", n: 12 });
  });

  it("el desplegable NO ofrece meses del futuro", () => {
    const ops = opcionesPeriodo({ tab: "vendedoras", anios: [2026, 2025], corte });
    const valores = ops.map((o) => o.valor);
    expect(valores).toContain("2026-09");
    expect(valores).not.toContain("2026-10");
    expect(valores).toContain("2025-12");
    // Rangos primero, después los años del más nuevo al más viejo.
    expect(ops[0].grupo).toBe("Rangos");
    expect(valores.indexOf("2026-01")).toBeLessThan(valores.indexOf("2025-01"));
  });

  it("con meses conocidos no ofrece un mes en el que la tienda no vendió", () => {
    const ops = opcionesPeriodo({
      tab: "clientes", anios: [2024], corte: { anio: 2026, mes: 9 },
      mesesConDato: { 2024: [5, 6, 7] },
    });
    const valores = ops.map((o) => o.valor);
    expect(valores).toContain("2024-05");
    expect(valores).not.toContain("2024-01");
  });

  it("el rótulo dice el período con todas las letras", () => {
    expect(etiquetaPeriodo({ tipo: "mes", anio: 2026, mes: 9 })).toBe("Septiembre 2026");
    expect(etiquetaPeriodo({ tipo: "anio", anio: 2026 })).toBe("Todo el año 2026");
    expect(etiquetaPeriodo({ tipo: "ultimos", n: 3 })).toBe("Últimos 3 meses");
  });

  it("el año y el mes del período los deriva UNA función", () => {
    expect(anioDelPeriodo({ tipo: "ultimos", n: 12 }, corte)).toBe(2026);
    expect(anioDelPeriodo({ tipo: "anio", anio: 2024 }, corte)).toBe(2024);
    expect(mesDelPeriodo({ tipo: "anio", anio: 2026 }, corte)).toEqual({ anio: 2026, mes: 9 });
    expect(mesDelPeriodo({ tipo: "anio", anio: 2024 }, corte)).toEqual({ anio: 2024, mes: 12 });
  });

  it("🔴 el corte es el mes de PANAMÁ, no el del navegador", () => {
    expect(shell).toContain('from "@/lib/fecha-panama"');
    expect(sinComentarios(shell)).toContain("hoyPanama()");
  });

  it("se fueron los TRES controles viejos: año, flechas de mes y píldoras", () => {
    expect(sinComentarios(view)).not.toContain("ChevronLeft");
    expect(sinComentarios(view)).not.toContain("ChevronRight");
    expect(sinComentarios(view)).not.toContain("useUrlState");
    // El selector de AÑO del encabezado se fue: el año viaja dentro del período.
    expect(sinComentarios(shell)).not.toContain("setSelectedYear");
    // Productos ya no tiene sus dos píldoras.
    expect(sinComentarios(productos)).not.toContain("onPeriodoChange");
    // Clientes ya no tiene las suyas.
    expect(sinComentarios(clientes)).not.toContain("mfCliRango");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. VENDEDORAS
// ═════════════════════════════════════════════════════════════════════════════

describe("5 · Vendedoras", () => {
  it("el bono es una COLUMNA y dice «al cierre» mientras el mes no termine", () => {
    expect(vendedoras).toContain('const BONO_AL_CIERRE = "al cierre"');
    expect(vendedoras).toMatch(/>Bono<\/th>/);
    // Ya no es un recuadro de color a lo ancho.
    expect(sinComentarios(bonos)).not.toContain("bg-teal-50/50");
    expect(sinComentarios(bonos)).not.toContain("PendienteBanner");
  });

  it("⚠️ ni el monto ni la regla del bono se tocaron", () => {
    expect(bonos).toContain("Crecimiento ≥ 5% y < 10% → $50 · ≥ 10% → $100");
    expect(vendedoras).toContain('return "$50"');
  });

  it("las metas viven abajo, ENTERAS, y solo en el módulo (no en el espejo)", () => {
    expect(vendedoras).toContain("<MetasSubtab />");
    expect(vendedoras).toContain("<MetasEnVendedoras />");
    expect(vendedoras).toContain("conMetas &&");
    // Y el módulo se lo PASA — sin esto la pestaña queda sin metas y nadie avisa.
    expect(view).toContain("<VendedorasSubtab selectedYear={selectedYear} periodo={periodo} corte={corte} conMetas />");
  });

  it("🔴 el ESPEJO de Comisiones conserva sus seis píldoras (no se toca)", () => {
    const comisiones = leer("src/components/comisiones/ComisionesView.tsx");
    // ⚠️ CAMBIÓ DE DIRECCIÓN EL 11-SEP-2026, NO SE BORRÓ: el año es el ELEGIDO
    // en el shell (`year`), no el del arranque — en enero `inicial.year` abría
    // el ranking sobre el año pasado. Las píldoras propias siguen intactas.
    expect(comisiones).toContain("<VendedorasSubtab selectedYear={year} />");
    expect(comisiones).not.toContain("selectedYear={inicial.year}");
    expect(comisiones).not.toContain("conMetas");
    // Sin `periodo` la vista dibuja su control propio.
    expect(vendedoras).toContain("const conControlPropio = periodo == null");
    expect(vendedoras).toContain("conControlPropio && (");
  });

  it("⚠️ el rótulo de la Δ sigue saliendo de `vendedoras-rotulo`, no de un texto fijo", () => {
    const src = sinComentarios(vendedoras);
    expect(src).toContain("rotuloDeltaVendedoras(chip, rpcMes, year)");
    expect(src).toContain("notaComparacionVendedoras(");
    expect(src).not.toMatch(/"Δ vs año pasado"/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. CLIENTES
// ═════════════════════════════════════════════════════════════════════════════

describe("6 · Clientes", () => {
  it("la línea de cobertura se calcula, con los dos porcentajes y sin decimal", () => {
    // Agosto 2026, medido: 224 de 1.152 tiquetes · $14.287,83 de $53.148,61.
    const c = coberturaDeClientes({
      tickets_identificados: 224, tickets_anonimos: 928,
      ventas_identificadas: 14287.83, ventas_anonimas: 38860.78,
    });
    expect(c.pctTickets).toBe(19);
    expect(c.pctVentas).toBe(27);
    expect(c.texto).toBe("19% de los tiquetes con nombre — el 27% de la venta");
    expect(c.texto).not.toMatch(/\d+\.\d/);
  });

  it("🔴 sin tiquetes SE ABSTIENE — nunca «0% — 0%»", () => {
    const c = coberturaDeClientes({ tickets_identificados: 0, tickets_anonimos: 0 });
    expect(c.pctTickets).toBeNull();
    expect(c.texto).toBeNull();
    expect(coberturaDeClientes(null).texto).toBeNull();
  });

  it("la lista abre con 10 filas y ofrece «Ver los N»", () => {
    expect(FILAS_CLIENTES_AL_ABRIR).toBe(10);
    expect(clientes).toContain("filasAlAbrir={FILAS_CLIENTES_AL_ABRIR}");
    expect(clientes).toContain("Ver los {clientes.length}");
    // Y lo que se dibuja es el recorte, no la lista entera.
    expect(clientes).toContain("const visibles = recorta ? clientes.slice(0, filasAlAbrir) : clientes");
  });

  it("🔴 el bloque de mayoreo VACÍO no aparece", () => {
    expect(clientes).toContain("{(wholesale?.clientes.length ?? 0) > 0 && (");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. NOMBRES CAPITALIZADOS
// ═════════════════════════════════════════════════════════════════════════════

describe("7 · los nombres se capitalizan", () => {
  it("«MARIA APARICIO» se muestra «Maria Aparicio»", () => {
    expect(nombreEnPantalla("MARIA APARICIO")).toBe("Maria Aparicio");
    expect(nombreEnPantalla("Martin Montenegro")).toBe("Martin Montenegro");
    expect(nombreEnPantalla("YEISIBETH MUÑOZ")).toBe("Yeisibeth Muñoz");
    expect(nombreEnPantalla(null)).toBe("");
  });

  it("se REUSA la regla de Comisiones, no se escribe una segunda", () => {
    expect(leer("src/lib/multifashion/nombres.ts"))
      .toContain('from "@/lib/comisiones/alias"');
  });

  it("lo usan la tabla de vendedoras y la lista de clientes", () => {
    expect(vendedoras).toContain("nombreEnPantalla(v.nombre)");
    expect(clientes).toContain("nombreEnPantalla(cliente.nombre)");
  });

  it("🔴 SOLO cambia cómo se MUESTRA — la clave de agrupación no se toca", () => {
    // `normNombre` (MAYÚSCULAS, sin colapsar nada más) sigue siendo quien cruza
    // con fidelización. Si la capitalización se metiera ahí, «MARIA APARICIO» y
    // «Maria Aparicio» dejarían de ser la misma persona para el cruce.
    expect(clientes).toContain("normNombre(c.nombre)");
    expect(clientes).toMatch(
      /const normNombre = \(s: string\): string =>\s*\n\s*s\.normalize\("NFKC"\)\.replace\(\/\\s\+\/g, " "\)\.trim\(\)\.toUpperCase\(\);/,
    );
    expect(sinComentarios(clientes)).not.toContain("normNombre(nombreEnPantalla");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. EL RESUMEN
// ═════════════════════════════════════════════════════════════════════════════

describe("8 · el año sube a las tarjetas", () => {
  it("son cuatro: Ventas del mes · Tickets · Cierra en · Año", () => {
    expect(resumen).toContain("function TarjetasDelMes");
    expect(resumen).toMatch(/>\s*Ventas del mes/);
    expect(resumen).toContain(">Tickets<");
    expect(resumen).toContain('"Cierra en"');
    expect(resumen).toContain("Año {year}");
    expect(resumen).toContain("xl:grid-cols-4");
  });

  it("🩸 el desplegable «Panorama del año» se retiró, y no se perdió nada", () => {
    const src = sinComentarios(resumen);
    expect(src).not.toContain("Panorama del año");
    expect(src).not.toContain("panoramaOpen");
    // Sus tres cifras viven ahora en la tarjeta del año.
    expect(src).toContain("overview.retail.ytdVentas");
    expect(src).toContain("fmtMargen(overview.total.margen)");
    expect(src).toContain("fmtMoney(proyRetail)");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. CUÁNDO VENDE LA TIENDA
// ═════════════════════════════════════════════════════════════════════════════

describe("9 · «Cuándo vende la tienda»: una sección, con su período dicho", () => {
  it("es UNA sección, no tres tarjetas", () => {
    expect(resumen).toContain("function CuandoVendeLaTienda");
    expect(resumen).toContain(">Cuándo vende la tienda<");
    const src = sinComentarios(resumen);
    expect(src).not.toContain("function BandCards");
    expect(src).not.toContain("function BestWorstDayCard");
    expect(src).not.toContain("function BestDowCard");
    expect(src).not.toContain("function HoraPicoCard");
  });

  it("🔴 CADA LÍNEA DICE DE QUÉ PERÍODO HABLA", () => {
    expect(ROTULO_ESTE_MES).toBe("este mes");
    expect(ROTULO_VENTANA).toBe("últimos 3 meses");
    // Las cuatro líneas reciben su período; ninguna se dibuja sin él.
    const bloque = resumen.slice(resumen.indexOf("function CuandoVendeLaTienda"));
    const lineas = bloque.match(/<LineaPatron\b/g) ?? [];
    expect(lineas.length).toBe(4);
    const periodos = bloque.match(/periodo=\{[^}]+\}/g) ?? [];
    expect(periodos.length).toBe(4);
    expect(bloque).toContain("periodo={ROTULO_ESTE_MES}");
    expect(bloque).toContain("periodo={rotuloVentana}");
  });

  it("mejor/peor día son DEL MES; día más fuerte y hora pico, de 3 meses", () => {
    const bloque = resumen.slice(resumen.indexOf("function CuandoVendeLaTienda"));
    const mesLineas = (bloque.match(/periodo=\{ROTULO_ESTE_MES\}/g) ?? []).length;
    const ventanaLineas = (bloque.match(/periodo=\{rotuloVentana\}/g) ?? []).length;
    expect(mesLineas).toBe(2);
    expect(ventanaLineas).toBe(2);
    expect(MESES_DEL_PATRON).toBe(3);
  });

  it("🩸 el promedio de N meses NO es el promedio de sus promedios", () => {
    // Reconstruye la suma (promedio × días), suma sumas y días, y recién divide.
    // Julio 10 sábados de $1.000 + septiembre 1 sábado de $3.364 → NO es $2.182.
    const r = agregarPatrones([
      { heatmap: [{ dow: 6, dow_label: "Sáb", ventas_promedio: 1000, count_dias: 4 }], horas: [] },
      { heatmap: [{ dow: 6, dow_label: "Sáb", ventas_promedio: 3364, count_dias: 1 }], horas: [] },
    ]);
    const sab = r.dow.find((d) => d.dow === 6)!;
    expect(sab.count_dias).toBe(5);
    expect(sab.ventas_promedio).toBeCloseTo((1000 * 4 + 3364) / 5, 6);
    expect(sab.ventas_promedio).not.toBeCloseTo((1000 + 3364) / 2, 2);
  });

  it("un mes sin ese día de la semana no arrastra el promedio a cero", () => {
    const r = agregarPatrones([
      { heatmap: [{ dow: 0, dow_label: "Dom", ventas_promedio: 0, count_dias: 0 }], horas: [] },
      { heatmap: [{ dow: 0, dow_label: "Dom", ventas_promedio: 500, count_dias: 2 }], horas: [] },
    ]);
    const dom = r.dow.find((d) => d.dow === 0)!;
    expect(dom.count_dias).toBe(2);
    expect(dom.ventas_promedio).toBe(500);
  });

  it("las horas se SUMAN y la hora pico es la de más venta positiva", () => {
    const r = agregarPatrones([
      { heatmap: [], horas: [{ hora: 15, ventas: 100 }, { hora: 16, ventas: 80 }] },
      { heatmap: [], horas: [{ hora: 15, ventas: 50 }, { hora: 16, ventas: 200 }] },
    ]);
    expect(r.horas.find((h) => h.hora === 15)!.ventas).toBe(150);
    expect(r.horaPico).toBe(16);
    expect(r.horaPicoVentas).toBe(280);
  });

  it("sin ventas no hay hora pico — se abstiene, no dice las 12 am", () => {
    const r = agregarPatrones([{ heatmap: [], horas: [{ hora: 9, ventas: 0 }] }]);
    expect(r.horaPico).toBeNull();
    expect(r.mejorDow).toBeNull();
  });

  it("la ventana de N meses cruza el año sola", () => {
    expect(mesesDeLaVentana(2026, 2, 3)).toEqual([
      { anio: 2025, mes: 12 }, { anio: 2026, mes: 1 }, { anio: 2026, mes: 2 },
    ]);
    expect(mesesDeLaVentana(2026, 9, 3)).toEqual([
      { anio: 2026, mes: 7 }, { anio: 2026, mes: 8 }, { anio: 2026, mes: 9 },
    ]);
  });

  it("⚠️ sin patrones cae al MES y el rótulo lo dice — no miente", () => {
    const bloque = resumen.slice(resumen.indexOf("function CuandoVendeLaTienda"));
    expect(bloque).toContain("const rotuloVentana = hayVentana ? ROTULO_VENTANA : ROTULO_ESTE_MES");
  });

  it("la ruta pide los meses que faltan SIN estrenar una RPC nueva", () => {
    expect(rutaDetalle).toContain("mesesDeLaVentana(year, mes, MESES_DEL_PATRON)");
    expect(rutaDetalle).toContain('supabaseServer.rpc("multifashion_horas_pico_v1"');
    expect(rutaDetalle).toContain("agregarPatrones(mesesPatron)");
    // El mes elegido NO se vuelve a pedir: entra con lo que ya se leyó.
    expect(rutaDetalle).toContain(".filter((m) => !(m.anio === year && m.mes === mes))");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. LA PROYECCIÓN DICE SOBRE CUÁNTOS DÍAS ESTÁ HECHA
// ═════════════════════════════════════════════════════════════════════════════

describe("10 · la proyección dice sobre cuántos días está hecha", () => {
  it("la tarjeta escribe «con N días»", () => {
    expect(resumen).toContain('`con ${dias} ${dias === 1 ? "día" : "días"}`');
    expect(resumen).toContain("totales.proyeccion_dias");
  });

  it("🔴 la FÓRMULA no se tocó: el dato sale de la RPC que ya lo traía", () => {
    // `dia_corte` y `dias_mes` ya viajaban en `proyeccion_mensual_retail_v1`.
    expect(rutaDetalle).toContain("dia_corte");
    expect(rutaDetalle).toContain("proyeccion_dias: proyeccionDias?.dias ?? null");
    expect(rutaDetalle).toContain('supabaseServer.rpc("proyeccion_mensual_retail_v1"');
    // Y la proyección sigue siendo la RETAIL, no la total (que suma mayoreo).
    expect(rutaDetalle).toContain("acProy.proyeccion_retail");
  });

  it("sin proyección no se inventa un número de días", () => {
    expect(rutaDetalle).toContain("acProy && proyeccionRetail != null");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. EL ENCABEZADO DEL TELÉFONO
// ═════════════════════════════════════════════════════════════════════════════

describe("11 · el encabezado del teléfono, de seis bloques a tres", () => {
  it("«Sincronizado …» y «Actualizar ahora» se van al menú ☰ en el celular", () => {
    expect(shell).toContain("<AppHeader module=\"Multifashion\" acciones={accionesSync} />");
    // Y en el escritorio se quedan a la vista.
    expect(shell).toContain('<div className="hidden md:block">{accionesSync}</div>');
    const header = leer("src/components/AppHeader.tsx");
    expect(header).toContain("acciones?: ReactNode");
    expect(header).toContain("{acciones && (");
  });

  it("⚠️ el gate de rol y el acelerador del botón NO cambiaron", () => {
    // Los dos viven adentro de SyncNowButton; el shell solo lo coloca.
    expect(shell).toContain("<SyncNowButton");
    expect(shell).toContain('opciones={[{ modulo: "facturas", empresa: "american_classic" }]}');
  });

  it("quedan tres bloques y en este orden: título+período · hoy · pestañas", () => {
    const cuerpo = shell.slice(shell.indexOf("<main"));
    const iTitulo = cuerpo.indexOf("<PeriodoSelect");
    const iHoy = cuerpo.indexOf("<VentaHoyCard");
    const iTabs = cuerpo.indexOf("<MultifashionView");
    expect(iTitulo).toBeGreaterThan(-1);
    expect(iTitulo).toBeLessThan(iHoy);
    expect(iHoy).toBeLessThan(iTabs);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. LAS VENDEDORAS CON DOS CÓDIGOS
// ═════════════════════════════════════════════════════════════════════════════

describe("12 · las vendedoras con DOS códigos se juntan", () => {
  const sql = sinComentariosSql(migracion);

  it("🔴 el amarre es CÓDIGO → CÓDIGO, no nombre → nombre", () => {
    expect(sql).toContain("codigo_switch     integer NOT NULL");
    expect(sql).toContain("codigo_canonico   integer NOT NULL");
    expect(sql).toContain("CHECK (codigo_switch <> codigo_canonico)");
  });

  it("carga los TRES amarres medidos: 12→3 · 13→8 · 14→10", () => {
    expect(sql).toContain("(12,  3, 'ANA TREJOS',      'Ana Trejos')");
    expect(sql).toContain("(13,  8, 'CINDY DE GRACIA', 'Cindy De Gracia')");
    expect(sql).toContain("(14, 10, 'YEISIBETH MUÑOZ', 'Yeisibeth Muñoz')");
  });

  it("🔴 soft delete, NUNCA DELETE, y única solo entre las ACTIVAS", () => {
    expect(sql).toContain("activo            boolean NOT NULL DEFAULT true");
    expect(sql).toContain("desactivado_por");
    expect(sql).toContain("desactivado_en");
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]{0,200}WHERE activo/);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
  });

  it("RLS encendida y solo service_role", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FOR ALL TO service_role");
  });

  it("🔴 se resuelve en UNA función, y la vista la expone para TODAS las superficies", () => {
    expect(sql).toContain("FUNCTION public.multifashion_vendedora_canonica");
    expect(sql).toContain("multifashion_vendedora_canonica(vendedor_switch_id, vendedor_nombre) AS vendedor_canonico");
    // Las tres RPC agrupan por esa columna y por ninguna otra.
    for (const fn of ["multifashion_vendedoras_v4", "multifashion_vendedoras_range_v2", "multifashion_bonos_v4"]) {
      const i = sql.indexOf(`FUNCTION public.${fn}`);
      expect(i, `falta ${fn}`).toBeGreaterThan(-1);
      const cuerpo = sql.slice(i, sql.indexOf("$function$;", i));
      expect(cuerpo, `${fn} todavía agrupa por el nombre crudo`)
        .not.toContain("REGEXP_REPLACE(TRIM(vendedor)");
      expect(cuerpo).toContain("GROUP BY vendedor_canonico");
    }
  });

  it("⚠️ las columnas nuevas de la vista van AL FINAL (lo exige CREATE OR REPLACE)", () => {
    const i = sql.indexOf("CREATE OR REPLACE VIEW public._multifashion_sf_vw");
    const cuerpo = sql.slice(i, sql.indexOf("FROM switch_facturas", i));
    expect(cuerpo.indexOf("AS subtotal_comision"))
      .toBeLessThan(cuerpo.indexOf("AS vendedor_codigo"));
    expect(cuerpo.indexOf("AS vendedor_codigo"))
      .toBeLessThan(cuerpo.indexOf("AS vendedor_canonico"));
  });

  it("🔴 sin amarre el nombre sale EXACTAMENTE como antes (solo recortado)", () => {
    // Es lo que garantiza que para quien no tiene alias no cambie un carácter.
    expect(sql).toContain("REGEXP_REPLACE(TRIM(COALESCE(p_nombre, '')), '\\s+', ' ', 'g')");
  });

  it("las rutas llaman a la v4 y CAEN a la v3 mientras la DDL no corra", () => {
    expect(rutaVendedoras).toContain('supabaseServer.rpc("multifashion_vendedoras_v4"');
    expect(rutaVendedoras).toContain('supabaseServer.rpc("multifashion_vendedoras_v3"');
    expect(rutaVendedoras).toContain('supabaseServer.rpc("multifashion_vendedoras_range_v2"');
    expect(rutaVendedoras).toContain('supabaseServer.rpc("multifashion_vendedoras_range"');
    expect(rutaBonos).toContain('supabaseServer.rpc("multifashion_bonos_v4"');
    expect(rutaBonos).toContain('supabaseServer.rpc("multifashion_bonos_v3"');
    expect(rutaVendedoras).toContain("if (!v4.error) return v4;");
  });

  it("🔴 la tabla entra al respaldo: si se pierde, no se puede volver a deducir", () => {
    expect(leer("src/lib/backup/tablas.ts")).toContain('"multifashion_vendedora_alias"');
    expect(leer("src/app/api/cron/backup/route.ts")).toContain('{ table: "multifashion_vendedora_alias" }');
  });

  it("⚠️ juntar códigos NO cambia ningún total, y la nota de DEFAULT se queda", () => {
    // Medido el 6-sep-2026: septiembre vale $10.867,09 en total y $10.570,66
    // sumando vendedoras. Los $296,43 que faltan son DEFAULT, que las RPC
    // excluyen a propósito — no son estos tres códigos.
    expect(migracion).toContain("296,43");
    expect(migracion).toContain("DEFAULT");
    expect(migracion).toContain("NO CAMBIA NINGÚN TOTAL");
  });
});
