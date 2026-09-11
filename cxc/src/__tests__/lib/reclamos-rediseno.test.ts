/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO — EL REDISEÑO DE RECLAMOS (10/11-sep-2026), la parte PURA y los barridos.
 *
 * Daniel, textual: «el uso es poner el reclamo y guardar para saber que nos
 * deben… solo se crea, se descarga y se manda… lo más importante es tener el
 * dato y saber si se pagó o no». Cada bloque de abajo es una decisión suya con
 * su cita, y lo que pasa si se rompe.
 *
 * Medido contra producción el 10-sep-2026 (antes y después, idénticos):
 *   29 por cobrar · $14.939,64 — 20 reclamados $5.347,61 · 9 sin reclamar $9.592,03.
 *
 * Los barridos BORRAN LOS COMENTARIOS PRIMERO: este repo ya pagó varias veces
 * el candado que se cumple con su propia explicación.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { facturasDe, facturasATexto, facturasEnPantalla } from "@/lib/reclamos/facturas";
import { EMPRESAS_CON_RECLAMOS, EMPRESAS_SIN_TARJETA, TODAVIA_SIN_RECLAMOS, empresaDesdeFacturada } from "@/lib/reclamos/empresas-con-reclamos";
import { EMPRESAS } from "@/lib/reclamos/empresas";
import { estaReclamado, textoReclamado, sinReclamar, SIN_RECLAMAR } from "@/lib/reclamos/reclamado";
import { FILTRO_DEFAULT, filtroDesdeUrl, filtrarPorEstado, ordenarPorFactura, FALTA_FECHA_FACTURA } from "@/lib/reclamos/orden";
import { resumenPortada, tarjetasPorEmpresa, totalDe } from "@/lib/reclamos/portada";
import { diasDesde } from "@/lib/reclamos/dias";
import { normalizarLineas, buscarLineas, itemDesdeLinea, filaRepetida, resumenRenglones, itemsAGuardar, ROTULOS_LINEAS } from "@/lib/reclamos/lineas-factura";
import { PROMPT_LECTOR, parsearRespuestaLector } from "@/lib/reclamos/lector-factura";
import { motivoEnPantalla, notaEnPantalla, notaCorreoEnviado } from "@/lib/reclamos/texto";
import { validateReclamoNuevo, validateReclamoFull, FALTA_PDF } from "@/lib/reclamos/validate";
import { NOVEDADES } from "@/lib/novedades/lista";
import { emptyItem } from "@/app/reclamos/components/constants";

const leer = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const HOY = "2026-09-10";

/* ═══ 1 · las facturas son una lista ═══════════════════════════════════════ */
describe("🔴 las facturas de un reclamo son una LISTA, no un renglón de texto", () => {
  it("parte por ' - ', coma, «·», espacios y el guion entre dos números largos", () => {
    expect(facturasDe("2000013357 - 2000012927 - 2000012953")).toEqual(["2000013357", "2000012927", "2000012953"]);
    expect(facturasDe("3000011223-3000014639")).toEqual(["3000011223", "3000014639"]);
    expect(facturasDe("a, b · c")).toEqual(["a", "b", "c"]);
  });
  it("un guion adentro de un número corto NO separa (F-1000 es una factura)", () => {
    expect(facturasDe("F-1000")).toEqual(["F-1000"]);
  });
  it("las pegadas SIN separador no se adivinan: eso lo corrige la migración por id", () => {
    // REC-2026-0019 tal cual estaba: dos pegadas y un ' -   ' colgando.
    expect(facturasDe("3000012777 - 3000010397 -30000132323000011913 - 3000011361 -   ")).toEqual([
      "3000012777", "3000010397", "30000132323000011913", "3000011361",
    ]);
  });
  it("repetidas una sola vez; en pantalla van con «·»; se guardan con ' - '", () => {
    expect(facturasDe("3000013662 - 3000013657 - 3000013662")).toEqual(["3000013662", "3000013657"]);
    expect(facturasEnPantalla("3000013662 - 3000013657")).toBe("3000013662 · 3000013657");
    expect(facturasATexto(["3000013662", " 3000013657 ", "3000013662"])).toBe("3000013662 - 3000013657");
    expect(facturasEnPantalla(null)).toBe("");
  });
});

/* ═══ 2 · qué empresas tienen tarjeta ═══════════════════════════════════════ */
describe("🔴 «joystep quítalo» · «Active Wear puede que sí se reclame»", () => {
  it("la lista se DERIVA de EMPRESAS menos Joystep, y Active Wear se queda", () => {
    expect(EMPRESAS_SIN_TARJETA).toEqual(["Joystep"]);
    expect(EMPRESAS_CON_RECLAMOS).toEqual(EMPRESAS.filter((e) => e !== "Joystep"));
    expect(EMPRESAS_CON_RECLAMOS).toContain("Active Wear");
    expect(EMPRESAS_CON_RECLAMOS).not.toContain("Joystep");
    expect(TODAVIA_SIN_RECLAMOS).toBe("Todavía sin reclamos");
  });
  it("la empresa FACTURADA se reconoce del «Cliente» del PDF (los 4 nombres reales del bucket)", () => {
    expect(empresaDesdeFacturada("VISTANA INTERNACIONAL PANAMA, S.A.")).toBe("Vistana International");
    expect(empresaDesdeFacturada("FASHION WEAR")).toBe("Fashion Wear");
    expect(empresaDesdeFacturada("FASHION SHOES HOLDING")).toBe("Fashion Shoes");
    expect(empresaDesdeFacturada("Active Shoes SA")).toBe("Active Shoes");
    expect(empresaDesdeFacturada("Tienda de la esquina")).toBeNull();
    expect(empresaDesdeFacturada(null)).toBeNull();
  });
});

/* ═══ 3 · reclamado ═════════════════════════════════════════════════════════ */
describe("🔴 «Reclamado» se marca solo, y la pantalla lo dice", () => {
  it("con reclamado_en dice la fecha; sin él, «Sin reclamar»", () => {
    expect(textoReclamado({ reclamado_en: "2026-07-17T16:28:00Z" })).toMatch(/^Reclamado 17 jul 2026$/);
    expect(textoReclamado({ reclamado_en: null })).toBe(SIN_RECLAMAR);
    expect(estaReclamado({ reclamado_en: "" })).toBe(false);
  });
  it("sinReclamar = por cobrar y sin fecha; un pagado nunca cuenta", () => {
    const rs = [
      { id: "a", estado: "Creado", reclamado_en: null },
      { id: "b", estado: "Creado", reclamado_en: "2026-07-17T00:00:00Z" },
      { id: "c", estado: "Pagado", reclamado_en: null },
    ];
    expect(sinReclamar(rs).map((r) => r.id)).toEqual(["a"]);
  });
});

/* ═══ 4 · la página de la empresa ═══════════════════════════════════════════ */
describe("🔴 abre en «Por cobrar» y ordena por la FACTURA más vieja", () => {
  it("«los pipeline tener default los no pagados»", () => {
    expect(FILTRO_DEFAULT).toBe("por-cobrar");
    expect(filtroDesdeUrl(null)).toBe("por-cobrar");
    expect(filtroDesdeUrl("basura")).toBe("por-cobrar");
    expect(filtroDesdeUrl("cobrados")).toBe("cobrados");
  });
  it("«En proceso» (0 usos) cuenta como por cobrar; Pagado como cobrado", () => {
    const rs = [{ estado: "Creado" }, { estado: "En proceso" }, { estado: "Pagado" }];
    expect(filtrarPorEstado(rs, "por-cobrar")).toHaveLength(2);
    expect(filtrarPorEstado(rs, "cobrados")).toHaveLength(1);
  });
  it("«viejo es factura, no creado»: fecha de factura ascendente, sin fecha AL FINAL", () => {
    const rs = [
      { id: "sinfecha", fecha_factura: null, created_at: "2026-09-01" },
      { id: "nuevo", fecha_factura: "2026-08-26", created_at: "2026-08-26" },
      { id: "viejo", fecha_factura: "2025-02-01", created_at: "2026-09-05" },
      { id: "sinfecha2", fecha_factura: null, created_at: "2026-08-01" },
    ];
    expect(ordenarPorFactura(rs).map((r) => r.id)).toEqual(["viejo", "nuevo", "sinfecha", "sinfecha2"]);
    expect(FALTA_FECHA_FACTURA).toBe("Falta la fecha de la factura");
  });
  it("diasDesde cuenta desde la fecha de FACTURA con el hoy de Panamá; sin fecha, null", () => {
    expect(diasDesde("2026-06-19", HOY)).toBe(83);
    expect(diasDesde(null, HOY)).toBeNull();
    expect(diasDesde("", HOY)).toBeNull();
  });
});

/* ═══ 5 · la portada ════════════════════════════════════════════════════════ */
const R = (o: Partial<{ id: string; empresa: string; estado: string; fecha_factura: string | null; reclamado_en: string | null; precio: number; settle: { monto: number; fecha: string }[] }>) => ({
  id: o.id ?? Math.random().toString(),
  empresa: o.empresa ?? "Fashion Wear",
  estado: o.estado ?? "Creado",
  fecha_factura: o.fecha_factura ?? null,
  reclamado_en: o.reclamado_en ?? null,
  reclamo_items: [{ cantidad: 1, precio_unitario: o.precio ?? 100 }],
  reclamo_settlements: (o.settle ?? []).map((s) => ({ ...s, deleted: false })),
});

describe("🔴 la portada: tres números, tarjetas por plata, el contacto real", () => {
  const reclamos = [
    R({ id: "fw1", empresa: "Fashion Wear", precio: 1000, fecha_factura: "2025-02-01" }),                    // sin reclamar, el más viejo
    R({ id: "fw2", empresa: "Fashion Wear", precio: 100, fecha_factura: "2026-06-01", reclamado_en: "2026-07-01T00:00:00Z" }),
    R({ id: "fs1", empresa: "Fashion Shoes", precio: 2000, fecha_factura: null }),                             // sin fecha
    R({ id: "vi1", empresa: "Vistana International", precio: 50, reclamado_en: "2026-07-01T00:00:00Z", fecha_factura: "2026-02-06" }),
    R({ id: "pag", empresa: "Fashion Wear", precio: 300, estado: "Pagado", settle: [{ monto: 353.1, fecha: "2026-07-08" }] }),
    R({ id: "pagviejo", empresa: "Vistana International", precio: 300, estado: "Pagado", settle: [{ monto: 300, fecha: "2025-07-08" }] }),
  ];
  const contactos = [
    { empresa: "Fashion Wear", nombre_contacto: "Isaac Amar", nombre: "" },
    { empresa: "Fashion Shoes", nombre_contacto: "Estela Rivera", nombre: "" },
  ];

  it("por cobrar = los no pagados; sin reclamar = de esos, los que nunca salieron", () => {
    const r = resumenPortada(reclamos, HOY);
    expect(r.porCobrar.n).toBe(4);
    expect(r.porCobrar.monto).toBeCloseTo(totalDe(reclamos[0]) + totalDe(reclamos[1]) + totalDe(reclamos[2]) + totalDe(reclamos[3]), 6);
    expect(r.sinReclamar.n).toBe(2);
    expect(r.sinReclamar.monto).toBeCloseTo(totalDe(reclamos[0]) + totalDe(reclamos[2]), 6);
  });
  it("cobrado <año> sale de las notas de crédito con fecha de ESE año", () => {
    const r = resumenPortada(reclamos, HOY);
    expect(r.cobrado.anio).toBe(2026);
    expect(r.cobrado.n).toBe(1);
    expect(r.cobrado.monto).toBeCloseTo(353.1, 6);
  });
  it("las tarjetas van ORDENADAS POR PLATA, sin Joystep, con Active Wear diciendo que nunca reclamó", () => {
    const t = tarjetasPorEmpresa(reclamos, contactos, HOY);
    expect(t.map((x) => x.empresa)).toEqual(["Fashion Shoes", "Fashion Wear", "Vistana International", "Active Shoes", "Active Wear"]);
    expect(t.find((x) => x.empresa === "Joystep")).toBeUndefined();
    const aw = t.find((x) => x.empresa === "Active Wear")!;
    expect(aw.n).toBe(0);
    expect(aw.tieneHistoria).toBe(false);
  });
  it("🩸 el contacto sale de nombre_contacto (la tarjeta leía `nombre`, que no existe)", () => {
    const t = tarjetasPorEmpresa(reclamos, contactos, HOY);
    expect(t.find((x) => x.empresa === "Fashion Wear")!.contacto).toBe("Isaac Amar");
    expect(t.find((x) => x.empresa === "Vistana International")!.contacto).toBeNull();
  });
  it("«el más viejo lleva N días» se mide desde la FECHA DE FACTURA; sin ninguna fecha, no se dice", () => {
    const t = tarjetasPorEmpresa(reclamos, contactos, HOY);
    expect(t.find((x) => x.empresa === "Fashion Wear")!.masViejoDias).toBe(diasDesde("2025-02-01", HOY));
    expect(t.find((x) => x.empresa === "Fashion Shoes")!.masViejoDias).toBeNull();
  });
  it("el chip «sin reclamar N» cuenta solo lo por cobrar sin fecha de reclamado", () => {
    const t = tarjetasPorEmpresa(reclamos, contactos, HOY);
    expect(t.find((x) => x.empresa === "Fashion Wear")!.sinReclamar).toBe(1);
    expect(t.find((x) => x.empresa === "Vistana International")!.sinReclamar).toBe(0);
  });
  it("nombre CORTO de empresa (diccionario § 0)", () => {
    const t = tarjetasPorEmpresa(reclamos, contactos, HOY);
    expect(t.find((x) => x.empresa === "Vistana International")!.nombreCorto).toBe("Vistana");
  });
});

/* ═══ 6 · los renglones desde la factura ════════════════════════════════════ */
describe("🔴 «Reclamar un renglón de cien»: los renglones salen de la factura", () => {
  const lineas = normalizarLineas([
    { referencia: "DM0DM04410002", descripcion: "CAMISETA PARA CABALLERO", talla: null, cantidad: 180, precio: "12,00" },
    { referencia: "100245427", descripcion: "REEBOK ROAD STRIDER", talla: "8.5", cantidad: 2, precio: 18.92 },
    { referencia: "", descripcion: "sin referencia: no entra", cantidad: 1, precio: 1 },
  ]);
  it("normaliza: coma decimal, talla vacía si no viene, sin referencia no entra", () => {
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toEqual({ referencia: "DM0DM04410002", descripcion: "CAMISETA PARA CABALLERO", talla: "", cantidad: 180, precio: 12 });
    expect(lineas[1].talla).toBe("8.5");
  });
  it("rótulos EXACTOS (Daniel: «palabras de novatos confunden»)", () => {
    expect([...ROTULOS_LINEAS]).toEqual(["Estilo", "Descripción", "Cantidad", "Precio", "Talla", "Cant. reclamada", "Motivo"]);
  });
  it("el buscador filtra por estilo y descripción; vacío = todas; la talla no busca", () => {
    expect(buscarLineas(lineas, "")).toHaveLength(2);
    expect(buscarLineas(lineas, "dm0dm").map((l) => l.referencia)).toEqual(["DM0DM04410002"]);
    expect(buscarLineas(lineas, "road")).toHaveLength(1);
    expect(buscarLineas(lineas, "8.5")).toHaveLength(0);
  });
  it("marcar una línea arma un ítem con la cantidad de la factura y el precio; el motivo lo pone Andrea", () => {
    const it0 = itemDesdeLinea(lineas[0]);
    expect(it0.referencia).toBe("DM0DM04410002");
    expect(it0.cantidad).toBe(180);
    expect(it0.precio_unitario).toBe(12);
    expect(it0.motivo).toBe("");
    expect(itemDesdeLinea(lineas[0], 23, "Mercancía manchada").cantidad).toBe(23);
  });
  it("«Repetir el anterior» copia talla, género, precio y motivo — no el estilo ni la descripción", () => {
    const ant = { ...emptyItem(), referencia: "X", descripcion: "Y", talla: "M", genero: "Men", precio_unitario: 14.4, motivo: "Sobrante de mercancía", cantidad: 9 };
    const f = filaRepetida(ant);
    expect(f.talla).toBe("M"); expect(f.genero).toBe("Men"); expect(f.precio_unitario).toBe(14.4); expect(f.motivo).toBe("Sobrante de mercancía");
    expect(f.referencia).toBe(""); expect(f.descripcion).toBe(""); expect(f.cantidad).toBe(1);
  });
  it("el pie dice N renglones · N piezas · $", () => {
    expect(resumenRenglones([{ cantidad: 23, precio_unitario: 14.4 }, { cantidad: 2, precio_unitario: 10 }])).toEqual({ renglones: 2, piezas: 25, subtotal: 351.2 });
  });
  it("lo que se guarda: con líneas, las marcadas + lo tecleado con algo; sin líneas, lo tecleado tal cual", () => {
    const vacio = emptyItem();
    const marcado = itemDesdeLinea(lineas[1], 1, "Faltante de mercancía");
    expect(itemsAGuardar({ 1: marcado }, [vacio], true)).toEqual([marcado]);
    expect(itemsAGuardar({}, [vacio], false)).toEqual([vacio]);
    expect(itemsAGuardar({ 1: marcado }, [{ ...vacio, referencia: "manual" }], true)).toHaveLength(2);
  });
});

describe("🔴 el lector: cabecera + empresa facturada + renglones, un solo prompt", () => {
  it("el prompt pide la empresa facturada, los renglones y desglosa la talla cuando viene", () => {
    expect(PROMPT_LECTOR).toContain('"empresa_facturada"');
    expect(PROMPT_LECTOR).toContain('"lineas"');
    expect(PROMPT_LECTOR).toMatch(/UN renglón por talla/);
    expect(PROMPT_LECTOR).toMatch(/no la deduzcas del código/);
  });
  it("parsea la respuesta y descarta lo que no sabe", () => {
    const r = parsearRespuestaLector(`Aquí va: {"proveedor":"American Designer Fashion","marca":"Calvin Klein","nro_factura":"3000015536","fecha_factura":"2026-09-10","nro_orden_compra":"10050191","empresa_facturada":"VISTANA INTERNACIONAL PANAMA, S.A.","lineas":[{"referencia":"NP2766O022","descripcion":"BOXER PARA HOMBRE · BOXER BRIEF 3PK","talla":null,"cantidad":10,"precio":"9,50"}]}`);
    expect(r?.empresa_facturada).toBe("VISTANA INTERNACIONAL PANAMA, S.A.");
    expect(r?.fecha_factura).toBe("2026-09-10");
    expect(r?.lineas).toEqual([{ referencia: "NP2766O022", descripcion: "BOXER PARA HOMBRE · BOXER BRIEF 3PK", talla: "", cantidad: 10, precio: 9.5 }]);
    expect(parsearRespuestaLector("nada")).toBeNull();
    expect(parsearRespuestaLector(`{"fecha_factura":"10/09/2026"}`)?.fecha_factura).toBeNull();
  });

  // La factura de referencia que mandó Daniel (American Designer Fashion
  // 3000015536): Estilo · Descripción · Nombre estilo · … · Cantidad · Precio,
  // SIN talla. Se lee con pdftotext cuando está (en CI sí); si no, se salta.
  const FIXTURE = join(process.cwd(), "src/__tests__/fixtures/factura-american-designer-fashion-3000015536.pdf");
  const HAY_PDFTOTEXT = (() => { try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); return true; } catch { return false; } })();
  it("la factura de referencia existe en el repo", () => {
    expect(existsSync(FIXTURE)).toBe(true);
  });
  it.skipIf(!HAY_PDFTOTEXT)("la factura real trae Estilo y Cantidad, y NO trae talla por renglón", () => {
    const texto = execFileSync("pdftotext", ["-layout", FIXTURE, "-"], { encoding: "utf8" });
    expect(texto).toMatch(/Estilo\s+Descripción/);
    expect(texto).toContain("Cliente: 70000053 VISTANA INTERNACIONAL PANAMA, S.A.");
    expect(texto).toContain("Pedidos: 10050191");
    expect(texto).not.toMatch(/\bTalla\b/);
  });
});

/* ═══ 7 · textos que se leen distinto de como se guardan ════════════════════ */
describe("motivo capitalizado y la nota del correo, acortada", () => {
  it("motivoEnPantalla", () => {
    expect(motivoEnPantalla("sobrante")).toBe("Sobrante");
    expect(motivoEnPantalla("FALTANTE")).toBe("Faltante");
    expect(motivoEnPantalla("Mercancía manchada")).toBe("Mercancía manchada");
    expect(motivoEnPantalla("")).toBe("");
  });
  it("la nota vieja del sistema se lee «Correo enviado a …», sin «Sistema» ni el ZIP", () => {
    expect(notaEnPantalla("Correo con ZIP adjunto enviado a iamar@aswgr.com, daniel@fashiongr.com (6 reclamos)", "Sistema"))
      .toEqual({ texto: "Correo enviado a iamar@aswgr.com, daniel@fashiongr.com", autor: null });
    expect(notaEnPantalla("Correo con Excel adjunto enviado a iamar@aswgr.com · CC: Info@fashiongr.com (1 reclamos)", "Sistema"))
      .toEqual({ texto: "Correo enviado a iamar@aswgr.com (copia a Info@fashiongr.com)", autor: null });
    expect(notaEnPantalla("Comprobante adjuntado", "andrea")).toEqual({ texto: "Comprobante adjuntado", autor: "andrea" });
  });
  it("la nota nueva ya nace corta, y se lee igual", () => {
    const n = notaCorreoEnviado(["iamar@aswgr.com"], []);
    expect(n).toBe("Correo enviado a iamar@aswgr.com");
    expect(notaEnPantalla(n, "Sistema").autor).toBeNull();
  });
});

/* ═══ 8 · PDF obligatorio al crear, no al editar ════════════════════════════ */
describe("🔴 «PDF obligatorio» — al crear; editar un reclamo viejo sin PDF sigue guardando", () => {
  // 🔄 11-sep-2026 — la cabecera gana la FECHA DE LA FACTURA como obligatoria
  // (estaba con asterisco en las dos pantallas y no la validaba nadie). Lo que
  // estos casos miden —el PDF, al crear y no al editar— no cambió.
  const cab = { empresa: "Fashion Wear", nro_factura: "1", fecha_factura: "2026-09-01", fecha_reclamo: "2026-09-10", nro_orden_compra: "OC" };
  const items = [{ referencia: "a", descripcion: "b", talla: "M", genero: "Men", cantidad: 1, precio_unitario: 1, motivo: "x" }];
  it("sin PDF el nuevo no pasa, y dice qué falta", () => {
    expect(validateReclamoNuevo({ ...cab, factura_pdf_path: null }, items)).toBe(FALTA_PDF);
    expect(validateReclamoNuevo({ ...cab, factura_pdf_path: "x/y.pdf" }, items)).toBeNull();
  });
  it("la validación de editar no lo exige", () => {
    expect(validateReclamoFull(cab, items)).toBeNull();
  });
});

/* ═══ 9 · barridos sobre el código (sin comentarios) ════════════════════════ */
describe("🔴 barridos: lo que no puede volver", () => {
  const SELECTOR = sinComentarios(leer("src/app/reclamos/components/EmpresaSelector.tsx"));
  const LISTA = sinComentarios(leer("src/app/reclamos/components/EmpresaList.tsx"));
  const DETALLE = sinComentarios(leer("src/app/reclamos/components/ReclamoDetail.tsx"));
  const FORM = sinComentarios(leer("src/app/reclamos/components/ReclamoForm.tsx"));
  const CLIENTE = sinComentarios(leer("src/app/reclamos/ReclamosClient.tsx"));
  const PORTADA = sinComentarios(leer("src/lib/reclamos/portada.ts"));

  it("🩸 el contacto se lee de `nombre_contacto`; la tarjeta ya no lee `c?.nombre`", () => {
    expect(PORTADA).toContain("nombre_contacto");
    expect(SELECTOR).not.toContain("c?.nombre");
    expect(SELECTOR).toContain("tarjetasPorEmpresa(");
  });
  it("«Alertas +45 días» y el chip «Alerta» se fueron de la portada", () => {
    expect(SELECTOR).not.toContain("+45");
    expect(SELECTOR).not.toContain(">Alerta<");
    expect(SELECTOR).not.toContain("daysSince(");
  });
  it("«En proceso» no se ofrece en ninguna pantalla", () => {
    for (const [n, src] of [["EmpresaSelector", SELECTOR], ["EmpresaList", LISTA], ["ReclamoDetail", DETALLE], ["ReclamoForm", FORM], ["ReclamosClient", CLIENTE]] as const) {
      expect(src, n).not.toContain('"En proceso"');
      expect(src, n).not.toContain("Pasar a En proceso");
    }
    expect(CLIENTE).not.toContain("ComprobanteModal");
  });
  it("«Paso 1 de 4» y «Mostrar todos los campos» se fueron; los motivos son la lista cerrada", () => {
    expect(FORM).not.toContain("Paso ");
    expect(FORM).not.toContain("Mostrar todos los campos");
    for (const rel of ["src/app/reclamos/components/ReclamoForm.tsx", "src/app/reclamos/components/ItemsEditor.tsx", "src/app/reclamos/components/ReclamoDetail.tsx", "src/app/reclamos/components/RenglonesDesdeFactura.tsx", "src/app/reclamos/page.tsx"]) {
      const src = sinComentarios(leer(rel));
      expect(src, rel).not.toMatch(/saveCustomMotivo|loadCustomMotivos|fetchCustomMotivos|reclamo_custom_motivos|__add__/);
    }
  });
  it("🔴 el borrado usa el deshacer de 5 s de la casa y el modal no miente", () => {
    expect(CLIENTE).toContain("scheduleUndoReclamo({");
    expect((CLIENTE.match(/\{undoToast\}/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(CLIENTE).not.toContain("no se puede deshacer");
    expect(CLIENTE).toContain("Tendrás 5 segundos para deshacerlo");
  });
  it("quitar una nota de crédito PREGUNTA antes", () => {
    expect(DETALLE).toContain("¿Quitar esta nota de crédito?");
    expect(DETALLE).not.toMatch(/onClick=\{\(\) => onRemoveSettlement\(s\.id\)\}/);
  });
  it("el filtro y la búsqueda de la empresa viven en la URL", () => {
    expect(LISTA).toContain('useUrlState("estado"');
    expect(LISTA).toContain('useUrlState("q"');
    expect(LISTA).toContain("filtroDesdeUrl(");
    // 🔄 11-sep-2026 — CAMBIA DE DIRECCIÓN, NO SE BORRA. El orden dejó de ser
    // fijo («la factura más vieja primero») y pasa a elegirse tocando cualquier
    // encabezado, con el default en la factura más RECIENTE arriba — Daniel:
    // *«reclamo debe ir sort el más nuevo arriba para verlo, pero con opción de
    // sort en todas las columnas: más plata, más días, menos días, menos
    // plata»*. Lo que este caso protege —que el estado de la pantalla viaja en
    // la URL— no cambió, y ahora el orden también.
    expect(LISTA).toContain("ordenarReclamos(");
    expect(LISTA).toContain('useUrlState("orden"');
  });
  it("la fila: «Correo», «Descargar» y el «···» con el papel, editar y borrar", () => {
    expect(LISTA).toContain("<OverflowMenu");
    expect(LISTA).toContain('label: "Descargar el PDF"');
    expect(LISTA).toContain('label: "Editar"');
    expect(LISTA).toContain('label: "Eliminar"');
  });
  it("el detalle: un chip, una fila de botones, los totales abajo de los renglones", () => {
    expect(DETALLE).toContain('data-medir="reclamo-cabecera"');
    expect(DETALLE).toContain('data-medir="reclamo-totales"');
    expect(DETALLE.indexOf('data-medir="reclamo-totales"')).toBeGreaterThan(DETALLE.indexOf('data-vista="tabla"'));
    expect(DETALLE).toContain("Marcar como pagado");
    expect(DETALLE).not.toContain("<StatusBadge");
    expect(DETALLE).toContain("conGenero &&");
    expect(DETALLE).toContain("motivoEnPantalla(");
    expect(DETALLE).toContain("notaEnPantalla(");
  });
});

/* ═══ 10 · «reclamado» lo escriben las cuatro salidas, y el correo DESPUÉS de Resend ═ */
describe("🔴 reclamado_en lo marcan las cuatro salidas hacia el proveedor", () => {
  const RUTAS = [
    "src/app/api/reclamos/proveedor/[empresa]/send-zip/route.ts",
    "src/app/api/reclamos/[id]/excel/route.ts",
    "src/app/api/reclamos/proveedor/[empresa]/export-zip/route.ts",
    "src/app/api/reclamos/proveedor/[empresa]/export-pdf/route.ts",
  ];
  it.each(RUTAS)("%s llama a marcarReclamados", (rel) => {
    const src = sinComentarios(leer(rel));
    expect(src).toMatch(/marcarReclamados\(/);
  });
  it("🩸 el correo marca DESPUÉS de que Resend confirma", () => {
    const src = sinComentarios(leer("src/app/api/reclamos/proveedor/[empresa]/send-zip/route.ts"));
    expect(src.indexOf("await marcarReclamados(")).toBeGreaterThan(src.indexOf("emails.send("));
    expect(src.indexOf("await marcarReclamados(")).toBeGreaterThan(src.indexOf("if (sendError)"));
  });
  it("marcarReclamados nunca pisa: `.is(\"reclamado_en\", null)`", () => {
    const src = sinComentarios(leer("src/lib/reclamos/marcar-reclamado.ts"));
    expect(src).toContain('.is("reclamado_en", null)');
    expect(src).toContain('.eq("deleted", false)');
  });
});

/* ═══ 11 · la migración ═════════════════════════════════════════════════════ */
describe("🔴 la migración: aditiva, por id, el bucket privado", () => {
  const SQL = leer("supabase/migrations/20261111120000_reclamos_rediseno.sql")
    .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  it("agrega las dos columnas y no borra nada", () => {
    expect(SQL).toContain("ADD COLUMN IF NOT EXISTS reclamado_en timestamptz");
    expect(SQL).toContain("ADD COLUMN IF NOT EXISTS fecha_factura date");
    expect(SQL).not.toMatch(/DROP|DELETE FROM|TRUNCATE/i);
  });
  it("las dos facturas pegadas se corrigen por ID y con el valor EXACTO de hoy — nada de LIKE sobre nro_factura", () => {
    expect(SQL).toContain("WHERE id = '54cabad2-cea2-418d-8759-3b4bf64eaa36'");
    expect(SQL).toContain("WHERE id = 'b7ce2539-97bd-4ea3-9838-79eea549c66c'");
    expect(SQL).toContain("SET nro_factura = '3000012777 - 3000010397 - 3000013232 - 3000011913 - 3000011361'");
    expect(SQL).toContain("SET nro_factura = '3000013662 - 3000013657 - 3000013660 - 3000013658'");
    expect(SQL).not.toMatch(/nro_factura\s+(I?LIKE)/i);
    expect(SQL.match(/UPDATE reclamos\s*\n?\s*SET nro_factura/g)).toHaveLength(2);
  });
  it("reclamado_en se rellena con la PRIMERA nota de correo del sistema", () => {
    expect(SQL).toMatch(/min\(created_at\)/);
    expect(SQL).toContain("autor = 'Sistema'");
    expect(SQL).toContain("r.reclamado_en IS NULL");
  });
  it("«Link público ciérralo»: el bucket de fotos pasa a privado", () => {
    expect(SQL).toContain("UPDATE storage.buckets SET public = false WHERE id = 'reclamo-fotos'");
  });
});

/* ═══ 12 · fotos y comprobantes sin URL pública ═════════════════════════════ */
describe("🔴 «Link público ciérralo»: nadie arma una URL pública de reclamo-fotos", () => {
  // 🔄 11-sep-2026 (tarde): la GALERÍA PÚBLICA se retiró entera —página, vista,
  // `galeria.ts`, `gallery-token.ts` y su exención del middleware— porque el
  // último link que la citaba se fue del Excel (Daniel: *«sin links»*). Sus dos
  // archivos salen de esta lista A PROPÓSITO: ya no hay de dónde sacar una URL
  // pública porque ya no hay galería. Lo que el candado protege se REFUERZA, no
  // se afloja, y abajo hay un caso que exige que no vuelva.
  const ARCHIVOS = [
    "src/app/api/reclamos/[id]/fotos/route.ts",
    "src/lib/reclamos/comprobante-storage.ts",
    "src/app/reclamos/components/ReclamoDetail.tsx",
  ];
  it.each(ARCHIVOS)("%s: sin getPublicUrl ni /object/public/", (rel) => {
    const src = sinComentarios(leer(rel));
    expect(src).not.toContain("getPublicUrl");
    expect(src).not.toContain("/object/public/");
  });
  // 🔄 11-sep-2026 — CAMBIA DE ANCLA, NO SE BORRA. El firmado se mudó a
  // `lib/reclamos/leer-detalle.ts`, la lectura ÚNICA que ahora usan la ruta y
  // el SSR de `/reclamos?view=detail&id=…`: eran dos lecturas distintas y la
  // del SSR no firmaba nada, así que abrir un reclamo por enlace directo o
  // recargar con F5 lo pintaba con las fotos rotas y sin comprobante. La regla
  // que este caso protege —las tres clases de archivo se FIRMAN al leer— no
  // cambió; lo que cambió es que ahora vale para las dos puertas.
  it("el detalle firma desde `fotos-storage`, y por una sola puerta", () => {
    const lector = sinComentarios(leer("src/lib/reclamos/leer-detalle.ts"));
    expect(lector).toContain("firmarFotos(");
    expect(lector).toContain("firmarFotoPathSafe(");
    expect(lector).toContain("firmarFacturaPathSafe(");
    // Las dos puertas leen por ahí.
    expect(sinComentarios(leer("src/app/api/reclamos/[id]/route.ts"))).toContain("leerDetalleReclamo(");
    expect(sinComentarios(leer("src/app/reclamos/page.tsx"))).toContain("leerDetalleReclamo(");
    // Y el SSR ya no arma su propio `select` del detalle.
    expect(sinComentarios(leer("src/app/reclamos/page.tsx"))).not.toContain("reclamo_seguimiento(*)");
  });
  it("la fila nueva de foto guarda url = null, y el pago mira el path", () => {
    expect(sinComentarios(leer("src/app/api/reclamos/[id]/fotos/route.ts"))).toContain("url: null");
    expect(sinComentarios(leer("src/app/api/reclamos/[id]/settlements/route.ts"))).toContain("!rec.comprobante_path && !rec.comprobante_url");
  });
});

/* ═══ 13 · novedades ════════════════════════════════════════════════════════ */
describe("las tres novedades del rediseño están en la tira", () => {
  it("tres, del módulo reclamos, del 11-sep-2026", () => {
    const n = NOVEDADES.filter((x) => x.modulo === "reclamos" && x.fecha === "2026-09-11");
    expect(n).toHaveLength(3);
    for (const x of n) expect(x.id.startsWith("reclamos-")).toBe(true);
  });
});
