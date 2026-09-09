/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CUENTAS POR COBRAR — «DESCARGAR» SON DOS COSAS, Y LAS DOS EN PDF Y EXCEL
 * (8-sep-2026).
 *
 * Lo que este candado sostiene, cada línea con su defecto medido detrás:
 *
 *  1. El botón dice **«Descargar»** y ofrece **DOS** líneas sin subtítulo, LAS
 *     MISMAS en la computadora y en el celular. Eran tres con subtítulo en una
 *     pantalla y un CSV distinto en la otra.
 *  2. **Los dos CSV se fueron.** Daniel: *«en ningún lado quiero exportar CSV,
 *     solo Excel»*.
 *  3. El archivo trae **`Código · Cliente · los TRES tramos · Total`** y NADA
 *     de `Estado · Correo · Teléfono · Celular · Contacto` — Daniel: *«no
 *     quisiera eso»*.
 *  4. El nombre del cliente va **capitalizado**. Medido contra producción:
 *     **211 de las 213 filas** de la cartera difieren entre `nombre` (el de
 *     Switch, capitalizado) y `nombre_normalized` (la llave, en MAYÚSCULAS).
 *  5. 🩸 **El detallado se contradecía a sí mismo**: con una empresa en el
 *     filtro ponía el total de ESA empresa y debajo listaba LAS SEIS. Medido con
 *     Vistana: encabezados $843.742,90 contra filas $3.141.567,95.
 *  6. 🩸 **Al saldo A FAVOR no se le cobra**: 5 clientes, −$1.220,05, y el
 *     mensaje de WhatsApp les decía «Total: $-1,147.52 — agradecemos su pronta
 *     atención a este saldo».
 *  7. El **vendedor descarga igual que el admin** — Daniel: *«que lo pueda usar
 *     igual que yo, a todo su poder»*.
 *  8. `/api/cxc/aging-por-cliente` deja de aceptar a **`contabilidad`**, un rol
 *     que no tiene el módulo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import { B2B_COMPANIES } from "@/lib/companies";
import { AGING_ORDER, tramoLabel } from "@/lib/cxc-aging";
import { seLeCobra } from "@/lib/cxc/cobrable";
import { ROLES_CXC, veCxc } from "@/lib/cxc/roles";
import {
  ENCABEZADO_DESCARGAS,
  ROTULO_DESCARGA,
  bloquesPorCompania,
  clientesDeLaDescarga,
  codigoDeCliente,
  companiasDeLaVista,
  filasTotalPorCliente,
  nombreArchivoDescarga,
  nombreDeCliente,
  subtituloDelPapel,
  totalDeLasFilas,
} from "@/lib/cxc/descargas";
import { libroPorCompania, libroTotalPorCliente } from "@/lib/cxc/excel-cartera";

const RAIZ = process.cwd();
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const plano = (rel: string) => sinComentarios(leer(rel));

const PAGINA = "src/app/cxc/page.tsx";
const CELULAR = "src/app/cxc/components/PanelCxcMobile.tsx";
const MENU = "src/app/cxc/components/MenuDescargar.tsx";
const PAPEL = "src/lib/pdf-cxc.ts";
const HOJA = "src/lib/cxc/excel-cartera.ts";

// ── Fixture: dos clientes en dos empresas, y uno con saldo a favor ───────────

function empresa(codigo: string, nombre: string, buckets: Partial<Record<string, number>>) {
  const base = { d0_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, d121_180: 0, d181_270: 0, d271_365: 0, mas_365: 0 };
  const b = { ...base, ...buckets };
  return {
    nombre, codigo, ...b,
    total: b.d0_30 + b.d31_60 + b.d61_90 + b.d91_120 + b.d121_180 + b.d181_270 + b.d271_365 + b.mas_365,
    ultimoPagoFecha: null, ultimoPagoMonto: null, ultimaCompraFecha: null, ultimaCompraMonto: null,
  };
}

function cliente(llave: string, companies: Record<string, ReturnType<typeof empresa>>): ConsolidatedClient {
  let current = 0, watch = 0, overdue = 0, total = 0;
  for (const co of Object.values(companies)) {
    current += co.d0_30 + co.d31_60 + co.d61_90;
    watch += co.d91_120;
    overdue += co.d121_180 + co.d181_270 + co.d271_365 + co.mas_365;
    total += co.total;
  }
  return {
    nombre_normalized: llave, companies,
    correo: "", telefono: "", celular: "", contacto: "",
    total, current, watch, overdue,
    d0_30: 0, d31_60: 0, d61_90: 0, d91_120: watch, d121_plus: overdue,
  } as unknown as ConsolidatedClient;
}

const CITY = cliente("CITY MALL PASO CANOA", {
  vistana: empresa("D-25", "City Mall Paso Canoa", { d0_30: 1000, d91_120: 200 }),
  fashion_wear: empresa("D-25", "City Mall Paso Canoa", { d121_180: 500 }),
});
const A_FAVOR = cliente("VIVA PANAMA DUTTY FREE", {
  vistana: empresa("D-139", "Viva Panama Dutty Free", { d0_30: -1147.52 }),
});
const CARTERA = [CITY, A_FAVOR];

const DOS: Company[] = B2B_COMPANIES.filter((c) => c.key === "vistana" || c.key === "fashion_wear");

// ─────────────────────────────────────────────────────────────────────────────
// 1 · El menú: dos líneas, sin subtítulo, iguales en las dos pantallas
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 1 · «Descargar» ofrece DOS cosas, no tres", () => {
  it("las dos líneas y su encabezado", () => {
    expect(ENCABEZADO_DESCARGAS).toBe("Todos los clientes");
    expect(Object.values(ROTULO_DESCARGA)).toEqual(["Total por cliente", "Detallado por compañía"]);
  });

  it("el botón dice «Descargar», no «Exportar»", () => {
    const src = plano(PAGINA);
    expect(src).toContain(">\n                Descargar\n              </button>");
    expect(src, "«Exportar» volvió al botón").not.toMatch(/>\s*Exportar\s*</);
  });

  it("🩸 se fueron las TRES opciones viejas y sus subtítulos", () => {
    const src = plano(PAGINA);
    for (const viejo of ["CSV (Excel)", "PDF Resumen", "PDF Detallado", "Hoja de cálculo con el detalle", "listo para imprimir"]) {
      expect(src, `«${viejo}» volvió al menú`).not.toContain(viejo);
    }
  });

  it("🔴 la computadora y el celular montan el MISMO menú", () => {
    expect(plano(PAGINA)).toContain("<MenuDescargar");
    expect(plano(CELULAR)).toContain("<MenuDescargar");
    // Y ninguna de las dos arma su propia lista de opciones.
    for (const f of [PAGINA, CELULAR]) {
      expect(plano(f), `${f} volvió a escribir los rótulos a mano`).not.toContain("Total por cliente");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Los dos CSV se fueron
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 2 · en ningún lado se exporta CSV", () => {
  it("`exportCSV` y el CSV del celular no existen más", () => {
    const src = plano(PAGINA);
    expect(src).not.toContain("function exportCSV");
    expect(src).not.toContain("csv-export");
    expect(plano(CELULAR)).not.toContain("Descargar CSV");
    expect(plano(CELULAR)).not.toContain("onExportarCsv");
  });

  it("⚠️ pero `lib/csv-export.ts` NO se borró: lo usa Reclamos", () => {
    expect(fs.existsSync(path.join(RAIZ, "src/lib/csv-export.ts"))).toBe(true);
    expect(plano("src/app/api/reclamos/export/route.ts")).toContain("csv-export");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Las columnas: los tres tramos, y nada de contacto
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 3 · qué columnas trae cada archivo", () => {
  it("«Total por cliente»: Código · Cliente · tres tramos · Total", () => {
    const ws = libroTotalPorCliente(filasTotalPorCliente(CARTERA), "x").Sheets["Cartera"];
    const cabecera = ["A3", "B3", "C3", "D3", "E3", "F3"].map((c) => ws[c]?.v);
    expect(cabecera).toEqual([
      "Código", "Cliente",
      tramoLabel("current"), tramoLabel("watch"), tramoLabel("overdue"), "Total",
    ]);
  });

  it("«Detallado por compañía»: la Compañía entra en el medio y nada más", () => {
    const ws = libroPorCompania(bloquesPorCompania(CARTERA, DOS), "x").Sheets["Cartera por compañía"];
    const cabecera = ["A3", "B3", "C3", "D3", "E3", "F3", "G3"].map((c) => ws[c]?.v);
    expect(cabecera).toEqual([
      "Código", "Cliente", "Compañía",
      tramoLabel("current"), tramoLabel("watch"), tramoLabel("overdue"), "Total",
    ]);
  });

  it("🔴 NO vuelven Estado · Correo · Teléfono · Celular · Contacto", () => {
    const hoja = plano(HOJA);
    for (const col of ["Estado", "Correo", "Teléfono", "Telefono", "Celular", "Contacto"]) {
      expect(hoja, `volvió la columna «${col}»`).not.toContain(`"${col}"`);
    }
  });

  it("🔴 son los TRES tramos de la pantalla, no los ocho finos", () => {
    const hoja = plano(HOJA);
    expect(AGING_ORDER).toHaveLength(3);
    for (const fino of ["0-30", "31-60", "61-90", "121-180", "181-270", "271-365", "+365"]) {
      expect(hoja, `volvió el tramo fino «${fino}»`).not.toContain(`"${fino}"`);
    }
    // …y el nombre lo pone `tramoLabel`, no este archivo.
    expect(hoja).toContain("tramoLabel");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · El nombre capitalizado
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 4 · el nombre del cliente se LEE, no se grita", () => {
  it("sale de `nombre` (el de Switch), no de la llave en mayúsculas", () => {
    expect(nombreDeCliente(CITY)).toBe("City Mall Paso Canoa");
    expect(nombreDeCliente(CITY)).not.toBe(CITY.nombre_normalized);
  });

  it("sin nombre de Switch cae a la llave — no se inventa un texto", () => {
    const sinNombre = cliente("SIN NOMBRE", { vistana: empresa("D-99", "", { d0_30: 10 }) });
    expect(nombreDeCliente(sinNombre)).toBe("SIN NOMBRE");
  });

  it("la identidad sigue siendo el CÓDIGO", () => {
    expect(codigoDeCliente(CITY)).toBe("D-25");
  });

  it("y en las filas del archivo va el capitalizado", () => {
    const filas = filasTotalPorCliente([CITY]);
    expect(filas[0].nombre).toBe("City Mall Paso Canoa");
    expect(bloquesPorCompania([CITY], DOS)[0].nombre).toBe("City Mall Paso Canoa");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 · 🩸 Lo que se descarga es lo que se está viendo
// ─────────────────────────────────────────────────────────────────────────────

describe("🩸 5 · el detallado ya no se contradice a sí mismo", () => {
  it("con una empresa en el filtro se lista ESA empresa y nada más", () => {
    const soloVistana = companiasDeLaVista(DOS, "vistana");
    expect(soloVistana.map((c) => c.key)).toEqual(["vistana"]);
    const bloque = bloquesPorCompania([CITY], soloVistana)[0];
    expect(bloque.empresas).toHaveLength(1);
    expect(bloque.empresas[0].empresa).toBe("Vistana International");
  });

  it("🔑 y el total del cliente cuadra con la suma de sus renglones", () => {
    const bloque = bloquesPorCompania([CITY], companiasDeLaVista(DOS, "vistana"))[0];
    expect(bloque.total).toBe(1200);
    expect(bloque.total).toBe(bloque.empresas.reduce((s, e) => s + e.total, 0));
  });

  it("🔑 y la pantalla SÍ le pasa el filtro al archivo", () => {
    // Sin esta línea el módulo puro estaría bien y el papel seguiría mal: el
    // defecto original era justo ese, la decisión correcta sin nadie que la use.
    const hook = plano("src/app/cxc/hooks/useDescargasCartera.ts");
    expect(hook).toContain("companiasDeLaVista(cxcCompanies, companyFilter)");
    expect(hook).toContain("bloquesPorCompania(filtered, companias)");
  });

  it("con «Todas» se listan las que la pantalla muestra", () => {
    expect(companiasDeLaVista(DOS, "all")).toHaveLength(2);
    expect(bloquesPorCompania([CITY], DOS)[0].empresas).toHaveLength(2);
  });

  it("una empresa en cero no dibuja renglón", () => {
    const bloque = bloquesPorCompania([CITY], B2B_COMPANIES)[0];
    expect(bloque.empresas).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6 · 🩸 Al saldo a favor no se le cobra
// ─────────────────────────────────────────────────────────────────────────────

describe("🩸 6 · el saldo a favor sale del cobro y de las descargas", () => {
  it("la regla: solo el saldo positivo se cobra", () => {
    expect(seLeCobra(1200)).toBe(true);
    expect(seLeCobra(-1147.52)).toBe(false);
    expect(seLeCobra(0)).toBe(false);
  });

  it("no entra a ninguno de los dos archivos", () => {
    expect(clientesDeLaDescarga(CARTERA)).toHaveLength(1);
    expect(filasTotalPorCliente(CARTERA).map((f) => f.codigo)).toEqual(["D-25"]);
    expect(bloquesPorCompania(CARTERA, DOS).map((b) => b.codigo)).toEqual(["D-25"]);
  });

  it("🔴 y por eso el Total del archivo no lo resta", () => {
    expect(totalDeLasFilas(filasTotalPorCliente(CARTERA)).total).toBe(1700);
  });

  it("⚠️ en la PANTALLA sigue viéndose, en su bloque «Saldo a favor»", () => {
    const tabla = plano("src/app/cxc/components/ClientTable.tsx");
    expect(tabla).toContain("Saldo a favor");
    expect(tabla).toContain("filtered.filter((c) => c.total < 0)");
  });

  it("⚠️ el mostrador TCKCTA no se retira por serlo: lo decide su saldo", () => {
    const descargas = plano("src/lib/cxc/descargas.ts");
    const cobrable = plano("src/lib/cxc/cobrable.ts");
    expect(descargas + cobrable, "se está filtrando por el código del mostrador").not.toContain("TCKCTA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 · El papel: un solo encabezado, un solo pie, el navy de la casa
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 7 · los dos PDF son el MISMO documento", () => {
  const papel = plano(PAPEL);

  it("los dos llaman a la misma cabecera y al mismo pie", () => {
    expect((papel.match(/cabecera\(doc, opts\.subtitulo, opts\.hoy\)/g) ?? [])).toHaveLength(2);
    expect((papel.match(/piePorHoja\(doc\)/g) ?? [])).toHaveLength(2);
    expect((papel.match(/\.\.\.estilosDeTabla\(\)/g) ?? [])).toHaveLength(2);
  });

  it("🩸 y no vuelven los DOS encabezados de tabla que no se parecían", () => {
    // Uno era casi blanco (#F9FAFB / 249,250,251) y el otro casi negro
    // (#111827 / 17,24,39). Ahora los dos usan el navy de la casa.
    expect(papel).toContain("const NAVY: [number, number, number] = [27, 58, 92];");
    expect((papel.match(/headStyles:/g) ?? [])).toHaveLength(1);
    expect(papel).not.toContain("fillColor: [249, 250, 251]");
  });

  it("el brandbook: logo, fecha, «Hoja N de M», Confidencial y fashiongr.com", () => {
    expect(papel).toContain("FG_LOGO_BASE64");
    expect(papel).toContain("doc.text(fmtDate(hoy)");
    expect(papel).toContain("Hoja ${i} de ${hojas}");
    expect(papel).toContain('doc.text("Confidencial"');
    expect(papel).toContain('doc.text("fashiongr.com"');
  });

  it("🔴 el detallado pone la suma del cliente ABAJO de sus compañías", () => {
    // Daniel: «se tiene que sumar el total del cliente y ponerlo ABAJO del
    // cliente, las sumas, no arriba». El encabezado del bloque lleva el nombre;
    // el total va en el renglón que CIERRA el bloque.
    const bloque = papel.slice(papel.indexOf("for (const b of bloques)"), papel.indexOf("autoTable(doc, {", papel.indexOf("for (const b of bloques)")));
    const nombre = bloque.indexOf("content: b.nombre");
    const empresas = bloque.indexOf("for (const e of b.empresas)");
    const total = bloque.indexOf("Total ${b.nombre}");
    expect(nombre).toBeGreaterThan(-1);
    expect(empresas).toBeGreaterThan(nombre);
    expect(total).toBeGreaterThan(empresas);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8 · El Excel: el estándar de la casa
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 8 · el Excel sale por el estándar de la casa", () => {
  it("título en la fila 1, fila 2 VACÍA, encabezados en la 3", () => {
    const ws = libroTotalPorCliente(filasTotalPorCliente(CARTERA), "Total por cliente — Vistana").Sheets["Cartera"];
    expect(ws["A1"]?.v).toBe("Total por cliente — Vistana");
    expect(ws["A2"]).toBeUndefined();
    expect(ws["A3"]?.v).toBe("Código");
  });

  it("…con FILTRO desde los encabezados, y el Total fuera del filtro", () => {
    const ws = libroTotalPorCliente(filasTotalPorCliente(CARTERA), "x").Sheets["Cartera"];
    // 1 cliente cobrable → A3 encabezados, A4 su fila.
    expect(ws["!autofilter"]).toEqual({ ref: "A3:F4" });
  });

  it("🔴 la plata es NÚMERO con formato, nunca el texto «$1,234.56»", () => {
    const ws = libroTotalPorCliente(filasTotalPorCliente(CARTERA), "x").Sheets["Cartera"];
    expect(ws["F4"]?.t).toBe("n");
    expect(ws["F4"]?.v).toBe(1700);
    expect(ws["F4"]?.z).toBe("$#,##0.00");
  });

  it("🔴 en el Excel el código y el cliente se REPITEN en cada renglón", () => {
    // En el papel las compañías van adentro del cliente; en la hoja no: sin el
    // nombre en cada fila no se puede filtrar ni armar una tabla dinámica.
    const ws = libroPorCompania(bloquesPorCompania(CARTERA, DOS), "x").Sheets["Cartera por compañía"];
    expect([ws["A4"]?.v, ws["B4"]?.v, ws["C4"]?.v]).toEqual(["D-25", "City Mall Paso Canoa", "Vistana International"]);
    expect([ws["A5"]?.v, ws["B5"]?.v, ws["C5"]?.v]).toEqual(["D-25", "City Mall Paso Canoa", "Fashion Wear"]);
  });

  it("sale por `workbookBytes` (la fila fija la pone él)", () => {
    expect(plano("src/app/cxc/hooks/useDescargasCartera.ts")).toContain("downloadWorkbook");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9 · Los nombres de archivo, con su fecha
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 9 · el archivo dice qué es, de quién y de cuándo", () => {
  it("los cuatro nombres", () => {
    expect(nombreArchivoDescarga("total-por-cliente", "pdf", "2026-09-08")).toBe("CXC-cartera-2026-09-08.pdf");
    expect(nombreArchivoDescarga("total-por-cliente", "xlsx", "2026-09-08")).toBe("CXC-cartera-2026-09-08.xlsx");
    expect(nombreArchivoDescarga("por-compania", "pdf", "2026-09-08")).toBe("CXC-cartera-por-compania-2026-09-08.pdf");
    expect(nombreArchivoDescarga("por-compania", "xlsx", "2026-09-08")).toBe("CXC-cartera-por-compania-2026-09-08.xlsx");
  });

  it("🩸 la fecha no se pierde en el camino: viaja en el nombre que se pasa", () => {
    // El caso conocido (Caja) es el servidor armando el nombre y el navegador
    // guardándolo sin fecha. Acá el nombre se arma de este lado y va entero al
    // `download` y al `doc.save()`.
    const hook = plano("src/app/cxc/hooks/useDescargasCartera.ts");
    expect((hook.match(/nombreArchivoDescarga\(clave, "pdf", hoy\)/g) ?? [])).toHaveLength(2);
    expect((hook.match(/nombreArchivoDescarga\(clave, "xlsx", hoy\)/g) ?? [])).toHaveLength(2);
    expect(hook).toContain("hoyPanama()");
  });

  it("el subtítulo dice qué es y de qué empresa", () => {
    expect(subtituloDelPapel("total-por-cliente", "Vistana International"))
      .toBe("Total por cliente — Vistana International");
    expect(subtituloDelPapel("por-compania", null))
      .toBe("Detallado por compañía — Fashion Group · 6 empresas");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10 · Los permisos
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 10 · quién descarga y quién entra", () => {
  it("descarga TODO el que ve el módulo, también el vendedor", () => {
    expect([...ROLES_CXC]).toEqual(["admin", "secretaria", "vendedor"]);
    expect(veCxc("vendedor")).toBe(true);
    expect(veCxc("bodega")).toBe(false);
    expect(veCxc("contabilidad")).toBe(false);
    // Y la pantalla lo DERIVA, no lo vuelve a escribir.
    const src = plano(PAGINA);
    expect(src).toContain("const canExport = veCxc(userRole);");
    expect(src).not.toContain('userRole === "admin" || userRole === "secretaria"');
  });

  it("⚠️ `/api/cxc/aging-por-cliente` deja de aceptar a `contabilidad`", () => {
    const ruta = plano("src/app/api/cxc/aging-por-cliente/[codigo]/route.ts");
    expect(ruta).toContain("const READ_ROLES = rolesCxc();");
    expect(ruta).not.toContain('"contabilidad"');
  });

  it("…y su único llamador es la tarjeta de Ventas, que solo abre admin", () => {
    const usos = ["src/components/ventas/ClienteHoverCard.tsx"];
    for (const f of usos) expect(plano(f)).toContain("/api/cxc/aging-por-cliente/");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11 · ⚠️ Nada de esto tocó a Boston ni a la separación de carteras
// ─────────────────────────────────────────────────────────────────────────────

describe("⚠️ 11 · Boston no se mezcla ni por acá", () => {
  it("ni el módulo de decisiones ni los dos formatos nombran a Boston", () => {
    for (const f of ["src/lib/cxc/descargas.ts", HOJA, PAPEL, "src/app/cxc/hooks/useDescargasCartera.ts"]) {
      expect(plano(f), `${f} nombra a Boston`).not.toMatch(/confecciones_boston|american_classic/);
    }
  });

  it("las empresas salen de la lista del CXC, que ya excluye a Boston", () => {
    expect(B2B_COMPANIES.map((c) => c.key)).not.toContain("confecciones_boston");
    expect(companiasDeLaVista(B2B_COMPANIES, "all")).toHaveLength(6);
  });
});
