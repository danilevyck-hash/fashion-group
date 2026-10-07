// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — Despachos › Pedidos: el flujo SIMPLIFICADO (7-oct-2026)
//
// Lo que Daniel pidió, verbatim: «Quitar lo de poner número de bulto, que los
// de la bodega solo vean su pedido, anotar cuántos bultos tiene el pedido, y
// entregarlo. Al entregarlo, a la secretaria le sale en su parte los pedidos
// recibidos (con los bultos) para que ella sepa y pueda facturar en Switch.
// Cuando ella facture en Switch, le saldrá en etiquetas (que diga etiqueta,
// no bultos) y listo. Y ella tiene que poner entregado para saber que ya
// facturó el pedido que bodega le entregó.»
//
//   1. 🔴 APAGADO = LA PANTALLA DE HOY (`PEDIDOS_BULTOS_2026_10`, bulto por
//      línea, tres estados). Nace `false`: el mockup va primero.
//   2. 🔴 CUATRO ESTADOS, nombres de ERP: Pendiente → Preparado → Facturado →
//      Despachado. «Facturado» es MANUAL — no hay señal confiable de Switch
//      (ver el porqué en `pedidos-flujo-simple.ts`).
//   3. 🔴 UN SOLO NÚMERO DE BULTOS POR PEDIDO, nunca por artículo: se va la
//      asignación de bulto por línea de `pedidos_linea_bulto`.
//   4. 🔴 «Preparado» lo marca bodega o la secretaria; «Facturado» y
//      «Despachado», SOLO la secretaria o admin — nunca bodega.
//   5. 🔴 SIN la regla de «otra persona»: Facturado/Despachado son los dos
//      pasos de la MISMA secretaria, no una auditoría del trabajo de bodega.
//   6. 🔴 La pestaña «Bultos» vuelve a decir «Etiquetas» con el flujo
//      prendido (Daniel: «que diga etiqueta, no bultos»); apagado, no cambia.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  PEDIDOS_FLUJO_SIMPLE_2026_10,
  ESTADOS_FLUJO_SIMPLE,
  ROTULO_ESTADO_FLUJO_SIMPLE,
  esEstadoFlujoSimple,
  estadoFlujoSimpleLeido,
  siguienteEstadoFlujoSimple,
  estadoAnteriorFlujoSimple,
  ROLES_PREPARA_FLUJO_SIMPLE,
  ROLES_FACTURA_O_DESPACHA_FLUJO_SIMPLE,
  rolesDelEstadoFlujoSimple,
  puedeMoverFlujoSimple,
  validarCantidadBultos,
  firmaEnColumnaFlujoSimple,
  ultimaFirmaFlujoSimple,
} from "@/lib/guias/pedidos-flujo-simple";

const leer = (f: string) => fs.readFileSync(path.resolve(__dirname, "../..", f), "utf8");
const vista = () => leer("app/despachos/components/PedidosView.tsx");
const detalle = () => leer("app/despachos/components/PedidoBultos.tsx");
const rutaLista = () => leer("app/api/guias/pedidos/route.ts");
const pagina = () => leer("app/despachos/page.tsx");

describe("🔴 1 · apagado = la pantalla de hoy", () => {
  it("el interruptor nace false", () => {
    expect(PEDIDOS_FLUJO_SIMPLE_2026_10).toBe(false);
  });

  it("apagado, la ruta no cambia el nombre de la pestaña «Bultos»", () => {
    expect(pagina()).toContain('hayEtiquetas ? ([["etiquetas", PEDIDOS_FLUJO_SIMPLE_2026_10 ? "Etiquetas" : "Bultos"]]');
  });
});

describe("🔴 2 · cuatro estados, nombres de ERP", () => {
  it("el orden es Pendiente → Preparado → Facturado → Despachado", () => {
    expect([...ESTADOS_FLUJO_SIMPLE]).toEqual(["pendiente", "preparado", "facturado", "despachado"]);
    expect(ROTULO_ESTADO_FLUJO_SIMPLE).toEqual({
      pendiente: "Pendiente", preparado: "Preparado", facturado: "Facturado", despachado: "Despachado",
    });
  });

  it("siguienteEstadoFlujoSimple avanza UN paso; despachado es el final", () => {
    expect(siguienteEstadoFlujoSimple("pendiente")).toBe("preparado");
    expect(siguienteEstadoFlujoSimple("preparado")).toBe("facturado");
    expect(siguienteEstadoFlujoSimple("facturado")).toBe("despachado");
    expect(siguienteEstadoFlujoSimple("despachado")).toBeNull();
  });

  it("estadoAnteriorFlujoSimple retrocede UN paso; pendiente no tiene atrás", () => {
    expect(estadoAnteriorFlujoSimple("despachado")).toBe("facturado");
    expect(estadoAnteriorFlujoSimple("facturado")).toBe("preparado");
    expect(estadoAnteriorFlujoSimple("preparado")).toBe("pendiente");
    expect(estadoAnteriorFlujoSimple("pendiente")).toBeNull();
  });

  it("estadoFlujoSimpleLeido: sin fila o un valor raro cae a pendiente", () => {
    expect(estadoFlujoSimpleLeido(null)).toBe("pendiente");
    expect(estadoFlujoSimpleLeido(undefined)).toBe("pendiente");
    expect(estadoFlujoSimpleLeido("verificado")).toBe("pendiente"); // del otro flujo, no es uno de los 4
    expect(estadoFlujoSimpleLeido("facturado")).toBe("facturado");
    expect(esEstadoFlujoSimple("despachado")).toBe(true);
    expect(esEstadoFlujoSimple("verificado")).toBe(false);
  });
});

describe("🔴 3 · un solo número de bultos por pedido", () => {
  it("la asignación de bulto por línea se fue de la pantalla de detalle", () => {
    // El detalle del flujo simplificado se abre con `ocultarBulto`.
    expect(vista()).toContain("ocultarBulto");
    expect(detalle()).toContain("ocultarBulto");
  });

  it("validarCantidadBultos acepta enteros de 1 a 9999, nada más", () => {
    expect(validarCantidadBultos("6")).toEqual({ ok: true, valor: 6 });
    expect(validarCantidadBultos(6)).toEqual({ ok: true, valor: 6 });
    expect(validarCantidadBultos("0").ok).toBe(false);
    expect(validarCantidadBultos("10000").ok).toBe(false);
    expect(validarCantidadBultos("3.5").ok).toBe(false);
    expect(validarCantidadBultos("").ok).toBe(false);
    expect(validarCantidadBultos(undefined).ok).toBe(false);
  });
});

describe("🔴 4 · quién marca cada paso", () => {
  it("«Preparado»: bodega, secretaria o admin", () => {
    expect([...ROLES_PREPARA_FLUJO_SIMPLE]).toEqual(["admin", "secretaria", "bodega"]);
    expect([...rolesDelEstadoFlujoSimple("preparado")]).toEqual([...ROLES_PREPARA_FLUJO_SIMPLE]);
  });

  it("«Facturado» y «Despachado»: SOLO secretaria o admin, nunca bodega", () => {
    expect([...ROLES_FACTURA_O_DESPACHA_FLUJO_SIMPLE]).toEqual(["admin", "secretaria"]);
    expect(ROLES_FACTURA_O_DESPACHA_FLUJO_SIMPLE).not.toContain("bodega");
    expect([...rolesDelEstadoFlujoSimple("facturado")]).toEqual([...ROLES_FACTURA_O_DESPACHA_FLUJO_SIMPLE]);
    expect([...rolesDelEstadoFlujoSimple("despachado")]).toEqual([...ROLES_FACTURA_O_DESPACHA_FLUJO_SIMPLE]);
  });

  it("puedeMoverFlujoSimple: bodega SÍ prepara, NO factura ni despacha", () => {
    const bodega = { role: "bodega", userName: "julio" };
    expect(puedeMoverFlujoSimple({ desde: "pendiente", hasta: "preparado", empresa_key: "fashion_wear" }, bodega).ok).toBe(true);
    expect(puedeMoverFlujoSimple({ desde: "preparado", hasta: "facturado", empresa_key: "fashion_wear" }, bodega).ok).toBe(false);
    expect(puedeMoverFlujoSimple({ desde: "facturado", hasta: "despachado", empresa_key: "fashion_wear" }, bodega).ok).toBe(false);
  });

  it("puedeMoverFlujoSimple: la secretaria SÍ factura y despacha, no se salta pasos", () => {
    const secretaria = { role: "secretaria", userName: "angela" };
    expect(puedeMoverFlujoSimple({ desde: "preparado", hasta: "facturado", empresa_key: "fashion_wear" }, secretaria).ok).toBe(true);
    expect(puedeMoverFlujoSimple({ desde: "facturado", hasta: "despachado", empresa_key: "fashion_wear" }, secretaria).ok).toBe(true);
    // No se salta Preparado.
    expect(puedeMoverFlujoSimple({ desde: "pendiente", hasta: "facturado", empresa_key: "fashion_wear" }, secretaria).ok).toBe(false);
  });

  it("puedeMoverFlujoSimple respeta la empresa de cada persona (Julio no ve Vistana)", () => {
    const julio = { role: "bodega", userName: "julio" };
    expect(puedeMoverFlujoSimple({ desde: "pendiente", hasta: "preparado", empresa_key: "vistana" }, julio).ok).toBe(false);
    expect(puedeMoverFlujoSimple({ desde: "pendiente", hasta: "preparado", empresa_key: "fashion_wear" }, julio).ok).toBe(true);
  });
});

describe("🔴 5 · sin la regla de «otra persona»", () => {
  it("la secretaria que preparó también puede facturar y despachar el mismo pedido", () => {
    const secretaria = { role: "secretaria", userName: "angela" };
    // Prepara...
    expect(puedeMoverFlujoSimple({ desde: "pendiente", hasta: "preparado", empresa_key: "fashion_wear" }, secretaria).ok).toBe(true);
    // ...y la MISMA persona factura y despacha: no hay chequeo de "otra persona".
    expect(puedeMoverFlujoSimple({ desde: "preparado", hasta: "facturado", empresa_key: "fashion_wear" }, secretaria).ok).toBe(true);
    expect(puedeMoverFlujoSimple({ desde: "facturado", hasta: "despachado", empresa_key: "fashion_wear" }, secretaria).ok).toBe(true);
  });
});

describe("🔴 6 · firmas en la lista", () => {
  it("firmaEnColumnaFlujoSimple: null sin firma, texto con ella", () => {
    expect(firmaEnColumnaFlujoSimple(null, null)).toBeNull();
    expect(firmaEnColumnaFlujoSimple("Julio", "2026-10-07T15:42:00-05:00")).toMatch(/^Julio · /);
  });

  it("ultimaFirmaFlujoSimple muestra el ÚLTIMO paso dado", () => {
    const f = {
      preparado_por: "Julio", preparado_en: "2026-10-07T10:00:00-05:00",
      facturado_por: "Angela", facturado_en: "2026-10-07T15:00:00-05:00",
      despachado_por: null, despachado_en: null,
    };
    expect(ultimaFirmaFlujoSimple(f)).toMatch(/^Facturado · Angela/);
    expect(ultimaFirmaFlujoSimple({ ...f, facturado_por: null, facturado_en: null })).toMatch(/^Preparado · Julio/);
  });
});

describe("🔴 7 · el servidor tiene su propio PATCH, sin crear envío de Etiquetas", () => {
  it("existe patchFlujoSimple y no llama a crearEnvioDelPedido en ese camino", () => {
    const r = rutaLista();
    expect(r).toContain("async function patchFlujoSimple");
    expect(r).toContain("if (PEDIDOS_FLUJO_SIMPLE_2026_10) {\n    return patchFlujoSimple(");
  });

  it("el flujo simplificado REEMPLAZA al de bulto-por-línea si los dos están prendidos", () => {
    expect(rutaLista()).toContain("const BULTOS_ACTIVO = PEDIDOS_BULTOS_2026_10 && !PEDIDOS_FLUJO_SIMPLE_2026_10");
  });
});
