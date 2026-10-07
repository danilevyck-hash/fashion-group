// ─────────────────────────────────────────────────────────────────────────────
// CANDADO · GUÍAS, LO QUE DANIEL APROBÓ EL 1-oct-2026 SOBRE EL MOCKUP
// (`GUIA_NUEVA_2026_10` y `ETIQUETAS_2026_10`, en `lib/guias/guias-2026-10.ts`).
//
// Las reglas PURAS:
//   · un renglón por envío (marcar, desmarcar, agrupar y ATAR por envío);
//   · «Despachado por» no se pide al guardar la guía y sí al despachar;
//   · el aviso al guardar lista TODO lo que falta, separado por «·»;
//   · el orden de los bultos se cambia con ↑ ↓ y los rangos lo siguen;
//   · la fecha impresa es la del día de la impresión (Panamá);
//   · Etiquetas no ofrece facturas que ya salieron en una guía.
// Las pantallas y el servidor tienen su propio candado
// (`components/guias-nueva-guia-2026-10.test.tsx`, `api/guias-despachado-por-al-despachar.test.ts`).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import {
  agruparEnEnvios,
  desmarcarEnvio,
  marcarEnvio,
  moverEnElEnvio,
  rangosDelEnvio,
  renglonDelEnvio,
  textoRango,
  type RenglonConEtiquetas,
} from "@/lib/guias/etiquetas-por-envio";
import {
  agruparEtiquetasEnRenglones,
  facturasParaEtiquetar,
  fechaImpresa,
  textoEscondidasPorGuia,
  type EtiquetaFila,
} from "@/lib/guias/etiquetas";
import { datosDeEtiqueta } from "@/lib/guias/pdf-etiquetas";
import { agregarFacturasSueltas, type FacturaDelCliente } from "@/lib/guias/atajos-facturas";
import { faltaParaGuardar, textoFaltaAlGuardar, validarGuia } from "@/app/despachos/components/guia-form-logic";
import { faltaParaDespachar } from "@/lib/guias/falta-para-despachar";
import { GUIA_NUEVA_2026_10, ETIQUETAS_2026_10 } from "@/lib/guias/guias-2026-10";
import type { GuiaItem } from "@/app/despachos/components/types";

function etq(over: Partial<EtiquetaFila> = {}): EtiquetaFila {
  return {
    id: 1,
    empresa_key: "vistana",
    empresa: "Vistana International",
    switch_factura_id: 3097,
    secuencial: "11-000003097",
    fecha_factura: "2026-09-28",
    cliente_codigo: "D-170",
    cliente_nombre: "Nova Lux, S.A.",
    destino: "Paso Canoas",
    cajas: 10,
    creado_en: "2026-10-01T10:00:00-05:00",
    guia_numero: null,
    envio_id: "e1",
    orden_en_envio: 1,
    nota: null,
    ...over,
  };
}

const vacio = (): RenglonConEtiquetas => ({
  orden: 1, cliente: "", cliente_codigo: "", direccion: "", empresa: "", facturas: "", bultos: 0, numero_guia_transp: "",
});

// Dos envíos de Nova Lux · Vistana · Paso Canoas: el caso de GT-272 en las capturas.
const PRIMERO = agruparEnEnvios([
  etq({ id: 1, secuencial: "11-000003097", switch_factura_id: 3097, cajas: 50, envio_id: "e1" }),
  etq({ id: 2, secuencial: "11-000003096", switch_factura_id: 3096, cajas: 48, envio_id: "e1", orden_en_envio: 2 }),
])[0];
const SEGUNDO = agruparEnEnvios([etq({ id: 3, secuencial: "11-000003110", switch_factura_id: 3110, cajas: 4, envio_id: "e2" })])[0];

describe("los interruptores están prendidos", () => {
  it("GUIA_NUEVA_2026_10 y ETIQUETAS_2026_10", () => {
    expect(GUIA_NUEVA_2026_10).toBe(true);
    expect(ETIQUETAS_2026_10).toBe(true);
  });
});

describe("🔴 UN RENGLÓN POR ENVÍO", () => {
  it("dos envíos del mismo cliente + empresa + destino son DOS renglones, cada uno con su envio_id", () => {
    let r = marcarEnvio([vacio()], PRIMERO);
    r = marcarEnvio(r, SEGUNDO);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ envio_id: "e1", bultos: 98, facturas: "11-000003097, 11-000003096", con_etiquetas: true });
    expect(r[1]).toMatchObject({ envio_id: "e2", bultos: 4, facturas: "11-000003110", con_etiquetas: true });
  });

  it("marcar dos veces el MISMO envío no lo duplica", () => {
    const r = marcarEnvio(marcarEnvio([vacio()], PRIMERO), PRIMERO);
    expect(r).toHaveLength(1);
    expect(r[0].bultos).toBe(98);
  });

  it("desmarcar saca SU renglón y deja el del otro envío intacto", () => {
    const r = desmarcarEnvio(marcarEnvio(marcarEnvio([vacio()], PRIMERO), SEGUNDO), PRIMERO);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ envio_id: "e2", bultos: 4 });
  });

  it("desmarcar el único deja una fila vacía (el formulario nunca queda sin filas)", () => {
    const r = desmarcarEnvio(marcarEnvio([vacio()], PRIMERO), PRIMERO);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ cliente: "", facturas: "", bultos: 0, envio_id: undefined, con_etiquetas: undefined });
  });

  it("agruparEtiquetasEnRenglones junta por ENVÍO, no por cliente + empresa", () => {
    const filas = [...PRIMERO.filas, ...SEGUNDO.filas];
    const r = agruparEtiquetasEnRenglones(filas);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.bultos)).toEqual([98, 4]);
    // Con el interruptor apagado, la regla de antes: uno solo de 102.
    expect(agruparEtiquetasEnRenglones(filas, false)).toHaveLength(1);
  });

  it("al ATAR, cada envío va al renglón que lleva SUS facturas — no el primero del trío", () => {
    const nuevos = [
      { id: "r1", cliente_codigo: "D-170", empresa: "Vistana International", direccion: "Paso Canoas", facturas: "11-000003097, 11-000003096" },
      { id: "r2", cliente_codigo: "D-170", empresa: "Vistana International", direccion: "Paso Canoas", facturas: "11-000003110" },
    ];
    const trio = { cliente_codigo: "D-170", empresa: "Vistana International", direccion: "Paso Canoas" };
    expect(renglonDelEnvio({ ...trio, secuenciales: ["11-000003110"] }, nuevos)?.id).toBe("r2");
    expect(renglonDelEnvio({ ...trio, secuenciales: ["11-000003097", "11-000003096"] }, nuevos)?.id).toBe("r1");
  });

  it("si nadie lleva sus facturas, cae a la regla de antes pero SOLO entre los renglones libres", () => {
    const nuevos = [
      { id: "r1", cliente_codigo: "D-170", empresa: "Vistana International", direccion: "Paso Canoas", facturas: "9999" },
      { id: "r2", cliente_codigo: "D-170", empresa: "Vistana International", direccion: "Paso Canoas", facturas: "8888" },
    ];
    const envio = { cliente_codigo: "D-170", empresa: "Vistana International", direccion: "Paso Canoas", secuenciales: ["11-000003110"] };
    expect(renglonDelEnvio(envio, nuevos)?.id).toBe("r1");
    expect(renglonDelEnvio(envio, nuevos, new Set(["r1"]))?.id).toBe("r2");
    expect(renglonDelEnvio(envio, nuevos, new Set(["r1", "r2"]))).toBeNull();
  });
});

describe("🔴 «+ Agregar sin etiquetas» → un renglón por empresa, sin etiqueta", () => {
  const f = (empresa: string, secuencial: string): FacturaDelCliente => ({
    empresa_key: "x", empresa, secuencial, fecha: "2026-10-01T10:00:00-05:00", total: 1, yaSalioEn: null,
  });
  it("llena la fila vacía y agrega una por empresa, con sus bultos y el destino", () => {
    const r = agregarFacturasSueltas(
      [vacio()],
      { nombre: "Nova Lux, S.A.", codigo: "D-170" },
      [f("Vistana International", "3099"), f("Fashion Wear", "3285"), f("Vistana International", "3100")],
      { "Vistana International": 3, "Fashion Wear": 2 },
      " Paso Canoas ",
    );
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ empresa: "Vistana International", facturas: "3099, 3100", bultos: 3, direccion: "Paso Canoas", cliente_codigo: "D-170" });
    expect(r[1]).toMatchObject({ empresa: "Fashion Wear", facturas: "3285", bultos: 2 });
    expect((r[0] as RenglonConEtiquetas).con_etiquetas).toBeUndefined();
  });
});

describe("🔴 «Despachado por»: no al guardar la guía, sí al despachar", () => {
  const item: GuiaItem = { uid: "u1", orden: 1, cliente: "Nova Lux", direccion: "Paso Canoas", empresa: "Vistana International", facturas: "3099", bultos: 3, numero_guia_transp: "" };
  const guia = { fecha: "2026-10-01", modoEntrega: "transportista" as const, transportistaId: "t1", entregadoPor: "", items: [item] };
  const despacho = { tipoDespacho: "externo" as const, placa: "AB-1", receptor: "Juan", cedula: "8-8-8", chofer: "", tieneFirma1: true, tieneFirma2: true };

  it("la guía se guarda sin quien despacha", () => {
    expect(validarGuia(guia).has("entregadoPor")).toBe(false);
    expect(faltaParaGuardar(guia)).toEqual([]);
  });
  it("el despacho NO se completa sin quien despacha (ni con «Otro…»)", () => {
    expect(faltaParaDespachar({ ...despacho, despachadoPor: "" })).toEqual(["despachado por"]);
    expect(faltaParaDespachar({ ...despacho, despachadoPor: "__other__" })).toEqual(["despachado por"]);
    expect(faltaParaDespachar({ ...despacho, despachadoPor: "Jorman" })).toEqual([]);
  });
});

describe("🔴 el aviso al guardar lista TODO lo que falta, en una línea", () => {
  it("«Falta: el transportista · al menos un envío»", () => {
    const falta = faltaParaGuardar({ fecha: "2026-10-01", modoEntrega: "transportista", transportistaId: null, entregadoPor: "", items: [] });
    expect(falta).toEqual(["el transportista", "al menos un envío"]);
    expect(textoFaltaAlGuardar(falta)).toBe("Falta: el transportista · al menos un envío");
  });
  it("sin faltas, nada", () => {
    expect(textoFaltaAlGuardar([])).toBe("");
  });
});

describe("🔴 el orden de los bultos se cambia con ↑ ↓ y los rangos lo siguen", () => {
  const filas = [
    { id: 1, cajas: 10, orden_en_envio: 1, n: "A" },
    { id: 2, cajas: 5, orden_en_envio: 2, n: "B" },
    { id: 3, cajas: 3, orden_en_envio: 3, n: "C" },
  ];
  /** Lo que hace la pantalla: el orden del arreglo ES `orden_en_envio`. */
  const conOrden = (xs: typeof filas) => xs.map((x, i) => ({ ...x, orden_en_envio: i + 1 }));

  it("A 1–10, B 11–15, C 16–18; subir C la deja segunda: A 1–10, C 11–13, B 14–18", () => {
    expect(rangosDelEnvio(filas).rangos.map(textoRango)).toEqual(["1–10", "11–15", "16–18"]);
    const movida = conOrden(moverEnElEnvio(filas, 2, -1));
    expect(movida.map((x) => x.n)).toEqual(["A", "C", "B"]);
    const { rangos, total } = rangosDelEnvio(movida);
    expect(rangos.map((r) => `${r.fila.n} ${textoRango(r)}`)).toEqual(["A 1–10", "C 11–13", "B 14–18"]);
    expect(total).toBe(18);
  });

  it("en los bordes no se mueve nada, y nunca muta", () => {
    expect(moverEnElEnvio(filas, 0, -1).map((x) => x.n)).toEqual(["A", "B", "C"]);
    expect(moverEnElEnvio(filas, 2, 1).map((x) => x.n)).toEqual(["A", "B", "C"]);
    moverEnElEnvio(filas, 1, -1);
    expect(filas.map((x) => x.n)).toEqual(["A", "B", "C"]);
  });
});

describe("🔴 la fecha impresa es la del DÍA DE LA IMPRESIÓN (Panamá)", () => {
  it("sale de `creado_en` en hora de Panamá, no de la fecha de la factura", () => {
    // 1-oct 23:30 de Panamá = 2-oct 04:30 UTC: el día impreso es el 1.
    const e = etq({ fecha_factura: "2026-09-28", creado_en: "2026-10-02T04:30:00Z" });
    expect(fechaImpresa(e)).toBe("2026-10-01");
    expect(datosDeEtiqueta(e).fecha_factura).toBe("2026-10-01");
  });
  it("una reimpresión de días después es COPIA IDÉNTICA: sigue el día original", () => {
    const e = etq({ creado_en: "2026-10-01T15:00:00Z" });
    expect(fechaImpresa(e, new Date("2026-10-09T12:00:00Z"))).toBe("2026-10-01");
  });
  it("sin `creado_en` legible, el día de hoy", () => {
    expect(fechaImpresa(etq({ creado_en: "" }), new Date("2026-10-05T12:00:00Z"))).toBe("2026-10-05");
  });
  it("con el interruptor apagado, la de la factura como antes", () => {
    expect(fechaImpresa(etq({ fecha_factura: "2026-09-28" }), new Date(), false)).toBe("2026-09-28");
  });
});

describe("🔴 Etiquetas NO ofrece facturas que ya salieron en una guía", () => {
  const f = (over: Partial<FacturaDelCliente>): FacturaDelCliente => ({
    empresa_key: "vistana", empresa: "Vistana International", switch_factura_id: 1, secuencial: "11-000000001",
    fecha: "2026-10-01T10:00:00-05:00", total: 10, yaSalioEn: null, ...over,
  });
  // La 3097 y la 3096 ya iban en una guía hecha a mano (GT-271).
  const facturas = [
    f({ switch_factura_id: 3097, secuencial: "11-000003097", yaSalioEn: 271 }),
    f({ switch_factura_id: 3096, secuencial: "11-000003096", yaSalioEn: 271 }),
    f({ switch_factura_id: 3110, secuencial: "11-000003110" }),
    f({ switch_factura_id: 3111, secuencial: "11-000003111" }),
  ];
  it("las esconde y lo DICE; la regla es `yaSalioEn`, el mismo dato del chip de Nueva guía", () => {
    const { visibles, escondidas, yaSalieron } = facturasParaEtiquetar(facturas, [etq({ switch_factura_id: 3111, empresa_key: "vistana" })]);
    expect(visibles.map((x) => x.secuencial)).toEqual(["11-000003110"]);
    expect(escondidas).toBe(1);
    expect(yaSalieron).toBe(2);
    expect(textoEscondidasPorGuia(yaSalieron)).toBe("2 facturas de este cliente ya salieron en una guía");
    expect(textoEscondidasPorGuia(0)).toBeNull();
  });
  it("con el interruptor apagado se ofrecen como antes", () => {
    expect(facturasParaEtiquetar(facturas, [], false).visibles).toHaveLength(4);
  });
});
