/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GUÍAS › FACTURAS DEL CLIENTE — el módulo puro del atajo (4-sep-2026).
 *
 * Daniel aprobó el mockup («va») y fijó la reversión: *«te aviso si quiero
 * revertir todo después de probarlo en producción con mi secretaria estas
 * semanas»*. Lo que este archivo congela:
 *
 *   1. 🔴 TODO cuelga de UNA constante (`GUIAS_ATAJOS_NUEVOS`).
 *   2. 🔴 NADA de esto cambia lo que se GUARDA: la misma guía armada por los
 *      dos caminos (marcar facturas vs escribir a mano) produce el MISMO
 *      payload — se compara con `instantaneaRenglones`, que es exactamente lo
 *      que el PUT escribe.
 *   3. Marcar 4 facturas de 3 empresas produce 3 renglones, uno por empresa,
 *      con las facturas separadas por coma (el formato de hoy: "2535, 2536").
 *   4. El aviso «ya salió» parea por (EMPRESA, número) exactos y normalizados
 *      — los secuenciales de Switch se repiten entre empresas — y solo afirma
 *      el positivo.
 *   5. Solo se ofrecen comprobantes tipo «Factura», amarrado al vocabulario de
 *      `tipos-comprobante.ts`.
 *
 * Fechas FIJAS, nunca `new Date()` (Panamá es UTC−5 fijo).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import {
  DIAS_CON_FACTURA_VISIBLES,
  DIAS_POR_VER_MAS,
  GUIAS_ATAJOS_NUEVOS,
  TEXTO_TRASLADO,
  TIPO_FACTURA,
  agruparPorDia,
  desmarcarFactura,
  esTraslado,
  facturaMarcada,
  indiceYaSalio,
  marcarFactura,
  normalizarNumeroFactura,
  numerosDeFacturas,
  renglonDelCliente,
  tituloDelDia,
  yaSalioEn,
  type FacturaDelCliente,
  type RenglonDeGuia,
} from "@/lib/guias/atajos-facturas";
import { instantaneaRenglones } from "@/lib/guias/cambios-form";
import { TIPOS_VENTA_SUMAN } from "@/lib/ventas/tipos-comprobante";

const CLIENTE = { nombre: "City Mall David", codigo: "D-24" };

function vacia(orden = 1): RenglonDeGuia {
  return {
    uid: `u${orden}`,
    orden,
    cliente: "",
    cliente_codigo: "",
    direccion: "",
    empresa: "",
    facturas: "",
    bultos: 0,
    numero_guia_transp: "",
  };
}

describe("el interruptor y el tipo", () => {
  it("GUIAS_ATAJOS_NUEVOS existe y es booleano — la reversión es UNA constante", () => {
    expect(typeof GUIAS_ATAJOS_NUEVOS).toBe("boolean");
  });

  it("solo se ofrece el tipo «Factura», el del vocabulario canónico", () => {
    expect(TIPO_FACTURA).toBe("Factura");
    expect(TIPOS_VENTA_SUMAN).toContain(TIPO_FACTURA);
  });

  it("🔴 se abren los últimos 3 días CON factura, y «Ver más días» trae 3 más — medido: 77% del último día, 95% de los últimos 3", () => {
    expect(DIAS_CON_FACTURA_VISIBLES).toBe(3);
    expect(DIAS_POR_VER_MAS).toBe(3);
  });
});

describe("normalización exacta, nunca por parecido", () => {
  it("un número con ceros a la izquierda es el MISMO valor", () => {
    expect(normalizarNumeroFactura("02535")).toBe("2535");
    expect(normalizarNumeroFactura(" 2535 ")).toBe("2535");
  });

  it("lo que no es puramente numérico NO se recorta (FA-001 ≠ FA-1)", () => {
    expect(normalizarNumeroFactura("FA-001")).toBe("FA-001");
    expect(normalizarNumeroFactura("FA-001")).not.toBe(normalizarNumeroFactura("FA-1"));
  });

  it("numerosDeFacturas parte por coma y tira vacíos", () => {
    expect(numerosDeFacturas("2535, 2536")).toEqual(["2535", "2536"]);
    expect(numerosDeFacturas(" 2535 ,, 02536 ")).toEqual(["2535", "2536"]);
    expect(numerosDeFacturas(null)).toEqual([]);
  });
});

describe("🔴 la agrupación es POR DÍA CON FACTURA, no por días de calendario (fechas fijas, borde Panamá)", () => {
  const F = (fecha: string, secuencial = "1", empresa = "Vistana International"): FacturaDelCliente => ({
    empresa_key: "vistana",
    empresa,
    secuencial,
    fecha,
    total: 10,
    yaSalioEn: null,
  });

  it("🔴 3 días con factura que abarcan 3 SEMANAS → los 3 grupos, el más reciente arriba", () => {
    // Un corte por calendario dejaría un solo día: el cliente que menos compra
    // es justo para quien Daniel pidió esto (77% / 92% / 95% medido).
    const facturas = [
      F("2026-08-18T15:00:00Z", "100"),
      F("2026-09-04T15:00:00Z", "300"),
      F("2026-08-25T15:00:00Z", "200"),
      F("2026-08-25T18:00:00Z", "201"),
    ];
    const { grupos, diasOcultos } = agruparPorDia(facturas, DIAS_CON_FACTURA_VISIBLES);
    expect(grupos.map((g) => g.dia)).toEqual(["2026-09-04", "2026-08-25", "2026-08-18"]);
    expect(diasOcultos).toBe(0);
    // Dentro del día, la más reciente primero.
    expect(grupos[1].facturas.map((f) => f.secuencial)).toEqual(["201", "200"]);
  });

  it("con más días que los visibles, se recorta a los N MÁS RECIENTES y se dice cuántos días quedan", () => {
    const facturas = ["2026-08-14", "2026-08-18", "2026-08-25", "2026-08-30", "2026-09-03", "2026-09-04"]
      .map((d, i) => F(`${d}T15:00:00Z`, String(i)));
    const tres = agruparPorDia(facturas, 3);
    expect(tres.grupos.map((g) => g.dia)).toEqual(["2026-09-04", "2026-09-03", "2026-08-30"]);
    expect(tres.diasOcultos).toBe(3);
    // «Ver más días» = pedir 3 más: aparecen TODOS los días con factura.
    const seis = agruparPorDia(facturas, 3 + DIAS_POR_VER_MAS);
    expect(seis.grupos).toHaveLength(6);
    expect(seis.diasOcultos).toBe(0);
  });

  it("el día es el de PANAMÁ: una factura de las 03:00 UTC es del día anterior (22:00 en Panamá)", () => {
    const { grupos } = agruparPorDia([F("2026-09-04T03:00:00Z")], 3);
    expect(grupos.map((g) => g.dia)).toEqual(["2026-09-03"]);
  });

  it("el encabezado del día va en palabras: «Viernes 4 sep», «Martes 25 ago»", () => {
    expect(tituloDelDia("2026-09-04")).toBe("Viernes 4 sep");
    expect(tituloDelDia("2026-08-25")).toBe("Martes 25 ago");
    expect(tituloDelDia("2026-09-03")).toBe("Jueves 3 sep");
  });
});

describe("«ya salió»: por (empresa, número), y solo el positivo", () => {
  const indice = indiceYaSalio([
    { empresa: "Vistana International", facturas: "2535, 2536", guiaNumero: 204 },
    { empresa: "VISTANA INTERNATIONAL", facturas: "02535", guiaNumero: 210 },
    { empresa: "Fashion Wear", facturas: "9001", guiaNumero: 190 },
  ]);

  it("parea exacto y normalizado (texto viejo en MAYÚSCULAS, ceros a la izquierda)", () => {
    expect(yaSalioEn(indice, "Vistana International", "2536")).toBe(204);
    // la misma factura en dos guías vivas: gana la más reciente
    expect(yaSalioEn(indice, "Vistana International", "2535")).toBe(210);
  });

  it("🔴 el MISMO número en OTRA empresa NO se marca — los secuenciales se repiten entre empresas", () => {
    expect(yaSalioEn(indice, "Fashion Wear", "2535")).toBeNull();
  });

  it("no afirma el negativo: lo que no consta devuelve null, no un «no salió»", () => {
    expect(yaSalioEn(indice, "Joystep", "1")).toBeNull();
  });
});

describe("marcar facturas LLENA los renglones de siempre — uno por EMPRESA", () => {
  const F = (empresa: string, secuencial: string) => ({ empresa, secuencial });

  it("4 facturas de 3 empresas → 3 renglones, con las facturas agrupadas «2535, 2536»", () => {
    let items: RenglonDeGuia[] = [vacia()];
    items = marcarFactura(items, CLIENTE, F("Vistana International", "2535"));
    items = marcarFactura(items, CLIENTE, F("Fashion Wear", "7001"));
    items = marcarFactura(items, CLIENTE, F("Vistana International", "2536"));
    items = marcarFactura(items, CLIENTE, F("Joystep", "88"));

    expect(items).toHaveLength(3);
    const porEmpresa = Object.fromEntries(items.map((r) => [r.empresa, r.facturas]));
    expect(porEmpresa).toEqual({
      "Vistana International": "2535, 2536",
      "Fashion Wear": "7001",
      Joystep: "88",
    });
    for (const r of items) {
      expect(r.cliente).toBe(CLIENTE.nombre);
      expect(r.cliente_codigo).toBe(CLIENTE.codigo);
    }
  });

  it("no muta: el arreglo de entrada queda intacto", () => {
    const items = [vacia()];
    const antes = JSON.stringify(items);
    marcarFactura(items, CLIENTE, F("Joystep", "88"));
    expect(JSON.stringify(items)).toBe(antes);
  });

  it("lo escrito a mano en facturas SE CONSERVA: marcar agrega al final", () => {
    const items: RenglonDeGuia[] = [
      { ...vacia(), cliente: CLIENTE.nombre, cliente_codigo: "D-24", empresa: "Joystep", facturas: "9999" },
    ];
    const despues = marcarFactura(items, CLIENTE, F("Joystep", "88"));
    expect(despues[0].facturas).toBe("9999, 88");
  });

  it("desmarcar quita SOLO ese número; con bultos o dirección escritos, la fila se queda", () => {
    let items: RenglonDeGuia[] = [vacia()];
    items = marcarFactura(items, CLIENTE, F("Vistana International", "2535"));
    items = marcarFactura(items, CLIENTE, F("Vistana International", "2536"));
    items = items.map((r) => ({ ...r, bultos: 4 }));
    items = desmarcarFactura(items, CLIENTE, F("Vistana International", "2536"));
    expect(items).toHaveLength(1);
    expect(items[0].facturas).toBe("2535");
    items = desmarcarFactura(items, CLIENTE, F("Vistana International", "2535"));
    // los bultos los escribió una persona: la fila no se borra
    expect(items).toHaveLength(1);
    expect(items[0].facturas).toBe("");
    expect(items[0].bultos).toBe(4);
  });

  it("desmarcar la última factura de una fila sin nada más la retira — y siempre queda una fila", () => {
    let items: RenglonDeGuia[] = [vacia()];
    items = marcarFactura(items, CLIENTE, F("Joystep", "88"));
    items = desmarcarFactura(items, CLIENTE, F("Joystep", "88"));
    expect(items).toHaveLength(1);
    expect(items[0].cliente).toBe("");
    expect(items[0].facturas).toBe("");
  });

  it("facturaMarcada lee los renglones (la fuente de verdad), con normalización", () => {
    const items: RenglonDeGuia[] = [
      { ...vacia(), cliente: CLIENTE.nombre, cliente_codigo: "D-24", empresa: "Vistana International", facturas: "02535" },
    ];
    expect(facturaMarcada(items, CLIENTE, F("Vistana International", "2535"))).toBe(true);
    expect(facturaMarcada(items, CLIENTE, F("Fashion Wear", "2535"))).toBe(false);
  });

  it("«Escribir el número»: el renglón del cliente con facturas vacío, como hoy", () => {
    const manual = renglonDelCliente([vacia()], CLIENTE, "");
    expect(manual[0].cliente_codigo).toBe("D-24");
    expect(manual[0].facturas).toBe("");
  });

  it("🔴 «Traslado» escribe el TEXTO `Traslado` en facturas — nunca «0000» (los 58 renglones viejos no se tocan)", () => {
    // Daniel: «que en factura salga traslado». El texto va HARDCODEADO acá a
    // propósito: si la constante volviera a «0000», este caso se pone rojo.
    const traslado = renglonDelCliente([vacia()], CLIENTE, TEXTO_TRASLADO);
    expect(traslado[0].facturas).toBe("Traslado");
    expect(traslado[0].cliente_codigo).toBe("D-24");
    // 🔴 La EMPRESA se elige a mano: no hay factura que la diga.
    expect(traslado[0].empresa).toBe("");
    expect(esTraslado("Traslado")).toBe(true);
    expect(esTraslado(" traslado ")).toBe(true);
    expect(esTraslado("0000")).toBe(false);
    expect(esTraslado("Traslado 2")).toBe(false);
  });
});

// ─── el destino AUTOLLENADO viaja con el renglón que nace (4-sep-2026) ────────
// Daniel: «sí quiero que se llene sola, ¿ese no era el propósito de todo
// esto?». El VALOR lo calcula el formulario con `destinoParaAutollenar` (UN
// solo destino, definido o único en la historia agrupada); acá se congela que
// entra SOLO en filas que nacen del atajo y que lo escrito jamás se pisa.

describe("el destino autollenado al marcar", () => {
  const F = (empresa: string, secuencial: string) => ({ empresa, secuencial });
  it("marcar la primera factura escribe la dirección autollenada en el renglón que nace", () => {
    const items = marcarFactura([vacia()], CLIENTE, F("Vistana International", "2535"), "David");
    expect(items[0].direccion).toBe("David");
    // Y «Escribir el número» / «Traslado» igual: también nacen de elegir.
    expect(renglonDelCliente([vacia()], CLIENTE, "", "David")[0].direccion).toBe("David");
  });

  it("🔴 una dirección YA escrita no se pisa: marcar otra factura no toca el renglón existente", () => {
    let items: RenglonDeGuia[] = [vacia()];
    items = marcarFactura(items, CLIENTE, F("Vistana International", "2535"), "David");
    items = items.map((r) => ({ ...r, direccion: "Bodega del cliente" }));
    items = marcarFactura(items, CLIENTE, F("Vistana International", "2536"), "David");
    expect(items[0].direccion).toBe("Bodega del cliente");
  });

  it("sin destino único (null) el renglón nace con la dirección vacía, como hoy", () => {
    const items = marcarFactura([vacia()], CLIENTE, F("Joystep", "88"), null);
    expect(items[0].direccion).toBe("");
  });

  it("desmarcar la última factura retira la fila si la dirección es EXACTAMENTE la autollenada — no era trabajo de nadie", () => {
    let items: RenglonDeGuia[] = [vacia()];
    items = marcarFactura(items, CLIENTE, F("Joystep", "88"), "David");
    items = desmarcarFactura(items, CLIENTE, F("Joystep", "88"), "David");
    expect(items).toHaveLength(1);
    expect(items[0].cliente).toBe("");
    expect(items[0].direccion).toBe("");
  });

  it("🔴 pero si la persona la EDITÓ, la fila se conserva: eso ya es texto suyo", () => {
    let items: RenglonDeGuia[] = [vacia()];
    items = marcarFactura(items, CLIENTE, F("Joystep", "88"), "David");
    items = items.map((r) => ({ ...r, direccion: "David, frente al parque" }));
    items = desmarcarFactura(items, CLIENTE, F("Joystep", "88"), "David");
    expect(items).toHaveLength(1);
    expect(items[0].direccion).toBe("David, frente al parque");
  });
});

describe("🔴 «Traslado» y la validación del formulario", () => {
  it("un renglón con facturas = «Traslado» es VÁLIDO, y la empresa se sigue pidiendo", async () => {
    const { validarGuia, claveCampo } = await import("@/app/guias/components/guia-form-logic");
    const item = {
      uid: "t1", orden: 1, cliente: "Multi Fashion Holding", cliente_codigo: "D-108",
      direccion: "Albrook", empresa: "", facturas: "Traslado", bultos: 3, numero_guia_transp: "",
    };
    const base = { fecha: "2026-09-04", modoEntrega: "entrega_directa" as const, transportistaId: null, entregadoPor: "Julio" };
    // Sin empresa: falta LA EMPRESA (se elige a mano — no hay factura que la
    // diga), pero «Traslado» NO dispara el error de formato de factura.
    const sinEmpresa = validarGuia({ ...base, items: [item] });
    expect(sinEmpresa.has(claveCampo(item, "empresa"))).toBe(true);
    expect(sinEmpresa.has(claveCampo(item, "facturas-format"))).toBe(false);
    // Con la empresa elegida, el renglón queda limpio.
    const completo = validarGuia({ ...base, items: [{ ...item, empresa: "Vistana International" }] });
    expect(completo.size).toBe(0);
  });
});

describe("🔴 el payload NO cambia: los dos caminos producen lo MISMO", () => {
  it("marcar facturas + bultos = escribir el renglón a mano, byte por byte (instantaneaRenglones)", () => {
    // Camino 1: el atajo — marcar dos facturas de Vistana y una de Fashion Wear.
    let atajo: RenglonDeGuia[] = [vacia()];
    atajo = marcarFactura(atajo, CLIENTE, { empresa: "Vistana International", secuencial: "2535" });
    atajo = marcarFactura(atajo, CLIENTE, { empresa: "Vistana International", secuencial: "2536" });
    atajo = marcarFactura(atajo, CLIENTE, { empresa: "Fashion Wear", secuencial: "7001" });
    // la persona escribe dirección y bultos por EMPRESA, como en el formulario
    atajo = atajo.map((r, i) => ({ ...r, direccion: "David", bultos: i === 0 ? 3 : 2 }));

    // Camino 2: a mano, exactamente como hoy.
    const aMano: RenglonDeGuia[] = [
      { orden: 1, cliente: "City Mall David", cliente_codigo: "D-24", direccion: "David", empresa: "Vistana International", facturas: "2535, 2536", bultos: 3, numero_guia_transp: "" },
      { orden: 2, cliente: "City Mall David", cliente_codigo: "D-24", direccion: "David", empresa: "Fashion Wear", facturas: "7001", bultos: 2, numero_guia_transp: "" },
    ];

    expect(instantaneaRenglones(atajo)).toBe(instantaneaRenglones(aMano));
  });
});
