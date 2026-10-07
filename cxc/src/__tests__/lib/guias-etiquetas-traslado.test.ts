/**
 * 🔴 GUÍAS › ETIQUETAS — TRASLADO SIN FACTURA (2-oct-2026, `ETIQUETAS_TRASLADO_2026_10`).
 *
 * Daniel: «¿y si quiero mandar algo extra de la bodega que no está en el
 * sistema?». Candados:
 *   1. Lo de hoy no cambia: el interruptor nace en `false` y, apagado, una fila
 *      sin factura se rechaza como siempre; una factura se valida igual.
 *   2. Un traslado no pide factura (sí empresa, contenido, destino y bultos).
 *   3. El PDF dice TRASLADO donde va la factura y el contenido en la línea de
 *      la nota, con el rótulo «Contenido». Una factura sale idéntica.
 *   4. En la guía se guarda «Traslado» en facturas, con los bultos 🔒, y el
 *      contenido queda en Observaciones.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import { ETIQUETAS_TRASLADO_2026_10 } from "@/lib/guias/guias-2026-10";
import {
  agruparEnEnvios,
  bultosBloqueadosPorEtiquetas,
  contenidoDelTraslado,
  desmarcarEnvio,
  lineaDeTraslado,
  marcarEnvio,
  observacionesConTraslado,
  validarEnvioNuevo,
  type RenglonConEtiquetas,
} from "@/lib/guias/etiquetas-por-envio";
import { construirPdfEtiquetas, datosDeEtiqueta, paginasDelEnvio } from "@/lib/guias/pdf-etiquetas";
import type { EtiquetaFila } from "@/lib/guias/etiquetas";
import { validarGuia } from "@/app/despachos/components/guia-form-logic";
import type { GuiaItem } from "@/app/despachos/components/types";

const CABECERA = {
  empresa_key: "vistana",
  cliente_codigo: "D-25",
  cliente_nombre: "City Mall Paso Canoa",
  destino: "Paso Canoas",
};
const FILA_TRASLADO = { switch_factura_id: null, secuencial: "Traslado", fecha_factura: "2026-10-02", cajas: 3, nota: "3 muebles ck" };
const FILA_FACTURA = { switch_factura_id: 52558, secuencial: "11-000002558", fecha_factura: "2026-10-02", cajas: 4, nota: null };

function etq(over: Partial<EtiquetaFila> = {}): EtiquetaFila {
  return {
    id: 1,
    empresa_key: "vistana",
    empresa: "Vistana International",
    switch_factura_id: null,
    secuencial: "Traslado",
    fecha_factura: "2026-10-02",
    cliente_codigo: "D-25",
    cliente_nombre: "City Mall Paso Canoa",
    destino: "Paso Canoas",
    cajas: 3,
    creado_en: "2026-10-02T10:00:00-05:00",
    guia_numero: null,
    envio_id: "traslado-1",
    orden_en_envio: 1,
    nota: "3 MUEBLES CK",
    ...over,
  };
}

function textos(doc: ReturnType<typeof construirPdfEtiquetas>): string[] {
  const crudo = Buffer.from(doc.output("arraybuffer") as ArrayBuffer).toString("latin1");
  return [...crudo.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((m) => m[1]);
}

describe("🔴 1. lo de hoy no cambia", () => {
  // Nació apagado; Daniel aprobó el 2-oct-2026 («sigue») y se prendió.
  it("el interruptor está prendido (Daniel aprobó el 2-oct-2026)", () => {
    expect(ETIQUETAS_TRASLADO_2026_10).toBe(true);
  });
  it("apagado, una fila sin factura se rechaza como siempre", () => {
    const v = validarEnvioNuevo({ ...CABECERA, facturas: [FILA_TRASLADO] }, false);
    expect(v).toEqual({ ok: false, error: "Falta el número interno de la factura" });
  });
  it("una factura se valida igual, prendido o apagado", () => {
    const a = validarEnvioNuevo({ ...CABECERA, facturas: [FILA_FACTURA] }, false);
    const b = validarEnvioNuevo({ ...CABECERA, facturas: [FILA_FACTURA] }, true);
    expect(b).toEqual(a);
    expect(a.ok && a.valor.facturas[0].switch_factura_id).toBe(52558);
  });
  it("una etiqueta de factura sale en el papel EXACTAMENTE como antes", () => {
    const d = datosDeEtiqueta(etq({ switch_factura_id: 52558, secuencial: "11-000002558", nota: "FRÁGIL" }));
    expect(d.secuencial).toBe("11-000002558");
    expect(d.rotuloNota).toBeUndefined();
  });
});

describe("🔴 2. un traslado no pide factura", () => {
  it("se guarda sin id de Switch, «Traslado» y el contenido en la nota", () => {
    const v = validarEnvioNuevo({ ...CABECERA, facturas: [FILA_TRASLADO] }, true);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.valor.empresa_key).toBe("vistana");
    expect(v.valor.facturas).toEqual([
      { switch_factura_id: null, secuencial: "Traslado", fecha_factura: "2026-10-02", cajas: 3, nota: "3 MUEBLES CK" },
    ]);
  });
  it("sí pide contenido, destino y bultos; la empresa, si viene, de la lista cerrada", () => {
    const sin = (over: Record<string, unknown>, fila: Record<string, unknown> = {}) =>
      validarEnvioNuevo({ ...CABECERA, ...over, facturas: [{ ...FILA_TRASLADO, ...fila }] }, true);
    expect(sin({}, { nota: "" })).toEqual({ ok: false, error: "Escribe el contenido del traslado" });
    expect(sin({}, { nota: "UN CONTENIDO DEMASIADO LARGO" }).ok).toBe(false);
    expect(sin({ empresa_key: "boston" }).ok).toBe(false);
    expect(sin({ destino: "" }).ok).toBe(false);
    expect(sin({}, { cajas: 0 }).ok).toBe(false);
  });
});

describe("🔴 3. el PDF dice TRASLADO", () => {
  it("donde va la factura dice TRASLADO y el contenido va con su rótulo", () => {
    const t = textos(construirPdfEtiquetas(paginasDelEnvio([etq()]), "4x6"));
    expect(t).toContain("TRASLADO");
    expect(t).toContain("Contenido");
    expect(t).toContain("3 MUEBLES CK");
    expect(t).not.toContain("Traslado");
  });
  it("🔴 candado (Daniel, 2-oct-2026): sobre TRASLADO el rótulo dice «Documento»; la factura sigue con «Factura»", () => {
    const t = textos(construirPdfEtiquetas(paginasDelEnvio([etq()]), "4x6"));
    expect(t).toContain("Documento");
    expect(t).not.toContain("Factura");
    const f = textos(construirPdfEtiquetas(paginasDelEnvio([etq({ switch_factura_id: 52558, secuencial: "11-000002558" })]), "4x6"));
    expect(f).toContain("Factura");
    expect(f).not.toContain("Documento");
  });
  it("numera 1..N del envío, como todo envío", () => {
    expect(paginasDelEnvio([etq()]).map((p) => `${p.numero}/${p.total}`)).toEqual(["1/3", "2/3", "3/3"]);
  });
});

describe("🔴 4. en la guía se guarda «Traslado»", () => {
  const [envio] = agruparEnEnvios([etq()]);
  const vacio: RenglonConEtiquetas = {
    orden: 1, cliente: "", cliente_codigo: "", direccion: "", empresa: "", facturas: "", bultos: 0, numero_guia_transp: "",
  };

  it("el renglón lleva «Traslado» en facturas y sus bultos bloqueados", () => {
    const [r] = marcarEnvio([vacio], envio, true);
    expect(r.facturas).toBe("Traslado");
    expect(r.bultos).toBe(3);
    expect(r.empresa).toBe("Vistana International");
    expect(bultosBloqueadosPorEtiquetas(r, true)).toBe(true);
    expect(desmarcarEnvio([r], envio)[0].facturas).toBe("");
  });
  it("el contenido entra a Observaciones y sale al desmarcar; lo escrito no se pisa", () => {
    expect(contenidoDelTraslado(envio)).toBe("3 MUEBLES CK");
    const linea = lineaDeTraslado(envio) as string;
    expect(linea).toBe("Traslado City Mall Paso Canoa: 3 MUEBLES CK");
    const con = observacionesConTraslado("Llamar antes", linea, true);
    expect(con).toBe(`Llamar antes\n${linea}`);
    expect(observacionesConTraslado(con, linea, true)).toBe(con);
    expect(observacionesConTraslado(con, linea, false)).toBe("Llamar antes");
    expect(observacionesConTraslado("", linea, true)).toBe(linea);
  });
  it("un envío de facturas no deja nada en Observaciones", () => {
    const [f] = agruparEnEnvios([etq({ switch_factura_id: 52558, secuencial: "11-000002558", nota: "FRÁGIL" })]);
    expect(lineaDeTraslado(f)).toBeNull();
  });
});

describe("la migración", () => {
  it("solo afloja la columna y exige contenido al traslado", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261226120000_guias_etiquetas_traslado.sql"), "utf8");
    expect(sql).toMatch(/ALTER COLUMN switch_factura_id DROP NOT NULL/);
    expect(sql).toMatch(/secuencial = 'Traslado' AND nota IS NOT NULL/);
    expect(sql).not.toMatch(/\b(DELETE|UPDATE|DROP TABLE|TRUNCATE)\b/i);
  });
});

// 🔴 Daniel, 2-oct-2026: «cuando es traslado… puede ser solamente traslado».
describe("🔴 5. traslado SIN empresa", () => {
  const sinEmp = etq({ empresa_key: "", empresa: "" });

  it("se valida sin empresa: viaja «» y la tabla la guarda NULL", () => {
    for (const empresa_key of ["", undefined, "  "]) {
      const v = validarEnvioNuevo({ ...CABECERA, empresa_key, facturas: [FILA_TRASLADO] }, true);
      expect(v.ok && v.valor.empresa_key).toBe("");
    }
  });
  it("🩸 una FACTURA sin empresa se sigue rechazando", () => {
    expect(validarEnvioNuevo({ ...CABECERA, empresa_key: "", facturas: [FILA_FACTURA] }, true).ok).toBe(false);
  });
  it("el papel dice FASHION GROUP arriba y TRASLADO donde va la factura", () => {
    const t = textos(construirPdfEtiquetas(paginasDelEnvio([sinEmp]), "4x6"));
    expect(t).toContain("FASHION GROUP");
    expect(t).toContain("TRASLADO");
    expect(datosDeEtiqueta(etq()).empresa).toBe("Vistana International"); // con empresa, como antes
  });
  it("numera 1..N de SU envío, aparte de los envíos con empresa", () => {
    const otro = etq({ id: 2, envio_id: "traslado-2", cajas: 2 });
    const envios = agruparEnEnvios([sinEmp, otro]);
    expect(envios).toHaveLength(2);
    expect(paginasDelEnvio([sinEmp]).map((p) => `${p.numero}/${p.total}`)).toEqual(["1/3", "2/3", "3/3"]);
  });
  it("🔴 candado: en la guía, un renglón solo «Traslado» vale sin empresa; uno con factura no", () => {
    const [envio] = agruparEnEnvios([sinEmp]);
    const vacio: RenglonConEtiquetas = {
      orden: 1, cliente: "", cliente_codigo: "", direccion: "", empresa: "", facturas: "", bultos: 0, numero_guia_transp: "",
    };
    const [r] = marcarEnvio([vacio], envio, true);
    expect(r.empresa).toBe("");
    expect(r.facturas).toBe("Traslado");
    const base = { uid: "u1", orden: 1, cliente: "City Mall", cliente_codigo: "D-25", direccion: "Paso Canoas", empresa: "", bultos: 3, numero_guia_transp: "" };
    const errores = (facturas: string) =>
      validarGuia({ fecha: "2026-10-02", modoEntrega: "propio", items: [{ ...base, facturas } as unknown as GuiaItem] } as never);
    expect(errores("Traslado").has("item-u1-empresa")).toBe(false);
    expect(errores("11-000002558").has("item-u1-empresa")).toBe(true);
  });
  it("la migración solo permite empresa NULL en un traslado", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261227120000_guias_etiquetas_traslado_sin_empresa.sql"), "utf8");
    expect(sql).toMatch(/ALTER COLUMN empresa_key DROP NOT NULL/);
    expect(sql).toMatch(/switch_factura_id IS NOT NULL AND empresa_key IS NOT NULL/);
    expect(sql).not.toMatch(/\b(DELETE|UPDATE|DROP TABLE|TRUNCATE)\b/i);
  });
});

// 🔴 Daniel, 2-oct-2026: «en traslado también importa el cliente» y «escoges la
// factura o escoges la opción traslado»: un solo camino, el mismo camión.
describe("🔴 6. el cliente manda y el traslado viaja con las facturas", () => {
  it("🩸 un traslado SIN cliente se rechaza en el servidor", () => {
    const v = validarEnvioNuevo({ ...CABECERA, cliente_codigo: "", cliente_nombre: "", facturas: [FILA_TRASLADO] }, true);
    expect(v).toEqual({ ok: false, error: "Falta el cliente" });
  });
  it("un cliente sin facturas (o fuera del directorio) se acepta: viaja sin código", () => {
    const v = validarEnvioNuevo({ ...CABECERA, cliente_codigo: "", cliente_nombre: "Tienda Nueva", facturas: [FILA_TRASLADO] }, true);
    expect(v.ok && v.valor).toMatchObject({ cliente_codigo: "", cliente_nombre: "Tienda Nueva" });
  });
  it("🩸 una FACTURA sin código de cliente se sigue rechazando", () => {
    expect(validarEnvioNuevo({ ...CABECERA, cliente_codigo: "", facturas: [FILA_FACTURA] }, true).ok).toBe(false);
  });
  it("facturas + traslado: UN envío, el traslado en su lugar y con la empresa del envío", () => {
    const v = validarEnvioNuevo({ ...CABECERA, facturas: [FILA_FACTURA, FILA_TRASLADO] }, true);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.valor.empresa_key).toBe("vistana");
    expect(v.valor.facturas.map((f) => f.secuencial)).toEqual(["11-000002558", "Traslado"]);
    expect(v.valor.facturas[1]).toMatchObject({ switch_factura_id: null, nota: "3 MUEBLES CK" });
  });
  it("🩸 dos traslados en un envío, o un traslado sin contenido junto a facturas, no", () => {
    expect(validarEnvioNuevo({ ...CABECERA, facturas: [FILA_TRASLADO, FILA_TRASLADO] }, true).ok).toBe(false);
    expect(validarEnvioNuevo({ ...CABECERA, facturas: [FILA_FACTURA, { ...FILA_TRASLADO, nota: "" }] }, true).ok).toBe(false);
  });
  it("🔴 apagado, un traslado junto a facturas se rechaza como siempre", () => {
    expect(validarEnvioNuevo({ ...CABECERA, facturas: [FILA_FACTURA, FILA_TRASLADO] }, false).ok).toBe(false);
  });
  it("🔴 los bultos se cuentan SEGUIDOS (factura 1–10, traslado 11–13) y en la guía es UN renglón", () => {
    const fac = etq({ id: 1, envio_id: "e1", orden_en_envio: 1, switch_factura_id: 52558, secuencial: "11-000002558", cajas: 10, nota: null });
    const tra = etq({ id: 2, envio_id: "e1", orden_en_envio: 2, cajas: 3 });
    const pags = paginasDelEnvio([fac, tra]);
    expect(pags.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(pags.every((p) => p.total === 13)).toBe(true);
    const [envio] = agruparEnEnvios([fac, tra]);
    const vacio: RenglonConEtiquetas = {
      orden: 1, cliente: "", cliente_codigo: "", direccion: "", empresa: "", facturas: "", bultos: 0, numero_guia_transp: "",
    };
    const renglones = marcarEnvio([vacio], envio, true);
    expect(renglones).toHaveLength(1);
    expect(renglones[0]).toMatchObject({ facturas: "11-000002558, Traslado", bultos: 13, empresa: "Vistana International" });
    expect(lineaDeTraslado(envio)).toBe("Traslado City Mall Paso Canoa: 3 MUEBLES CK");
  });
});
