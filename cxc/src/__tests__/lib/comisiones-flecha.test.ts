// ─────────────────────────────────────────────────────────────────────────────
// COMISIONES — LA FLECHITA ↓ Y LOS DOS BOTONES DE ARRIBA (8-sep-2026).
//
// Bajar el detalle de un vendedor en una empresa costaba CINCO toques (tocar la
// celda → esperar → bajar → «Descargar el detalle» → cerrar), y otra vez por
// cada una de las seis empresas. Ahora hay una flechita pegada al número y dos
// botones arriba con el mes en los dos formatos.
//
// 🔴 NINGÚN NÚMERO SE MUEVE: es forma. La prueba contra producción vive en
// `scripts/_medir-comisiones-flecha.mjs` (las 27 celdas de 2026, antes y
// después). Acá se congelan las REGLAS.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

import {
  ROTULO_DESCARGAR_EXCEL,
  ROTULO_DESCARGAR_MES_PDF,
  ROTULO_DESCARGAR_PDF,
  ROTULO_TODAS_LAS_EMPRESAS,
  conDescargaPorVendedor,
  conPdfDelPeriodo,
  empresasConComision,
  hayQueDescargar,
  hayQueDescargarTotal,
  rotuloDescargarExcel,
  tituloDescarga,
} from "@/lib/comisiones/descarga";
import { celdaVacia } from "@/lib/comisiones/matriz-celda";
import { MES_TODO_EL_ANIO } from "@/lib/comisiones/periodo";
import {
  nombreArchivoComision,
  nombreArchivoComisionTodas,
  nombreArchivoComisionesEmpresa,
  nombreArchivoComisionesMes,
} from "@/lib/comisiones/nombre-archivo";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
/** Sin comentarios: un candado no puede pasar porque la regla esté NOMBRADA en una nota. */
const plano = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// El MISMO orden de columnas que la matriz (`EMPRESAS_COMISIONAN`).
const EMPRESAS = [
  "vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep",
] as const;

// ═══ 1 · La flecha solo donde hay algo que bajar ════════════════════════════

describe("🔴 la flechita solo se dibuja donde hay algo que bajar", () => {
  it("una celda en guion NO la lleva; una con número, sí", () => {
    // Las tres formas de «nada»: ausente, cero, y cero sin descuento.
    expect(hayQueDescargar(undefined)).toBe(false);
    expect(hayQueDescargar(0)).toBe(false);
    expect(hayQueDescargar(0, 0)).toBe(false);
    // Con número, sí — incluido el negativo (Reynaldo, septiembre 2026).
    expect(hayQueDescargar(41.77)).toBe(true);
    expect(hayQueDescargar(-1513.08, 1573.08)).toBe(true);
  });

  it("🔴 y es EXACTAMENTE lo contrario del guion: una sola función decide", () => {
    // Si esto se separara, un día habría una flecha encima de un `—`.
    const casos: [number | undefined, number][] = [
      [undefined, 0], [0, 0], [0, 1573.08], [41.77, 0], [-1513.08, 1573.08], [0.01, 0],
    ];
    for (const [v, d] of casos) {
      expect(hayQueDescargar(v, d), `${v}/${d}`).toBe(!celdaVacia(v, d));
    }
  });

  it("🩸 una celda en CERO con descuento adentro SÍ la lleva: ahí hay plata", () => {
    expect(hayQueDescargar(0, 1573.08)).toBe(true);
  });
});

// ═══ 2 · Los tres alcances ══════════════════════════════════════════════════

describe("🔴 tres alcances: una empresa · las de esa persona · las 6", () => {
  it("la flecha del TOTAL baja TODAS las empresas de esa persona, no una", () => {
    const porEmpresa = { fashion_shoes: -1513.08, vistana: 41.77, joystep: 0 };
    const desc = { fashion_shoes: 1573.08 };
    expect(empresasConComision(porEmpresa, desc, EMPRESAS)).toEqual([
      "vistana", "fashion_shoes",
    ]);
  });

  it("y conserva el ORDEN de las columnas de la matriz", () => {
    const porEmpresa = { joystep: 5, vistana: 9, active_shoes: 3 };
    expect(empresasConComision(porEmpresa, {}, EMPRESAS)).toEqual([
      "vistana", "active_shoes", "joystep",
    ]);
  });

  it("una fila entera en guiones no ofrece flecha de Total", () => {
    expect(hayQueDescargarTotal({}, {}, EMPRESAS)).toBe(false);
    expect(hayQueDescargarTotal({ vistana: 0 }, { vistana: 0 }, EMPRESAS)).toBe(false);
    expect(hayQueDescargarTotal({ vistana: 41.77 }, {}, EMPRESAS)).toBe(true);
  });
});

// ═══ 3 · «Todo el año» no ofrece lo que no existe ══════════════════════════

describe("🔴 con «Todo el año» no hay flecha ni PDF del período", () => {
  it("el reporte por vendedor es de UN mes: la misma regla que el detalle", () => {
    expect(conDescargaPorVendedor(8)).toBe(true);
    expect(conDescargaPorVendedor(MES_TODO_EL_ANIO)).toBe(false);
    expect(conPdfDelPeriodo(8)).toBe(true);
    expect(conPdfDelPeriodo(MES_TODO_EL_ANIO)).toBe(false);
  });

  it("🔴 y la barra de arriba dibuja el botón CON esa condición, no siempre", () => {
    const shell = plano(leer("src/components/ventas/ComisionesView.tsx"));
    // El botón existe, cuelga de la regla, y hace algo al tocarlo.
    expect(shell).toContain("{conPdfDelPeriodo(mes) && (");
    expect(shell).toContain("ROTULO_DESCARGAR_MES_PDF");
    expect(shell).toContain("onClick={() => pdfRef.current?.()}");
    // Y la vista que lo alimenta registra su papel.
    expect(plano(leer("src/components/ventas/ComisionesConsolidadoView.tsx")))
      .toContain("onPdf?.(");
    expect(plano(leer("src/components/ventas/ComisionesPorEmpresaView.tsx")))
      .toContain("onPdf?.(");
  });

  it("⚠️ y «Descargar el año» se queda como está: Excel y nada más", () => {
    expect(rotuloDescargarExcel(MES_TODO_EL_ANIO)).toBe("Descargar el año");
    expect(rotuloDescargarExcel(8)).toBe("Descargar el mes en Excel");
    expect(ROTULO_DESCARGAR_MES_PDF).toBe("Descargar el mes en PDF");
  });
});

// ═══ 4 · Los textos ═════════════════════════════════════════════════════════

describe("🔴 el menú dice de quién, de qué empresa y de qué mes", () => {
  it("una empresa lleva su nombre CORTO; todas, «Todas las empresas»", () => {
    expect(tituloDescarga("Reynaldo Espinosa", "Fashion Shoes", 8))
      .toBe("Reynaldo Espinosa · Fashion Shoes · Agosto");
    expect(tituloDescarga("Reynaldo Espinosa", null, 8))
      .toBe(`Reynaldo Espinosa · ${ROTULO_TODAS_LAS_EMPRESAS} · Agosto`);
  });

  it("el verbo es «Descargar», nunca «Exportar» ni «Bajar»", () => {
    for (const r of [ROTULO_DESCARGAR_PDF, ROTULO_DESCARGAR_EXCEL, ROTULO_DESCARGAR_MES_PDF]) {
      expect(r.startsWith("Descargar")).toBe(true);
    }
    expect(ROTULO_DESCARGAR_PDF).toBe("Descargar en PDF");
    expect(ROTULO_DESCARGAR_EXCEL).toBe("Descargar en Excel");
  });
});

// ═══ 5 · Los nombres de archivo ═════════════════════════════════════════════

describe("🔴 el PDF y el Excel del mismo alcance se llaman IGUAL", () => {
  it("una empresa: el nombre de siempre, sin tocar", () => {
    expect(nombreArchivoComision("EDWIN", "vistana", 2026, 8))
      .toBe("Comisión-Edwin-Vistana-2026-08");
  });

  it("todas las empresas de una persona: se distingue del de una sola", () => {
    expect(nombreArchivoComisionTodas("REYNALDO ESPINOSA", 2026, 8))
      .toBe("Comisión-Reynaldo-Espinosa-Todas-2026-08");
    expect(nombreArchivoComisionTodas("EDWIN", 2026, 8))
      .not.toBe(nombreArchivoComision("EDWIN", "vistana", 2026, 8));
  });

  it("🔴 el mes entero usa el MISMO nombre que ya usaba el Excel", () => {
    expect(nombreArchivoComisionesMes(2026, 8)).toBe("comisiones-consolidado-2026-08");
    // El Excel de la matriz lo arma con esa misma forma: si uno cambia, cambian
    // los dos (el archivo se sigue leyendo `comisiones-consolidado-<período>`).
    expect(plano(leer("src/lib/ventas/comisionExcel.ts")))
      .toContain("comisiones-consolidado-${sufijoArchivoPeriodo(c.year, c.mes)}");
    expect(nombreArchivoComisionesEmpresa("vistana", 2026, 8)).toBe("comisiones-vistana-2026-08");
    expect(plano(leer("src/lib/ventas/comisionExcel.ts")))
      .toContain("comisiones-${r.empresaKey}-${sufijoArchivoPeriodo(r.year, r.mes)}");
  });
});

// ═══ 6 · Lo que NO se tocó ══════════════════════════════════════════════════

describe("🔴 la flecha AGREGA un camino; no reemplaza ninguno", () => {
  const matriz = plano(leer("src/components/ventas/ComisionesConsolidadoView.tsx"));

  it("tocar el número sigue abriendo el detalle", () => {
    expect(matriz).toContain("detalleDe(k, r.vendedor)");
    expect(matriz).toContain("<ComisionesDetalleModal");
    expect(matriz).toContain("inline");
  });

  it("y la flecha PARA el clic, para que los dos caminos convivan", () => {
    const menu = plano(leer("src/components/ventas/comisiones-detalle/MenuDescargaComision.tsx"));
    expect(menu).toContain("e.stopPropagation()");
  });

  it("🔴 son los MISMOS archivos de siempre: no hay un generador nuevo", () => {
    const motor = plano(leer("src/components/ventas/comisiones-detalle/useDescargaComision.tsx"));
    expect(motor).toContain("exportComisionDetalle");
    expect(motor).toContain("ImpresionComision");
    // Y la MISMA lectura que hace el detalle, con los mismos parámetros.
    expect(motor).toContain("/api/ventas/comisiones/detalle?");
    expect(motor).toContain("/api/ventas/comisiones/descuentos?");
  });

  it("🩸 y SOLO se imprime el papel que se pidió, aunque el detalle esté abierto", () => {
    // Con el detalle abierto su hoja también está montada en <body>: sin esto,
    // el PDF de una empresa traería el reporte de otra atrás.
    expect(plano(leer("src/components/ventas/comisiones-detalle/useDescargaComision.tsx")))
      .toContain("body > [data-cds-print]:not([data-cds-lote]) { display: none !important; }");
    expect(plano(leer("src/components/ventas/comisiones-detalle/ImpresionTablaComisiones.tsx")))
      .toContain("body > [data-cds-print]:not([data-cds-tabla]) { display: none !important; }");
  });

  it("⚠️ el papel del detalle sigue llevando la factura LARGA y la columna Tipo", () => {
    const papel = plano(leer("src/components/ventas/comisiones-detalle/ImpresionComision.tsx"));
    expect(papel).toContain("{v.secuencial}");
    expect(papel).toContain("tipoDocCorto(v.tipo)");
  });
});

// ═══ 7 · El botón de arriba trae LAS SEIS ══════════════════════════════════

describe("🔴 el botón de arriba trae las 6 empresas, no una", () => {
  const matriz = plano(leer("src/components/ventas/ComisionesConsolidadoView.tsx"));

  it("el papel del mes recorre la MISMA lista de empresas que la tabla", () => {
    // `EMPRESAS` = `EMPRESAS_COMISIONAN`, derivada — nunca escrita a mano acá.
    expect(matriz).toContain("const EMPRESAS = EMPRESAS_COMISIONAN;");
    expect(matriz).toContain("<ImpresionTablaComisiones");
    // Las columnas del papel y los totales salen de esa misma lista.
    expect(matriz).toMatch(/columnas=\{\[\s*\{ header: "Vendedor" \},\s*\.\.\.EMPRESAS\.map/);
    expect(matriz).toMatch(/totales=\{\[[\s\S]{0,200}\.\.\.EMPRESAS\.map/);
  });

  it("🔴 y el papel dice lo MISMO que el Excel: mismas filas, mismo pie", () => {
    // Las dos salidas se arman de `conActividad` + la oficina, y el pie de las
    // dos sale de `sumarPagable`. Nada se recalcula para el papel.
    expect(matriz).toContain("const todas = [...conActividad, ...(sinAsignar ? [sinAsignar] : [])];");
    expect(matriz).toContain("vendedores: conActividad.map(");
    expect(matriz).toContain("sumarPagable");
    // El pie del papel es el MISMO que el de la pantalla.
    expect(matriz).toContain("haySinPago ? \"Total a pagar\" : \"Total\"");
  });

  it("los que no se pagan siguen saliendo en el papel con su marca", () => {
    expect(matriz).toContain("ROTULO_NO_SE_PAGA");
  });
});

// ═══ 8 · La regla no se escribe dos veces ═══════════════════════════════════

describe("🔴 quién decide qué se dibuja vive en el módulo puro", () => {
  it("ninguna pantalla se escribe su propia condición", () => {
    for (const f of [
      "src/components/ventas/ComisionesConsolidadoView.tsx",
      "src/components/ventas/ComisionesTarjetas.tsx",
    ]) {
      const src = plano(leer(f));
      // Nada de `val !== 0 &&` o `val !== undefined &&` decidiendo la flecha.
      expect(src, f).not.toMatch(/val\s*!==\s*(0|undefined)\s*&&/);
    }
    const matriz = plano(leer("src/components/ventas/ComisionesConsolidadoView.tsx"));
    expect(matriz).toContain("hayQueDescargar(");
    expect(matriz).toContain("hayQueDescargarTotal(");
    expect(matriz).toContain("conDescargaPorVendedor(mes)");
  });

  it("las tarjetas del celular no saben nada de rutas ni de archivos", () => {
    const tarjetas = plano(leer("src/components/ventas/ComisionesTarjetas.tsx"));
    expect(tarjetas).not.toContain("fetch(");
    expect(tarjetas).not.toContain("exportComision");
    // Reciben la flecha ya dibujada por la vista, que es la dueña.
    expect(tarjetas).toContain("menuEmpresa");
    expect(tarjetas).toContain("menuTotal");
  });
});
