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
  FACTURAS_VISIBLES_INICIAL,
  FACTURA_TRASLADO,
  GUIAS_ATAJOS_NUEVOS,
  TIPO_FACTURA,
  desmarcarFactura,
  facturaMarcada,
  grupoDeFecha,
  indiceYaSalio,
  marcarFactura,
  normalizarNumeroFactura,
  numerosDeFacturas,
  renglonDelCliente,
  yaSalioEn,
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

  it("se muestran 20 antes del «Ver más» (un cliente típico tiene 13 en 90 días)", () => {
    expect(FACTURAS_VISIBLES_INICIAL).toBe(20);
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

describe("Hoy · Esta semana · Antes (fechas fijas, borde Panamá)", () => {
  const HOY = "2026-09-04";
  it("una factura de la noche (03:00 UTC = 22:00 Panamá del día anterior) NO es de hoy", () => {
    expect(grupoDeFecha("2026-09-04T03:00:00Z", HOY)).toBe("semana");
  });
  it("hoy · semana · antes", () => {
    expect(grupoDeFecha("2026-09-04T15:00:00Z", HOY)).toBe("hoy");
    expect(grupoDeFecha("2026-08-30T15:00:00Z", HOY)).toBe("semana");
    expect(grupoDeFecha("2026-08-28T15:00:00Z", HOY)).toBe("antes");
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

  it("«No está en la lista» y «Traslado sin factura»: el renglón del cliente, como hoy", () => {
    const manual = renglonDelCliente([vacia()], CLIENTE, "");
    expect(manual[0].cliente_codigo).toBe("D-24");
    expect(manual[0].facturas).toBe("");
    const traslado = renglonDelCliente([vacia()], CLIENTE, FACTURA_TRASLADO);
    expect(traslado[0].facturas).toBe("0000");
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
