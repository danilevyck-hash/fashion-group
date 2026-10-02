/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 GUÍAS › ETIQUETAS POR ENVÍO — las reglas puras (1-oct-2026)
 *
 * Daniel, 1-oct-2026: las etiquetas son POR ENVÍO = empresa + cliente +
 * destino. Varias facturas, cada una con sus bultos y una nota opcional; se
 * imprime al final y la numeración es CORRIDA (A 1–10, B 11–20, C 21–30, todas
 * «de 30»). Lo impreso no se cambia. En la guía, el envío es UN renglón con los
 * bultos bloqueados.
 *
 * Lo que este candado fija:
 *   1. Los rangos se CALCULAN del orden y de las cajas.
 *   2. El papel: cada etiqueta lleva SU factura y el «de N» del ENVÍO.
 *   3. La nota: ≤ 15, mayúsculas, opcional; los atajos son las 3 más usadas.
 *   4. El POST de un envío se valida entero: todo o nada.
 *   5. Nueva guía: el envío es UN renglón con los bultos bloqueados.
 *   6. El despacho no manda correcciones de bultos de un envío etiquetado.
 *   7. El PUT: a qué renglón nuevo vuelve cada etiqueta.
 *   8. El papel por defecto es 4×6.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";

import {
  ETIQUETAS_POR_ENVIO,
  MAX_NOTA,
  agruparEnEnvios,
  bultosBloqueadosPorEtiquetas,
  desmarcarEnvio,
  envioDe,
  facturaDelBulto,
  filtrarEnvios,
  marcarEnvio,
  normalizarNota,
  notasMasUsadas,
  rangosDelEnvio,
  renglonNuevoDe,
  textoRango,
  validarEnvioNuevo,
  type RenglonConEtiquetas,
} from "@/lib/guias/etiquetas-por-envio";
import { capturaDelEnvio } from "@/lib/guias/anti-doble-captura";
import { correccionesDeBultos } from "@/lib/guias/bultos-correccion";
import { marcarFactura } from "@/lib/guias/atajos-facturas";
import { construirPdfEtiquetas, datosDeEtiqueta, paginasDelEnvio } from "@/lib/guias/pdf-etiquetas";
import { FORMATO_POR_DEFECTO, OPCIONES_FORMATO, type EtiquetaFila } from "@/lib/guias/etiquetas";

const ENVIO = "6f1c2b9e-0000-4000-8000-000000000001";

function etq(over: Partial<EtiquetaFila> = {}): EtiquetaFila {
  return {
    id: 1,
    empresa_key: "fashion_shoes",
    empresa: "Fashion Shoes",
    switch_factura_id: 52558,
    secuencial: "11-000002558",
    fecha_factura: "2026-09-18",
    cliente_codigo: "D-170",
    cliente_nombre: "Nova Lux, S.A.",
    destino: "Paso Canoas",
    cajas: 10,
    creado_en: "2026-10-01T10:00:00-05:00",
    guia_numero: null,
    envio_id: ENVIO,
    orden_en_envio: 1,
    nota: null,
    ...over,
  };
}

/** El ejemplo de Daniel: tres facturas de 10, en un envío. */
const A = etq({ id: 7, secuencial: "11-000000001", switch_factura_id: 1, orden_en_envio: 1 });
const B = etq({ id: 5, secuencial: "11-000000002", switch_factura_id: 2, orden_en_envio: 2, nota: "FRÁGIL" });
const C = etq({ id: 9, secuencial: "11-000000003", switch_factura_id: 3, orden_en_envio: 3 });

// ─── 1 · los rangos ──────────────────────────────────────────────────────────

describe("🔴 1. la numeración es CORRIDA en el envío, y se calcula", () => {
  it("A 1–10, B 11–20, C 21–30, total 30 — sin importar cómo llegan", () => {
    const { rangos, total } = rangosDelEnvio([C, A, B]);
    expect(total).toBe(30);
    expect(rangos.map((r) => [r.fila.secuencial, r.desde, r.hasta])).toEqual([
      ["11-000000001", 1, 10],
      ["11-000000002", 11, 20],
      ["11-000000003", 21, 30],
    ]);
    expect(rangos.map(textoRango)).toEqual(["1–10", "11–20", "21–30"]);
  });

  it("cajas distintas: 3 + 1 + 5 → 1–3, 4, 5–9", () => {
    const { rangos, total } = rangosDelEnvio([
      etq({ id: 1, orden_en_envio: 1, cajas: 3 }),
      etq({ id: 2, orden_en_envio: 2, cajas: 1 }),
      etq({ id: 3, orden_en_envio: 3, cajas: 5 }),
    ]);
    expect(total).toBe(9);
    expect(rangos.map(textoRango)).toEqual(["1–3", "4", "5–9"]);
  });

  it("sin orden (filas de antes de la migración): por id, siempre igual", () => {
    const viejas = [etq({ id: 4, orden_en_envio: undefined }), etq({ id: 2, orden_en_envio: undefined })];
    expect(rangosDelEnvio(viejas).rangos.map((r) => r.fila.id)).toEqual([2, 4]);
  });

  it("el bulto 15 es de la factura B; el 31 no existe", () => {
    expect(facturaDelBulto([A, B, C], 15)?.secuencial).toBe("11-000000002");
    expect(facturaDelBulto([A, B, C], 1)?.secuencial).toBe("11-000000001");
    expect(facturaDelBulto([A, B, C], 30)?.secuencial).toBe("11-000000003");
    expect(facturaDelBulto([A, B, C], 31)).toBeNull();
  });

  it("🔴 una fila SIN envío (sin la migración) es un envío de una: `envio_id ?? id`", () => {
    expect(envioDe({ id: 10, envio_id: undefined })).toBe("10");
    const envios = agruparEnEnvios([etq({ id: 4, envio_id: undefined }), etq({ id: 10, envio_id: undefined })]);
    expect(envios).toHaveLength(2);
  });

  it("la lista junta por envío y el total es el de todo el envío", () => {
    const otro = etq({ id: 20, envio_id: "otro", cajas: 2 });
    const envios = agruparEnEnvios([B, otro, C, A]);
    expect(envios).toHaveLength(2);
    const v = envios.find((x) => x.envio_id === ENVIO)!;
    expect(v.total).toBe(30);
    expect(v.filas.map((f) => f.id)).toEqual([7, 5, 9]);
  });

  it("el envío está en una guía si CUALQUIERA de sus filas lo está; el filtro lo esconde", () => {
    const enGuia = agruparEnEnvios([A, { ...B, guia_numero: 256 }, C]);
    expect(enGuia[0].guia_numero).toBe(256);
    expect(filtrarEnvios(enGuia, "pendientes", "")).toHaveLength(0);
    expect(filtrarEnvios(enGuia, "todas", "frágil")).toHaveLength(1);
    expect(filtrarEnvios(enGuia, "todas", "000002")).toHaveLength(1);
    expect(filtrarEnvios(enGuia, "todas", "golden")).toHaveLength(0);
  });
});

// ─── 2 · el papel ────────────────────────────────────────────────────────────

/** Los textos del PDF, en orden (la misma lectura de los otros candados). */
function textos(doc: ReturnType<typeof construirPdfEtiquetas>): string[] {
  const crudo = Buffer.from(doc.output("arraybuffer") as ArrayBuffer).toString("latin1");
  return [...crudo.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((m) => m[1].replace(/\\(\d{3})/g, "~"));
}

describe("🔴 2. cada etiqueta lleva SU factura y el «de N» del ENVÍO", () => {
  it("30 páginas en 4×6: la 1 es de A «1 de 30», la 15 de B «15 de 30», la 30 de C", () => {
    const paginas = paginasDelEnvio([C, A, B]);
    expect(paginas).toHaveLength(30);
    expect(paginas.map((p) => p.numero)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(paginas.every((p) => p.total === 30)).toBe(true);
    expect(paginas[0].d.secuencial).toBe("11-000000001");
    expect(paginas[14].d.secuencial).toBe("11-000000002");
    expect(paginas[29].d.secuencial).toBe("11-000000003");

    const doc = construirPdfEtiquetas(paginas, "4x6");
    expect(doc.getNumberOfPages()).toBe(30);
    const t = textos(doc);
    expect(t.filter((x) => x === "de 30")).toHaveLength(30);
    expect(t.filter((x) => x === "11-000000002")).toHaveLength(10);
  });

  it("reimprimir UN bulto: el 15 sale solo, de la factura B y «de 30»", () => {
    const paginas = paginasDelEnvio([A, B, C], 15);
    expect(paginas).toHaveLength(1);
    const t = textos(construirPdfEtiquetas(paginas, "4x6"));
    expect(t).toContain("11-000000002");
    expect(t).toContain("15");
    expect(t).toContain("de 30");
    expect(t).not.toContain("11-000000001");
  });

  it("en carta también: 30 etiquetas = 8 hojas", () => {
    expect(construirPdfEtiquetas(paginasDelEnvio([A, B, C]), "carta").getNumberOfPages()).toBe(8);
  });

  it("⚠️ la forma de siempre —una factura, sus cajas— sale idéntica por las dos puertas", () => {
    const sinFecha = (d: ReturnType<typeof construirPdfEtiquetas>) =>
      d.output().replace(/\/CreationDate \([^)]*\)/g, "").replace(/\/ID \[[^\]]*\]/g, "");
    const sola = etq({ envio_id: "x", cajas: 4 });
    for (const formato of ["carta", "4x6"] as const) {
      expect(sinFecha(construirPdfEtiquetas(paginasDelEnvio([sola]), formato))).toBe(
        sinFecha(construirPdfEtiquetas(datosDeEtiqueta(sola), [1, 2, 3, 4], formato)),
      );
    }
  });

});

// ─── 2b · la nota EN EL PAPEL ──────────────────────────────────────────────
//
// Daniel aprobó (1-oct-2026): *«Igual que hoy + NOTA después del destino, sin
// el cuadro y a la izquierda como los otros»* y *«se ve más limpia la 1»*.

const MM = 0.3527777778;
interface Pieza { texto: string; mayusculaMm: number; x: number; y: number }

/** Las piezas de texto de la PRIMERA página, con su posición (mm) y tamaño. */
function piezas(doc: ReturnType<typeof construirPdfEtiquetas>, altoMm: number): Pieza[] {
  const crudo = Buffer.from(doc.output("arraybuffer") as ArrayBuffer).toString("latin1");
  const re = /\/F\d+ ([\d.]+) Tf|([-\d.]+)\s+([-\d.]+)\s+Td\s*\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  const out: Pieza[] = [];
  let pt = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(crudo)) !== null) {
    if (m[1]) { pt = Number(m[1]); continue; }
    out.push({
      texto: m[4].replace(/\\(\d{3})/g, "~"),
      mayusculaMm: pt * 0.718 * MM,
      x: Number(m[2]) * MM,
      y: altoMm - Number(m[3]) * MM,
    });
  }
  return out;
}

const ACS = { empresa: "Fashion Wear", fecha_factura: "2026-10-01", secuencial: "11-000003285", cliente_nombre: "American Classics Store", destino: "DAVID", cajas: 3 };
const PEOR = { empresa: "Fashion Shoes", fecha_factura: "2026-10-01", secuencial: "11-000002558", cliente_nombre: "COMERCIALES LA NUEVA REINA, S.A.", destino: "ALBROOK, PASILLO DE DINOSAURIO", cajas: 300 };
const ALTO = { "4x6": 152.4, carta: 279.4 } as const;
/** La raya del bulto, medida desde el borde de abajo de la celda (como el papel). */
const RAYA = { "4x6": 152.4 - 9.1 - 14.0 - 4.6, carta: 279.4 / 2 - 9.1 - 14.0 - 4.6 } as const;

const sinFecha = (d: ReturnType<typeof construirPdfEtiquetas>) =>
  d.output().replace(/\/CreationDate \([^)]*\)/g, "").replace(/\/ID \[[^\]]*\]/g, "");

describe("🔴 2b. la NOTA en el papel: un campo más, después del destino", () => {
  it("🔴 sin nota el dibujo es IDÉNTICO: con `nota: null`, vacía o sin el campo, byte a byte, y sin rótulo «Nota»", () => {
    for (const formato of ["carta", "4x6"] as const) {
      const base = sinFecha(construirPdfEtiquetas({ ...ACS }, [1, 2], formato));
      expect(sinFecha(construirPdfEtiquetas({ ...ACS, nota: null }, [1, 2], formato))).toBe(base);
      expect(sinFecha(construirPdfEtiquetas({ ...ACS, nota: "  " }, [1, 2], formato))).toBe(base);
      expect(textos(construirPdfEtiquetas({ ...ACS }, [1], formato))).not.toContain("Nota");
    }
  });

  it("🔴 con nota: rótulo gris «Nota» y el dato DESPUÉS del destino, antes del bulto, al mismo margen izquierdo", () => {
    for (const formato of ["4x6", "carta"] as const) {
      const p = piezas(construirPdfEtiquetas({ ...ACS, nota: "NIÑOS" }, [1], formato), ALTO[formato]);
      const orden = p.map((x) => x.texto);
      const iDest = orden.indexOf("DAVID");
      const iRot = orden.indexOf("Nota");
      const iNota = orden.findIndex((t) => t.startsWith("NI"));
      expect(iDest).toBeGreaterThan(-1);
      expect(iRot).toBe(iDest + 1);
      expect(iNota).toBe(iRot + 1);
      expect(orden.indexOf("BULTO")).toBeGreaterThan(iNota);
      const dest = p[iDest];
      const rot = p[iRot];
      const nota = p[iNota];
      expect(rot.x).toBeCloseTo(dest.x, 3);
      expect(nota.x).toBeCloseTo(dest.x, 3);
      expect(rot.y).toBeGreaterThan(dest.y);
      expect(nota.y).toBeGreaterThan(rot.y);
      // Como el cliente: 5,5 mm de mayúscula, más chica que el destino.
      expect(nota.mayusculaMm).toBeCloseTo(5.5, 2);
      expect(nota.mayusculaMm).toBeLessThan(dest.mayusculaMm);
    }
  });

  it("🔴 el destino NO cambia por la nota: mismas líneas, mismo tamaño y mismo sitio (salvo el peor caso de carta, que solo aprieta el aire)", () => {
    for (const formato of ["4x6", "carta"] as const) {
      const sin = piezas(construirPdfEtiquetas({ ...ACS }, [1], formato), ALTO[formato]);
      const con = piezas(construirPdfEtiquetas({ ...ACS, nota: "NIÑOS" }, [1], formato), ALTO[formato]);
      const dSin = sin.find((x) => x.texto === "DAVID")!;
      const dCon = con.find((x) => x.texto === "DAVID")!;
      expect([dCon.x, dCon.y, dCon.mayusculaMm]).toEqual([dSin.x, dSin.y, dSin.mayusculaMm]);
    }
    const sin = piezas(construirPdfEtiquetas({ ...PEOR }, [300], "4x6"), ALTO["4x6"]);
    const con = piezas(construirPdfEtiquetas({ ...PEOR, nota: "HOMBRE" }, [300], "4x6"), ALTO["4x6"]);
    const lineas = (p: Pieza[]) => p.filter((x) => ["ALBROOK,", "PASILLO DE", "DINOSAURIO"].includes(x.texto));
    expect(lineas(con)).toEqual(lineas(sin));
  });

  it("🔴 el peor caso —cliente de 2 líneas, destino de 3, nota, «300 de 300»— sin superposición, en 4×6 y en carta", () => {
    for (const formato of ["4x6", "carta"] as const) {
      const p = piezas(construirPdfEtiquetas({ ...PEOR, nota: "HOMBRE" }, [300], formato), ALTO[formato]);
      const lineas = p.filter((x) => ["ALBROOK,", "PASILLO DE", "DINOSAURIO"].includes(x.texto));
      expect(lineas, formato).toHaveLength(3);
      // El destino conserva su tamaño: 7,5 mm.
      for (const l of lineas) expect(l.mayusculaMm, formato).toBeCloseTo(7.5, 2);
      const ultima = lineas[2];
      const rot = p.find((x) => x.texto === "Nota")!;
      const nota = p.find((x) => x.texto === "HOMBRE")!;
      // El rótulo «Nota» (su mayúscula) empieza DEBAJO del descolgado del destino…
      expect(rot.y - 2.17, formato).toBeGreaterThan(ultima.y + 2.16);
      // …el dato empieza debajo de su rótulo…
      expect(nota.y - nota.mayusculaMm, formato).toBeGreaterThan(rot.y);
      // …y no llega a la raya del bulto (3 mm de aire, como el destino).
      expect(nota.y, formato).toBeLessThanOrEqual(RAYA[formato] - 3.0 + 0.01);
      // Cede la nota, nunca por debajo de lo legible a un metro (3,4 mm).
      expect(nota.mayusculaMm, formato).toBeGreaterThanOrEqual(3.4 - 0.01);
      // El cliente sigue en 2 líneas y a 5,5 mm.
      const cliente = p.filter((x) => x.texto.startsWith("COMERCIALES") || x.texto.startsWith("NUEVA REINA"));
      expect(cliente.map((x) => Math.round(x.mayusculaMm * 10) / 10), formato).toEqual([5.5, 5.5]);
    }
  });

  it("en 4×6 el peor caso entra con la nota a su tamaño y SIN apretar nada; en carta la nota cede (más chica, nunca bajo 3,4)", () => {
    const p6 = piezas(construirPdfEtiquetas({ ...PEOR, nota: "HOMBRE" }, [300], "4x6"), ALTO["4x6"]);
    expect(p6.find((x) => x.texto === "HOMBRE")!.mayusculaMm).toBeCloseTo(5.5, 2);
    const sin6 = piezas(construirPdfEtiquetas({ ...PEOR }, [300], "4x6"), ALTO["4x6"]);
    expect(p6.find((x) => x.texto === "Cliente")!.y).toBeCloseTo(sin6.find((x) => x.texto === "Cliente")!.y, 5);
    const pc = piezas(construirPdfEtiquetas({ ...PEOR, nota: "HOMBRE" }, [300], "carta"), ALTO.carta);
    const notaCarta = pc.find((x) => x.texto === "HOMBRE")!.mayusculaMm;
    expect(notaCarta).toBeLessThan(5.5);
    expect(notaCarta).toBeGreaterThanOrEqual(3.4 - 0.01);
  });

  it("15 letras anchas en una línea: cabe en el ancho (se achica si hace falta), nunca «…»", () => {
    for (const formato of ["4x6", "carta"] as const) {
      const p = piezas(construirPdfEtiquetas({ ...ACS, nota: "MMMMMMMMMMMMMMM" }, [1], formato), ALTO[formato]);
      const nota = p.find((x) => x.texto.startsWith("MMM"))!;
      expect(nota.texto).toBe("MMMMMMMMMMMMMMM");
    }
  });
});

// ─── 3 · la nota ─────────────────────────────────────────────────────────────

describe("🔴 3. la nota: ≤ 15, en mayúsculas, opcional", () => {
  it("se recorta, se juntan los espacios y va en mayúsculas", () => {
    expect(normalizarNota("  no   apilar ")).toEqual({ ok: true, valor: "NO APILAR" });
    expect(normalizarNota("frágil")).toEqual({ ok: true, valor: "FRÁGIL" });
  });

  it("vacía = sin nota (null, nunca cadena vacía: lo exige el CHECK)", () => {
    expect(normalizarNota("   ")).toEqual({ ok: true, valor: null });
    expect(normalizarNota(undefined)).toEqual({ ok: true, valor: null });
  });

  it("15 entra; 16 no", () => {
    expect(MAX_NOTA).toBe(15);
    expect(normalizarNota("A".repeat(15)).ok).toBe(true);
    expect(normalizarNota("A".repeat(16)).ok).toBe(false);
  });

  it("🔴 los atajos son las 3 MÁS USADAS, calculadas de lo que existe", () => {
    const filas = [
      { nota: "FRÁGIL" }, { nota: "NO APILAR" }, { nota: "frágil" }, { nota: null },
      { nota: "URGENTE" }, { nota: "NO APILAR" }, { nota: "FRÁGIL" }, { nota: "VIDRIO" },
    ];
    expect(notasMasUsadas(filas)).toEqual(["FRÁGIL", "NO APILAR", "URGENTE"]);
    expect(notasMasUsadas([])).toEqual([]);
    // Se actualizan solas: una nota nueva que se usa más pasa adelante.
    const despues = [...filas, { nota: "VIDRIO" }, { nota: "VIDRIO" }, { nota: "VIDRIO" }];
    expect(notasMasUsadas(despues)[0]).toBe("VIDRIO");
  });
});

// ─── 4 · el POST de un envío ────────────────────────────────────────────────

const cuerpo = (over: Record<string, unknown> = {}) => ({
  empresa_key: "fashion_shoes",
  cliente_codigo: "D-170",
  cliente_nombre: "Nova Lux, S.A.",
  destino: "Paso Canoas",
  facturas: [
    { switch_factura_id: 1, secuencial: "11-000000001", fecha_factura: "2026-10-01", cajas: 10, nota: "" },
    { switch_factura_id: 2, secuencial: "11-000000002", fecha_factura: "2026-10-01", cajas: 10, nota: "frágil" },
  ],
  ...over,
});

describe("🔴 4. el envío se valida ENTERO: todo o nada", () => {
  it("un envío bueno: cabecera una vez, notas normalizadas", () => {
    const v = validarEnvioNuevo(cuerpo());
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.valor.destino).toBe("Paso Canoas");
    expect(v.valor.facturas.map((f) => f.nota)).toEqual([null, "FRÁGIL"]);
  });

  it("una sola factura mal y no pasa ninguna (dice cuál)", () => {
    const malo = cuerpo({
      facturas: [
        { switch_factura_id: 1, secuencial: "11-000000001", fecha_factura: "2026-10-01", cajas: 10 },
        { switch_factura_id: 2, secuencial: "11-000000002", fecha_factura: "2026-10-01", cajas: 10, nota: "X".repeat(16) },
      ],
    });
    const v = validarEnvioNuevo(malo);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain("11-000000002");
  });

  it("sin facturas, sin destino, factura repetida, empresa ajena o más de 300 bultos: no", () => {
    expect(validarEnvioNuevo(cuerpo({ facturas: [] })).ok).toBe(false);
    expect(validarEnvioNuevo(cuerpo({ destino: " " })).ok).toBe(false);
    expect(validarEnvioNuevo(cuerpo({ empresa_key: "confecciones_boston" })).ok).toBe(false);
    const repetida = cuerpo();
    (repetida.facturas as Array<Record<string, unknown>>)[1].switch_factura_id = 1;
    expect(validarEnvioNuevo(repetida).ok).toBe(false);
    const grande = cuerpo();
    for (const f of grande.facturas as Array<Record<string, unknown>>) f.cajas = 200;
    expect(validarEnvioNuevo(grande).ok).toBe(false);
  });
});

// ─── 5 · Nueva guía ──────────────────────────────────────────────────────────

const vacio = (): RenglonConEtiquetas => ({
  orden: 1, cliente: "", cliente_codigo: "", direccion: "", empresa: "", facturas: "", bultos: 0, numero_guia_transp: "",
});

describe("🔴 5. en la guía el envío es UN renglón, con los bultos bloqueados", () => {
  const envio = agruparEnEnvios([A, B, C])[0];

  it("marcar el envío llena UN renglón: sus tres facturas, 30 bultos, el destino y el candado", () => {
    const r = marcarEnvio([vacio()], envio);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      cliente_codigo: "D-170",
      empresa: "Fashion Shoes",
      direccion: "Paso Canoas",
      facturas: "11-000000001, 11-000000002, 11-000000003",
      bultos: 30,
      con_etiquetas: true,
    });
    expect(bultosBloqueadosPorEtiquetas(r[0], true)).toBe(true);
  });

  it("🔴 la guía NO muestra rangos: el renglón dice las facturas y el total, nada más", () => {
    const r = marcarEnvio([vacio()], envio);
    expect(JSON.stringify(r)).not.toMatch(/1–10|11–20|de 30/);
  });

  // 🔄 1-oct-2026: Daniel aprobó UN RENGLÓN POR ENVÍO. Este candado fijaba que
  // dos envíos iguales se SUMABAN; ahora fija la regla de antes con
  // `unoPorEnvio = false` (la nueva: `guias-nueva-guia-2026-10.test.ts`).
  it("(interruptor apagado) otro envío del MISMO cliente + empresa + destino se suma al mismo renglón; con otro destino, renglón aparte", () => {
    const otro = agruparEnEnvios([etq({ id: 30, envio_id: "e2", secuencial: "11-000000009", cajas: 4 })])[0];
    const lejos = agruparEnEnvios([etq({ id: 31, envio_id: "e3", secuencial: "11-000000010", cajas: 2, destino: "David" })])[0];
    let r = marcarEnvio([vacio()], envio, false);
    r = marcarEnvio(r, otro, false);
    expect(r).toHaveLength(1);
    expect(r[0].bultos).toBe(34);
    r = marcarEnvio(r, lejos, false);
    expect(r).toHaveLength(2);
    expect(r[1]).toMatchObject({ direccion: "David", bultos: 2, con_etiquetas: true });
  });

  it("🔴 nunca se mezcla con un renglón escrito a mano, ni al revés", () => {
    const aMano: RenglonConEtiquetas = { ...vacio(), cliente: "Nova Lux", cliente_codigo: "D-170", empresa: "Fashion Shoes", direccion: "Paso Canoas", facturas: "11-000000099", bultos: 3 };
    const r = marcarEnvio([aMano], envio);
    expect(r).toHaveLength(2);
    expect(r[0].bultos).toBe(3);
    expect(r[1].bultos).toBe(30);
    // El selector de siempre tampoco suma una factura suelta al renglón del envío.
    const conSuelta = marcarFactura(r.slice(1), { nombre: "Nova Lux", codigo: "D-170" }, { empresa: "Fashion Shoes", secuencial: "11-000000050" });
    expect(conSuelta).toHaveLength(2);
    expect(conSuelta[0].facturas).toBe("11-000000001, 11-000000002, 11-000000003");
  });

  it("desmarcar quita el envío entero; si no queda nada, el renglón se va", () => {
    const r = marcarEnvio([vacio()], envio);
    const sin = desmarcarEnvio(r, envio);
    expect(sin).toHaveLength(1);
    expect(sin[0]).toMatchObject({ facturas: "", bultos: 0 });
    expect(sin[0].con_etiquetas).toBeUndefined();
  });

  it("anti-doble captura por envío: si el selector ya tomó UNA factura, el envío entero se bloquea", () => {
    const r = marcarEnvio([vacio()], envio);
    const ids = new Set(envio.filas.map((e) => e.id));
    expect(capturaDelEnvio(r, envio.filas, ids)).toBe("marcada");
    expect(capturaDelEnvio([vacio()], envio.filas, new Set())).toBe("libre");
    const tomada = marcarFactura([vacio()], { nombre: "Nova Lux", codigo: "D-170" }, { empresa: "Fashion Shoes", secuencial: "11-000000002" });
    expect(capturaDelEnvio(tomada, envio.filas, new Set())).toBe("tomada-por-el-selector");
  });

  it("🔴 un renglón SIN etiquetas (guía a mano) sigue editable; y con el interruptor apagado, todo editable", () => {
    expect(bultosBloqueadosPorEtiquetas({ con_etiquetas: undefined }, true)).toBe(false);
    expect(bultosBloqueadosPorEtiquetas({ con_etiquetas: true }, false)).toBe(false);
    expect(ETIQUETAS_POR_ENVIO).toBe(true);
  });
});

// ─── 6 · el despacho de bodega ───────────────────────────────────────────────

describe("🔴 6. el celular de bodega no manda bultos de un envío etiquetado", () => {
  it("aunque el teléfono traiga otro número (un borrador viejo), esa línea no viaja", () => {
    const items = [
      { id: "a", bultos: 30, con_etiquetas: true },
      { id: "b", bultos: 7 },
    ];
    expect(correccionesDeBultos(items, [31, 8])).toEqual([{ id: "b", bultos: 8 }]);
  });
});

// ─── 7 · el PUT ──────────────────────────────────────────────────────────────

describe("🔴 7. al reemplazar los renglones, cada etiqueta vuelve a SU renglón nuevo", () => {
  const nuevos = [
    { id: "n1", cliente_codigo: "D-170", empresa: "Fashion Shoes", direccion: "David" },
    { id: "n2", cliente_codigo: "d-170 ", empresa: "fashion shoes", direccion: "Paso  Canoas" },
    { id: "n3", cliente_codigo: "D-55", empresa: "Vistana International", direccion: "David" },
  ];

  it("el del mismo cliente + empresa + destino (exacto, sin mayúsculas ni espacios de más)", () => {
    expect(renglonNuevoDe({ cliente_codigo: "D-170", empresa: "Fashion Shoes", direccion: "Paso Canoas" }, nuevos)?.id).toBe("n2");
  });

  it("si el destino cambió, el ÚLTIMO del mismo cliente + empresa", () => {
    expect(renglonNuevoDe({ cliente_codigo: "D-170", empresa: "Fashion Shoes", direccion: "Chiriquí" }, nuevos)?.id).toBe("n2");
  });

  it("si el renglón se quitó de la guía, a ninguno (vuelve a «Pendiente»)", () => {
    expect(renglonNuevoDe({ cliente_codigo: "D-999", empresa: "Fashion Shoes", direccion: "David" }, nuevos)).toBeNull();
  });
});

// ─── 8 · el papel por defecto ────────────────────────────────────────────────

describe("🔴 8. el papel por defecto es 4×6 (Daniel, 1-oct-2026)", () => {
  it("4×6 va primero y es el que sale sin nada recordado", () => {
    expect(FORMATO_POR_DEFECTO).toBe("4x6");
    expect(OPCIONES_FORMATO[0].value).toBe("4x6");
  });
});
