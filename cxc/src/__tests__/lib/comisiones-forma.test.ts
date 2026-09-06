// ─────────────────────────────────────────────────────────────────────────────
// COMISIONES — LA FORMA (6-sep-2026). Ni un número se mueve.
//
// Daniel revisó las pantallas, el Excel y el PDF con sus propios ojos y aprobó
// estos cambios UNO POR UNO. Todos son de forma, de espacio y de cuántos toques
// cuesta. **Medido contra producción el 6-sep-2026 con la RPC real
// (`comision_b2b_v9`), las 27 celdas de 2026 (3 personas × 9 meses) dan
// idénticas y el total sigue en $67.815,75**:
//
//   Edwin      9.037,17   (1.132,36 · 1.970,43 · 1.095,27 · 1.180,77 · 1.771,29
//                          · 316,62 · 876,24 · 652,42 · 41,77)
//   Reynaldo  58.544,09   (3.462,99 · 7.825,11 · 9.373,51 · 5.768,85 · 10.822,22
//                          · 8.387,25 · 9.325,60 · 5.091,64 · −1.513,08)
//   Rodrigo      234,49   (todo en agosto)
//
// Este archivo cuida las DECISIONES PURAS y los barridos de fuente; lo que se
// prueba montando la pantalla vive en
// `__tests__/components/comisiones-forma-pantalla.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

import {
  MES_TODO_EL_ANIO,
  ROTULO_TODO_EL_ANIO,
  esTodoElAnio,
  etiquetaPeriodo,
  etiquetaPeriodoCorta,
  mesesDelPeriodo,
  rotuloDescargarPeriodo,
  sufijoArchivoPeriodo,
} from "@/lib/comisiones/periodo";
import { acumularVendedores } from "@/lib/comisiones/acumular-anio";
import { celdaVacia, desgloseDeCelda } from "@/lib/comisiones/matriz-celda";
import { facturaParaMostrar } from "@/lib/comisiones/factura-en-pantalla";
import { nombreArchivoComision } from "@/lib/comisiones/nombre-archivo";
import {
  OPCIONES_VISTA,
  ROTULO_GRUPO,
  VISTA_GRUPO,
  VISTA_MULTIFASHION,
  esVistaDeEmpresa,
  resolverVista,
} from "@/lib/comisiones/vistas";
import { rotuloVerNoSePagan, ROTULO_VER_MENOS } from "@/lib/comisiones/sin-pago";
import { validarExclusionesNuevas } from "@/lib/comisiones/exclusiones";
import { buildComisionDetalleSheet, type ComisionDetalle } from "@/lib/ventas/comisionExcel";
import { PCT_FMT } from "@/lib/excel-export";

const raiz = path.resolve(__dirname, "../../..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");
/** El fuente SIN comentarios: un candado que se cumple con su propia nota no vale. */
const plano = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ═══ 1 · La factura, corta EN PANTALLA y larga en el papel ═══════════════════

describe("🔴 1 · la factura se muestra corta y se guarda larga", () => {
  it("el secuencial de Switch se recorta a sus últimos 4 dígitos", () => {
    // El caso de Daniel: `11-000003022` no cabe y parte la fila en dos líneas.
    expect(facturaParaMostrar("11-000003022")).toBe("3022");
    expect(facturaParaMostrar("155-000000244")).toBe("0244");
  });

  it("lo que NO tiene forma de secuencial se deja EXACTAMENTE como está", () => {
    // Recortar «todo lo que tenga más de 4 dígitos» rompería las facturas de 5
    // dígitos escritas a mano y los traslados.
    expect(facturaParaMostrar("2534")).toBe("2534");
    expect(facturaParaMostrar("23589")).toBe("23589");
    expect(facturaParaMostrar("FA-0012")).toBe("FA-0012");
    expect(facturaParaMostrar("Traslado")).toBe("Traslado");
  });

  it("🔴 la regla NO se duplica: sale del mismo módulo que usa Guías", () => {
    const src = leer("src/lib/comisiones/factura-en-pantalla.ts");
    expect(src).toContain('from "@/lib/guias/numero-factura"');
    // Y no hay una segunda implementación escondida en el detalle.
    const modal = plano(leer("src/components/ventas/ComisionesDetalleModal.tsx"));
    expect(modal).toContain("facturaParaMostrar(v.secuencial)");
    expect(modal).not.toMatch(/slice\(-4\)/);
  });

  it("⚠️ EN EL EXCEL Y EN EL PAPEL SE QUEDA LARGA — Daniel dijo «no»", () => {
    const excel = plano(leer("src/lib/ventas/comisionExcel.ts"));
    expect(excel).toContain("td(v.secuencial, alt)");
    expect(excel).not.toContain("facturaParaMostrar");
    const impresion = plano(leer("src/components/ventas/comisiones-detalle/ImpresionComision.tsx"));
    expect(impresion).toContain("{v.secuencial}");
    expect(impresion).not.toContain("facturaParaMostrar");
  });
});

// ═══ 2 · Nombre de empresa CORTO ════════════════════════════════════════════

describe("🔴 2 · el módulo dice «Vistana», no «Vistana International»", () => {
  const superficies = [
    "src/components/ventas/ComisionesView.tsx",
    "src/components/ventas/ComisionesConsolidadoView.tsx",
    "src/components/ventas/ComisionesPorEmpresaView.tsx",
    "src/components/ventas/comisiones-config/ClientesQueNoComisionan.tsx",
    "src/components/ventas/comisiones-config/Descuentos.tsx",
  ];

  it("ninguna superficie de Comisiones usa ya el nombre largo", () => {
    for (const f of superficies) {
      expect(plano(leer(f)), f).not.toContain("EMPRESA_KEY_TO_NAME");
    }
  });

  it("y el que usan es el del diccionario § 0, que ya existía", () => {
    for (const f of superficies) {
      expect(plano(leer(f)), f).toMatch(/nombreCortoEmpresa|EMPRESA_KEY_TO_NOMBRE_CORTO/);
    }
    // Las opciones del selector salen de la misma lista.
    expect(OPCIONES_VISTA.find((o) => o.valor === "vistana")?.etiqueta).toBe("Vistana");
    expect(OPCIONES_VISTA.find((o) => o.valor === VISTA_MULTIFASHION)?.etiqueta).toBe("Multifashion");
  });
});

// ═══ 3 · UNA sola forma de decir «nada» ══════════════════════════════════════

describe("🔴 3 · el guion es la única forma de decir «nada»", () => {
  it("sin número y en cero son lo mismo para quien mira", () => {
    // Medido en septiembre 2026: la fila de Reynaldo tiene 4 celdas en $0.00 y
    // 2 sin número, con UN solo dato que importa (−$1.513,08).
    expect(celdaVacia(undefined)).toBe(true);
    expect(celdaVacia(0)).toBe(true);
    expect(celdaVacia(-1513.08)).toBe(false);
    expect(celdaVacia(0.01)).toBe(false);
  });

  it("⚠️ salvo que adentro haya un descuento: taparlo escondería plata", () => {
    expect(celdaVacia(0, 1573.08)).toBe(false);
    expect(celdaVacia(undefined, 1573.08)).toBe(false);
  });

  it("la decisión vive en UN módulo puro y la usan la tabla y las tarjetas", () => {
    for (const f of [
      "src/components/ventas/ComisionesConsolidadoView.tsx",
      "src/components/ventas/ComisionesTarjetas.tsx",
    ]) {
      expect(plano(leer(f)), f).toContain("celdaVacia(");
    }
  });
});

// ═══ 5 · Fuera la columna «Desde» ═══════════════════════════════════════════

describe("🔴 5 · «Clientes que no comisionan» ya no muestra «Desde»", () => {
  it("decía la misma fecha en todas las filas: no distinguía nada", () => {
    const src = plano(leer("src/components/ventas/comisiones-config/ClientesQueNoComisionan.tsx"));
    expect(src).not.toContain(">Desde<");
    expect(src).not.toContain("fechaPanamaDe");
    expect(src).not.toContain("fmtDate");
  });

  it("🔴 pero la firma de la base NO se toca: `creado_en` sigue viajando", () => {
    expect(leer("src/lib/comisiones/exclusiones.ts")).toContain("creado_en: string;");
    expect(plano(leer("src/lib/comisiones/exclusiones-server.ts"))).toContain("creado_en: f.creado_en,");
  });
});

// ═══ 6 · Fuera la columna «Tipo» en pantalla ════════════════════════════════

describe("🔴 6 · el detalle en PANTALLA no repite el tipo del documento", () => {
  it("la nota de crédito ya se dice en rojo y con el monto en negativo", () => {
    const modal = plano(leer("src/components/ventas/ComisionesDetalleModal.tsx"));
    expect(modal).not.toContain("tipoDocCorto");
    expect(modal).toContain('text-rose-600');
  });

  it("⚠️ en el Excel y en el papel SÍ se queda: ahí se concilia contra Switch", () => {
    expect(plano(leer("src/lib/ventas/comisionExcel.ts"))).toContain("tipoDocCorto(v.tipo)");
    expect(plano(leer("src/components/ventas/comisiones-detalle/ImpresionComision.tsx")))
      .toContain("tipoDocCorto(v.tipo)");
  });
});

// ═══ 10 y 13 · El Excel del detalle ═════════════════════════════════════════

const DETALLE: ComisionDetalle = {
  empresa_key: "vistana", year: 2026, mes: 8, vendedor: "EDWIN",
  tasa_venta: 0.005, tasa_cobro: 0.005,
  ventas: [
    { fecha: "2026-08-03", cliente: "City Mall", secuencial: "11-000003022", tipo: "Factura", subtotal: 1000, pct_utilidad: 30 },
    { fecha: "2026-08-09", cliente: "City Mall", secuencial: "11-000003044", tipo: "Factura", subtotal: 500, pct_utilidad: 28 },
  ],
  cobros: [{ fecha: "2026-08-20", cliente: "City Mall", monto: 800 }],
  ventas_base: 1500, cobros_base: 800,
  comision_venta: 345.27, comision_cobro: 307.15, comision_total: 652.42,
};

describe("🔴 10 · el Excel del detalle: título 1, vacía 2, encabezados 3 con filtro", () => {
  it("la fila 1 dice qué es, de quién, de dónde y de cuándo", async () => {
    const ws = await buildComisionDetalleSheet(DETALLE, "Vistana");
    expect((ws.A1 as { v: string }).v).toBe("Comisión — Edwin · Vistana · Agosto 2026");
  });

  it("la fila 2 está VACÍA (separación), no es otra banda", async () => {
    const ws = await buildComisionDetalleSheet(DETALLE, "Vistana");
    expect(ws.A2).toBeUndefined();
    expect(ws.B2).toBeUndefined();
  });

  it("los encabezados están en la 3, y el filtro empieza ahí", async () => {
    const ws = await buildComisionDetalleSheet(DETALLE, "Vistana");
    expect((ws.A3 as { v: string }).v).toBe("Fecha");
    expect((ws.E3 as { v: string }).v).toBe("Subtotal");
    // 🔴 UN SOLO FILTRO, sobre las FACTURAS: 2 ventas → A3:E5. El total y todo
    // lo de abajo quedan afuera para que filtrar no los esconda.
    expect(ws["!autofilter"]).toEqual({ ref: "A3:E5" });
  });

  it("🔴 y la fila fija se deriva del filtro, no de una constante", () => {
    const panel = plano(leer("src/lib/excel-panel-fijo.ts"));
    expect(panel).toContain('<autoFilter ref="A(\\d+):');
    expect(panel).toContain("panelFijo(fila)");
    // Con encabezados en A1 el panel sigue siendo el de siempre (ySplit=1).
    expect(panel).toContain('ySplit="${filaEncabezados}"');
  });

  it("🔴 las columnas siguen siendo CINCO: nada de «% de utilidad» ni «Comisión»", async () => {
    const ws = await buildComisionDetalleSheet(DETALLE, "Vistana");
    expect(["A3", "B3", "C3", "D3", "E3"].map((k) => (ws[k] as { v: string }).v))
      .toEqual(["Fecha", "Cliente", "Factura", "Tipo", "Subtotal"]);
    expect(ws.F3).toBeUndefined();
  });
});

describe("🔴 13 · la tasa del cierre es un porcentaje de verdad", () => {
  it("era el TEXTO «× 0.50%» y ahora es un número con formato", async () => {
    const ws = await buildComisionDetalleSheet(DETALLE, "Vistana");
    // 2 ventas + 1 cobro: 13 CIERRE · 14 Ventas · 15 Cobros · 16 Comisión total.
    const ventas = ws.C14 as { t: string; v: number; z?: string };
    expect(ventas.t).toBe("n");
    expect(ventas.v).toBe(0.005);
    expect(ventas.z).toBe(PCT_FMT);
    // La base sigue siendo número (ya lo era): las dos se pueden multiplicar.
    expect((ws.B14 as { t: string; v: number }).t).toBe("n");
    expect((ws.B14 as { t: string; v: number }).v).toBe(1500);
  });

  it("y no queda ningún «× N%» escrito a mano", () => {
    expect(plano(leer("src/lib/ventas/comisionExcel.ts"))).not.toContain("`× ${");
  });
});

// ═══ 12 · El nombre del PDF ═════════════════════════════════════════════════

describe("🔴 12 · el PDF ya no se llama «Fashion Group.pdf»", () => {
  it("dice qué es, de quién y de cuándo, con la empresa CORTA", () => {
    expect(nombreArchivoComision("EDWIN", "vistana", 2026, 8)).toBe("Comisión-Edwin-Vistana-2026-08");
    expect(nombreArchivoComision("REYNALDO ESPINOSA", "fashion_shoes", 2026, 9))
      .toBe("Comisión-Reynaldo-Espinosa-Fashion-Shoes-2026-09");
  });

  it("con «Todo el año» el nombre lo dice", () => {
    expect(nombreArchivoComision("EDWIN", "vistana", 2026, MES_TODO_EL_ANIO))
      .toBe("Comisión-Edwin-Vistana-2026");
  });

  it("🔴 el título se cambia antes de imprimir y SE DEVUELVE, aunque se cancele", () => {
    const modal = plano(leer("src/components/ventas/ComisionesDetalleModal.tsx"));
    expect(modal).toContain("function imprimirComo(");
    expect(modal).toContain("const anterior = document.title;");
    // `afterprint` cubre imprimir Y cancelar; el timeout es la red por si algún
    // navegador no lo dispara — dejarlo cambiado renombraría toda la app.
    expect(modal).toContain('window.addEventListener("afterprint", restaurar)');
    expect(modal).toContain("window.setTimeout(restaurar,");
    expect(modal).toContain("document.title = anterior;");
    // Y el botón de imprimir la USA: tenerla definida y no llamarla es lo mismo
    // que no tenerla.
    expect(modal).toContain("onClick={() => imprimirComo(nombreArchivo)}");
  });

  it("🔴 el Excel del detalle usa el MISMO nombre: uno solo para los dos archivos", () => {
    expect(plano(leer("src/lib/ventas/comisionExcel.ts")))
      .toContain("nombreArchivoComision(d.vendedor, d.empresa_key, d.year, d.mes)");
  });
});

// ═══ 14 · El descuento, visible en la celda ═════════════════════════════════

describe("🔴 14 · la celda dice que adentro hay un descuento", () => {
  it("reconstruye el bruto del neto: septiembre 2026, Reynaldo en Fashion Shoes", () => {
    // Medido: bruto $60,00 · descuento $1.573,08 · neto −$1.513,08.
    expect(desgloseDeCelda(-1513.08, 1573.08)).toEqual({ bruto: 60, descuento: 1573.08 });
  });

  it("sin descuento no hay desglose: el resto de las celdas no cambia", () => {
    expect(desgloseDeCelda(3525.25, 0)).toBeNull();
    expect(desgloseDeCelda(3525.25, undefined)).toBeNull();
  });

  it("el descuento por empresa viaja hasta la celda, no solo el total", () => {
    const vista = plano(leer("src/components/ventas/ComisionesConsolidadoView.tsx"));
    expect(vista).toContain("descuentoPorEmpresa");
    expect(vista).toContain("desgloseDeCelda(val, desc)");
  });
});

// ═══ 15 · «Todo el año» ═════════════════════════════════════════════════════

describe("🔴 15 · «Todo el año» en el selector de período", () => {
  it("no es un mes: es su ausencia", () => {
    expect(MES_TODO_EL_ANIO).toBe(0);
    expect(esTodoElAnio(0)).toBe(true);
    expect(esTodoElAnio(8)).toBe(false);
    expect(ROTULO_TODO_EL_ANIO).toBe("Todo el año");
  });

  it("un mes pide un mes; el año en curso se corta en el mes en curso (Panamá)", () => {
    expect(mesesDelPeriodo(2026, 8, "2026-09-06")).toEqual([8]);
    expect(mesesDelPeriodo(2026, 0, "2026-09-06")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Un año cerrado va entero; uno futuro no tiene meses que pedir.
    expect(mesesDelPeriodo(2025, 0, "2026-09-06")).toHaveLength(12);
    expect(mesesDelPeriodo(2027, 0, "2026-09-06")).toEqual([]);
  });

  it("🔴 el año es LA SUMA DE SUS MESES, no otra cuenta", () => {
    // Los 9 meses de Reynaldo en 2026, netos, medidos contra producción.
    const netos = [3462.99, 7825.11, 9373.51, 5768.85, 10822.22, 8387.25, 9325.60, 5091.64, -1513.08];
    const meses = netos.map((n) => [{ vendedor: "REYNALDO ESPINOSA", comision_total: n }]);
    const [fila] = acumularVendedores(meses);
    expect(fila.comision_total).toBe(58544.09);
  });

  it("🔴 y se redondea a dos: los montos vienen de dos fuentes", () => {
    // Sin redondear, 0,1 + 0,2 en coma flotante da 0.30000000000000004 — y eso
    // llega a la pantalla como un total que no cuadra con sus meses.
    const meses = [[{ vendedor: "EDWIN", comision_total: 0.1 }], [{ vendedor: "EDWIN", comision_total: 0.2 }]];
    expect(acumularVendedores(meses)[0].comision_total).toBe(0.3);
  });

  it("la tasa NO se suma —sumar 0,5 % doce veces daría 6 %— y se CONSERVA la vigente", () => {
    const meses = [
      [{ vendedor: "EDWIN", comision_total: 100, tasa: 0.005 }],
      // A mitad de año le subieron la tasa: la del año es la ÚLTIMA, no la
      // primera y mucho menos la suma.
      [{ vendedor: "EDWIN", comision_total: 50, tasa: 0.01 }],
    ];
    const [fila] = acumularVendedores(meses) as { comision_total: number; tasa: number }[];
    expect(fila.comision_total).toBe(150);
    expect(fila.tasa).toBe(0.01);
  });

  it("el rótulo del período y del archivo lo dicen", () => {
    expect(etiquetaPeriodo(2026, 0)).toBe("Todo 2026");
    expect(etiquetaPeriodoCorta(2026, 0)).toBe("Todo 2026");
    expect(etiquetaPeriodo(2026, 8)).toBe("Agosto 2026");
    expect(etiquetaPeriodoCorta(2026, 8)).toBe("Ago 2026");
    expect(sufijoArchivoPeriodo(2026, 8)).toBe("2026-08");
    expect(sufijoArchivoPeriodo(2026, 0)).toBe("2026");
  });

  it("🔴 las dos rutas lo aceptan, y ninguna otra cosa fuera de 1..12", () => {
    for (const f of [
      "src/app/api/ventas/comisiones/route.ts",
      "src/app/api/ventas/comisiones/consolidado/route.ts",
    ]) {
      const src = plano(leer(f));
      expect(src, f).toContain("mes < MES_TODO_EL_ANIO || mes > 12");
      expect(src, f).toContain("mesesDelPeriodo(year, mes, hoyPanama())");
      // 🔴 Se netea MES A MES y recién después se suma: la vigencia de un
      // descuento puede empezar a mitad de año.
      expect(src, f).toContain("acumularVendedores(");
      expect(src, f).toContain("netearComisiones(");
    }
  });
});

// ═══ 16 · Un cliente, varias empresas de una vez ════════════════════════════

describe("🔴 16 · «Clientes que no comisionan» acepta VARIAS empresas", () => {
  const base = { cliente_codigo: "d-104 ", vendedor: "reynaldo espinosa" };

  it("una decisión → una fila POR EMPRESA (el grano de la tabla no cambia)", () => {
    const r = validarExclusionesNuevas({ ...base, empresa_keys: ["vistana", "active_wear", "joystep"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toHaveLength(3);
    expect(r.valor.map((x) => x.empresa_key)).toEqual(["vistana", "active_wear", "joystep"]);
    // Y cada una normalizada igual que siempre: UPPER(TRIM(…)).
    for (const x of r.valor) {
      expect(x.cliente_codigo).toBe("D-104");
      expect(x.vendedor).toBe("REYNALDO ESPINOSA");
      expect(x.excluye_venta).toBe(true);
      expect(x.excluye_cobro).toBe(true);
    }
  });

  it("el cuerpo VIEJO de una sola empresa sigue funcionando", () => {
    const r = validarExclusionesNuevas({ ...base, empresa_key: "vistana" });
    expect(r.ok && r.valor).toHaveLength(1);
  });

  it("sin empresas es un error con texto, nunca una lista vacía que no hace nada", () => {
    const r = validarExclusionesNuevas(base);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("Elige al menos una empresa");
  });

  it("una empresa que no comisiona tira TODO el alta (fail-closed)", () => {
    const r = validarExclusionesNuevas({ ...base, empresa_keys: ["vistana", "american_classic"] });
    expect(r.ok).toBe(false);
  });

  it("🔴 la que ya estaba NO tira a las demás — es justo el caso de D-104", () => {
    const ruta = plano(leer("src/app/api/ventas/comisiones/exclusiones/route.ts"));
    expect(ruta).toContain("if (r.status === 409) { yaEstaban.push(valor.empresa_key); continue; }");
    // Pero si NINGUNA se escribió, se dice: un 201 vacío sería mentir.
    expect(ruta).toContain("if (ids.length === 0) {");
  });
});

// ═══ 18 · Fuera «N vendedores sin actividad este mes» ═══════════════════════

describe("🔴 18 · se fue el renglón que decía que no hay nada que decir", () => {
  it("ninguna superficie lo escribe", () => {
    for (const f of [
      "src/components/ventas/ComisionesConsolidadoView.tsx",
      "src/components/ventas/ComisionesPorEmpresaView.tsx",
      "src/components/ventas/ComisionesTarjetas.tsx",
    ]) {
      expect(plano(leer(f)), f).not.toMatch(/sin actividad/i);
    }
  });
});

// ═══ 19 y 20 · Los rótulos ══════════════════════════════════════════════════

describe("🔴 19 · los botones dicen QUÉ traen, y el verbo es «Descargar»", () => {
  it("el del período dice el mes o el año", () => {
    expect(rotuloDescargarPeriodo(8)).toBe("Descargar el mes");
    expect(rotuloDescargarPeriodo(MES_TODO_EL_ANIO)).toBe("Descargar el año");
    expect(plano(leer("src/components/ventas/ComisionesView.tsx"))).toContain("rotuloDescargarPeriodo(mes)");
  });

  it("el del detalle dice que es el detalle", () => {
    expect(plano(leer("src/components/ventas/ComisionesDetalleModal.tsx"))).toContain("Descargar el detalle");
  });

  it("🔴 y los 5 botones del sistema que decían «Exportar» o «Bajar» ya dicen «Descargar»", () => {
    // Medido el 6-sep-2026: el sistema decía «Descargar» 23 veces contra 5
    // formas raras. Daniel: «a, pero descargar, no bajar, como esté en todos los
    // módulos». Cada uno conserva QUÉ descarga.
    const esperado: [string, string][] = [
      ["src/app/cxc/components/PanelCxcMobile.tsx", "Descargar CSV"],
      ["src/app/proveedores/ProveedoresListClient.tsx", "Descargar Excel"],
      ["src/app/marketing/components/DetallePeriodoView.tsx", "Descargar ZIP"],
      ["src/components/ventas/ReferenciaView.tsx", "Descargar Excel"],
      ["src/components/catalogo/ComprobantesPanel.tsx", "Descargar Excel"],
    ];
    for (const [f, texto] of esperado) {
      const src = plano(leer(f));
      expect(src, f).toContain(texto);
      expect(src, f).not.toMatch(/"Exportar (Excel|CSV|ZIP)"|"Bajar (a Excel|ZIP|CSV)"/);
    }
  });
});

describe("🔴 20 · los que no se pagan, detrás de «Ver los que no se pagan»", () => {
  it("el rótulo dice cuántos hay: no se abre a ciegas", () => {
    expect(rotuloVerNoSePagan(2)).toBe("Ver los que no se pagan (2)");
    expect(ROTULO_VER_MENOS).toBe("Ver menos");
  });

  it("🔴 el CÁLCULO no cambia: sigue mandando `VENDEDORES_SIN_PAGO` y `sumarPagable`", () => {
    const sinPago = leer("src/lib/comisiones/sin-pago.ts");
    expect(sinPago).toContain('export const VENDEDORES_SIN_PAGO: readonly string[] = ["DEFAULT", "DANIEL LEVY"];');
    expect(sinPago).toContain("export function sumarPagable");
    for (const f of [
      "src/components/ventas/ComisionesConsolidadoView.tsx",
      "src/components/ventas/ComisionesPorEmpresaView.tsx",
    ]) {
      expect(plano(leer(f)), f).toContain("sumarPagable(");
    }
  });

  it("🔴 y el Excel los SIGUE llevando: esconderlos en pantalla no los borra del papel", () => {
    const excel = plano(leer("src/lib/ventas/comisionExcel.ts"));
    expect(excel).toContain("ROTULO_NO_SE_PAGA");
    expect(plano(leer("src/components/ventas/ComisionesConsolidadoView.tsx")))
      .toContain("vendedores: conActividad.map(");
  });
});

// ═══ La estructura: un selector, sin pestañas ═══════════════════════════════

describe("🔴 se fueron las CUATRO pestañas: un selector y un ⚙", () => {
  const shell = plano(leer("src/components/ventas/ComisionesView.tsx"));

  it("la primera opción se llama «Fashion Group», NUNCA «Todas»", () => {
    expect(ROTULO_GRUPO).toBe("Fashion Group");
    expect(OPCIONES_VISTA[0]).toMatchObject({ valor: VISTA_GRUPO, etiqueta: "Fashion Group" });
    expect(OPCIONES_VISTA.some((o) => /^Todas/i.test(o.etiqueta))).toBe(false);
  });

  it("el orden es: el grupo, las 6, una línea, y Multifashion", () => {
    expect(OPCIONES_VISTA.map((o) => o.valor)).toEqual([
      "grupo", "vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep",
      "american_classic",
    ]);
    // La línea va SOLO antes de Multifashion, y sin rótulo.
    expect(OPCIONES_VISTA.filter((o) => o.separadorAntes).map((o) => o.valor)).toEqual([VISTA_MULTIFASHION]);
  });

  it("🔴 «Fashion Group» NO incluye Multifashion: nunca se suman", () => {
    // Dos comisiones calculadas distinto (0,5 % con filtro de utilidad > 20 %
    // contra 0,5 % sobre toda la venta). Medido en agosto 2026: $5.978,55
    // contra $255,27.
    expect(esVistaDeEmpresa(VISTA_MULTIFASHION)).toBe(false);
    expect(plano(leer("src/components/ventas/ComisionesConsolidadoView.tsx")))
      .not.toMatch(/american_classic/i);
  });

  it("un `?tab=` viejo (y el modo guardado) llegan a su vista equivalente", () => {
    expect(resolverVista("todas", null, true)).toEqual({ vista: "grupo", config: false });
    expect(resolverVista("multifashion", null, true)).toEqual({ vista: "american_classic", config: false });
    expect(resolverVista("empresa", "joystep", true)).toEqual({ vista: "joystep", config: false });
    // «Por empresa» sin memoria cae a la primera de las 6, nunca a una en blanco.
    expect(resolverVista("empresa", null, true)).toEqual({ vista: "vistana", config: false });
    // Cualquier cosa desconocida cae a Fashion Group.
    expect(resolverVista("lo-que-sea", null, true)).toEqual({ vista: "grupo", config: false });
    expect(resolverVista(null, null, false)).toEqual({ vista: "grupo", config: false });
  });

  it("🔴 «config» solo lo abre un admin, y NO cambia de empresa: se abre encima", () => {
    expect(resolverVista("config", null, true)).toEqual({ vista: "grupo", config: true });
    expect(resolverVista("config", null, false)).toEqual({ vista: "grupo", config: false });
  });

  it("🔴 el ⚙ está SIEMPRE, en el mismo lugar: Configuración es del MÓDULO", () => {
    // Daniel: «a y con, para que no se sienta que desapareció un botón». No hay
    // ninguna lógica que lo esconda según la empresa elegida.
    expect(shell).toContain("{hayConfig && (");
    expect(shell).not.toMatch(/hayConfig && !enConfig/);
    expect(shell).toContain('aria-label="Configuración"');
    expect(shell).toContain("aria-pressed={enConfig}");
  });

  it("y ninguna de las cuatro pestañas volvió", () => {
    for (const etiqueta of ["Todas las empresas", "Por empresa"]) {
      expect(shell).not.toContain(`"${etiqueta}"`);
    }
    expect(shell).not.toContain("aria-current={mode ===");
  });
});
