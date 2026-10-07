// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — Despachos › Pedidos: el flujo SIMPLIFICADO (7-oct-2026)
//
// Lo que Daniel pidió, verbatim (primera vuelta): «Quitar lo de poner número
// de bulto, que los de la bodega solo vean su pedido, anotar cuántos bultos
// tiene el pedido, y entregarlo. Al entregarlo, a la secretaria le sale en
// su parte los pedidos recibidos (con los bultos) para que ella sepa y
// pueda facturar en Switch.»
//
// 🔴 ALCANCE RECORTADO (misma conversación, segunda vuelta): «El flujo de
// Pedidos termina en Recibido. Son tres estados y nada más […] Lo que pasa
// después —la secretaria entra a Switch, factura, y eso aparece en
// Etiquetas— no es parte de Pedidos. Tampoco programes la detección
// automática de la factura: sale del alcance.»
//
//   1. 🔴 PRENDIDO el 7-oct-2026 con el «sí» de Daniel al mockup. `false`
//      sigue siendo la pantalla de antes (`PEDIDOS_BULTOS_2026_10`, bulto
//      por línea, tres estados) — la vuelta atrás.
//   2. 🔴 TRES ESTADOS, nombres de ERP: Pendiente → Preparado → Recibido.
//      NINGÚN «Facturado» ni «Despachado»: eso vive en Switch y en
//      Etiquetas, no en Pedidos.
//   3. 🔴 UN SOLO NÚMERO DE BULTOS POR PEDIDO, nunca por artículo: se va la
//      asignación de bulto por línea de `pedidos_linea_bulto`.
//   4. 🔴 SEGUNDA VUELTA (7-oct-2026, Daniel: «¿por qué Ángela puede preparar
//      un pedido en su sistema? Ya habíamos hablado del tema»): «Preparado»
//      lo marca SOLO bodega (y admin); «Recibido», SOLO la secretaria o
//      admin — nunca bodega. Doble firma real: cada paso, otra persona.
//   5. 🔴 SIN la regla EXPLÍCITA de «otra persona» (no se compara quién
//      preparó contra quién recibe): en la práctica ya son distintos, porque
//      las dos listas de arriba no se superponen salvo en admin.
//   6. 🔴 La pestaña «Bultos» vuelve a decir «Etiquetas» con el flujo
//      prendido (Daniel: «que diga etiqueta, no bultos»); apagado, no cambia.
//   7. 🔴 UN «PREPARADO» VIEJO SE VE: a los `PREPARADO_VIEJO_DIAS` (2) días
//      sin que nadie lo reciba, la lista de la secretaria lo marca.
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
  ROLES_RECIBE_FLUJO_SIMPLE,
  ROLES_FLUJO_SIMPLE_TODAS,
  rolesDelEstadoFlujoSimple,
  puedeMoverFlujoSimple,
  validarCantidadBultos,
  firmaEnColumnaFlujoSimple,
  ultimaFirmaFlujoSimple,
  PREPARADO_VIEJO_DIAS,
  diasEnPreparado,
  preparadoViejo,
  lineaPreparadoHaceDias,
} from "@/lib/guias/pedidos-flujo-simple";

const leer = (f: string) => fs.readFileSync(path.resolve(__dirname, "../..", f), "utf8");
const vista = () => leer("app/despachos/components/PedidosView.tsx");
const detalle = () => leer("app/despachos/components/PedidoBultos.tsx");
const rutaLista = () => leer("app/api/guias/pedidos/route.ts");
const pagina = () => leer("app/despachos/page.tsx");

describe("🔴 1 · prendido — Daniel aprobó el mockup", () => {
  it("el interruptor está en true", () => {
    expect(PEDIDOS_FLUJO_SIMPLE_2026_10).toBe(true);
  });

  it("la pestaña puede decir «Etiquetas» o «Bultos» según el interruptor (el código sigue teniendo las dos ramas)", () => {
    expect(pagina()).toContain('["etiquetas", PEDIDOS_FLUJO_SIMPLE_2026_10 ? "Etiquetas" : "Bultos"]');
  });
});

describe("🔴 2 · tres estados, nombres de ERP, sin Facturado ni Despachado", () => {
  it("el orden es Pendiente → Preparado → Recibido", () => {
    expect([...ESTADOS_FLUJO_SIMPLE]).toEqual(["pendiente", "preparado", "recibido"]);
    expect(ROTULO_ESTADO_FLUJO_SIMPLE).toEqual({ pendiente: "Pendiente", preparado: "Preparado", recibido: "Recibido" });
  });

  it("ni «facturado» ni «despachado» son estados válidos: quedaron afuera del alcance", () => {
    expect(esEstadoFlujoSimple("facturado")).toBe(false);
    expect(esEstadoFlujoSimple("despachado")).toBe(false);
    expect(estadoFlujoSimpleLeido("facturado")).toBe("pendiente");
  });

  it("ningún archivo de Pedidos menciona facturar ni Switch dentro del flujo", () => {
    // Fuera de los comentarios que EXPLICAN por qué no se programó, no debe
    // haber ninguna palabra «facturad» o «despachad» como ESTADO en el código.
    expect(vista()).not.toMatch(/destino:\s*"facturado"|destino:\s*"despachado"/);
    expect(rutaLista()).not.toMatch(/estado === "facturado"|estado === "despachado"/);
  });

  it("siguienteEstadoFlujoSimple avanza UN paso; recibido es el final", () => {
    expect(siguienteEstadoFlujoSimple("pendiente")).toBe("preparado");
    expect(siguienteEstadoFlujoSimple("preparado")).toBe("recibido");
    expect(siguienteEstadoFlujoSimple("recibido")).toBeNull();
  });

  it("estadoAnteriorFlujoSimple retrocede UN paso; pendiente no tiene atrás", () => {
    expect(estadoAnteriorFlujoSimple("recibido")).toBe("preparado");
    expect(estadoAnteriorFlujoSimple("preparado")).toBe("pendiente");
    expect(estadoAnteriorFlujoSimple("pendiente")).toBeNull();
  });

  it("estadoFlujoSimpleLeido: sin fila o un valor raro cae a pendiente", () => {
    expect(estadoFlujoSimpleLeido(null)).toBe("pendiente");
    expect(estadoFlujoSimpleLeido(undefined)).toBe("pendiente");
    expect(estadoFlujoSimpleLeido("verificado")).toBe("pendiente"); // del otro flujo, no es uno de los 3
    expect(estadoFlujoSimpleLeido("recibido")).toBe("recibido");
  });
});

describe("🔴 3 · un solo número de bultos por pedido", () => {
  it("la asignación de bulto por línea se fue de la pantalla de detalle", () => {
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
  // 🔴 7-oct-2026, SEGUNDA VUELTA — Daniel: «¿por qué Ángela puede preparar un
  // pedido en su sistema? Ya habíamos hablado del tema». Ángela es secretaria.
  // Se va de la lista: ahora SOLO bodega (y admin) prepara.
  it("«Preparado»: SOLO bodega o admin, nunca la secretaria", () => {
    expect([...ROLES_PREPARA_FLUJO_SIMPLE]).toEqual(["admin", "bodega"]);
    expect(ROLES_PREPARA_FLUJO_SIMPLE).not.toContain("secretaria");
    expect([...rolesDelEstadoFlujoSimple("preparado")]).toEqual([...ROLES_PREPARA_FLUJO_SIMPLE]);
  });

  it("«Recibido»: SOLO secretaria o admin, nunca bodega", () => {
    expect([...ROLES_RECIBE_FLUJO_SIMPLE]).toEqual(["admin", "secretaria"]);
    expect(ROLES_RECIBE_FLUJO_SIMPLE).not.toContain("bodega");
    expect([...rolesDelEstadoFlujoSimple("recibido")]).toEqual([...ROLES_RECIBE_FLUJO_SIMPLE]);
  });

  it("puedeMoverFlujoSimple: bodega SÍ prepara, NO recibe", () => {
    const bodega = { role: "bodega", userName: "julio" };
    expect(puedeMoverFlujoSimple({ desde: "pendiente", hasta: "preparado", empresa_key: "fashion_wear" }, bodega).ok).toBe(true);
    const rechazo = puedeMoverFlujoSimple({ desde: "preparado", hasta: "recibido", empresa_key: "fashion_wear" }, bodega);
    expect(rechazo).toEqual({ ok: false, error: "Ese paso lo marca la secretaria" });
  });

  // 🔑 El candado de los DOS rechazos que pidió Daniel: ni bodega marca
  // Recibido (arriba) ni la secretaria marca Preparado (abajo) — el servidor
  // los rechaza aunque los llame directo, no solo la pantalla.
  it("puedeMoverFlujoSimple: la secretaria SÍ recibe, NO prepara, no se salta pasos", () => {
    const secretaria = { role: "secretaria", userName: "angela" };
    expect(puedeMoverFlujoSimple({ desde: "preparado", hasta: "recibido", empresa_key: "fashion_wear" }, secretaria).ok).toBe(true);
    const rechazo = puedeMoverFlujoSimple({ desde: "pendiente", hasta: "preparado", empresa_key: "fashion_wear" }, secretaria);
    expect(rechazo).toEqual({ ok: false, error: "Ese paso lo marca bodega" });
    // No se salta Preparado.
    expect(puedeMoverFlujoSimple({ desde: "pendiente", hasta: "recibido", empresa_key: "fashion_wear" }, secretaria).ok).toBe(false);
  });

  it("puedeMoverFlujoSimple respeta la empresa de cada persona (Julio no ve Vistana)", () => {
    const julio = { role: "bodega", userName: "julio" };
    expect(puedeMoverFlujoSimple({ desde: "pendiente", hasta: "preparado", empresa_key: "vistana" }, julio).ok).toBe(false);
    expect(puedeMoverFlujoSimple({ desde: "pendiente", hasta: "preparado", empresa_key: "fashion_wear" }, julio).ok).toBe(true);
  });

  it("el guard ANCHO del PATCH es la UNIÓN de las dos listas, no solo la de Preparado", () => {
    // Si fuera solo ROLES_PREPARA_FLUJO_SIMPLE (admin+bodega), la secretaria
    // quedaría afuera también para marcar Recibido.
    expect([...ROLES_FLUJO_SIMPLE_TODAS].sort()).toEqual(["admin", "bodega", "secretaria"]);
    expect(ROLES_FLUJO_SIMPLE_TODAS).toContain("secretaria");
    expect(ROLES_FLUJO_SIMPLE_TODAS).toContain("bodega");
  });
});

describe("🔴 5 · sin la regla de «otra persona»", () => {
  it("admin puede preparar Y recibir el mismo pedido: no hace falta que sea otra persona", () => {
    const admin = { role: "admin", userName: "daniel" };
    expect(puedeMoverFlujoSimple({ desde: "pendiente", hasta: "preparado", empresa_key: "fashion_wear" }, admin).ok).toBe(true);
    expect(puedeMoverFlujoSimple({ desde: "preparado", hasta: "recibido", empresa_key: "fashion_wear" }, admin).ok).toBe(true);
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
      recibido_por: "Angela", recibido_en: "2026-10-07T15:00:00-05:00",
    };
    expect(ultimaFirmaFlujoSimple(f)).toMatch(/^Recibido · Angela/);
    expect(ultimaFirmaFlujoSimple({ ...f, recibido_por: null, recibido_en: null })).toMatch(/^Preparado · Julio/);
  });
});

describe("🔴 7 · un «Preparado» viejo se ve", () => {
  it("el tope es 2 días: medio día o uno es demora normal, una semana ya es tarde", () => {
    expect(PREPARADO_VIEJO_DIAS).toBe(2);
  });

  it("diasEnPreparado cuenta días completos desde la firma", () => {
    expect(diasEnPreparado("2026-10-05T10:00:00-05:00", "2026-10-07T09:00:00-05:00")).toBe(1);
    expect(diasEnPreparado("2026-10-05T10:00:00-05:00", "2026-10-07T11:00:00-05:00")).toBe(2);
    expect(diasEnPreparado("2026-10-07T08:00:00-05:00", "2026-10-07T20:00:00-05:00")).toBe(0);
  });

  it("preparadoViejo: false antes del tope, true desde el tope", () => {
    expect(preparadoViejo(0)).toBe(false);
    expect(preparadoViejo(1)).toBe(false);
    expect(preparadoViejo(2)).toBe(true);
    expect(preparadoViejo(5)).toBe(true);
  });

  it("lineaPreparadoHaceDias: el texto que ve la secretaria", () => {
    expect(lineaPreparadoHaceDias(0)).toBe("Preparado hoy");
    expect(lineaPreparadoHaceDias(1)).toBe("Preparado hace 1 día");
    expect(lineaPreparadoHaceDias(2)).toBe("Preparado hace 2 días");
  });

  it("la lista marca el aviso, en ámbar, solo si está viejo", () => {
    const v = vista();
    expect(v).toContain("avisoPreparadoViejo");
    expect(v).toContain("preparadoViejo(dias)");
    expect(v).toMatch(/text-amber-700/);
  });
});

describe("🔴 8 · el servidor tiene su propio PATCH, sin crear envío de Etiquetas", () => {
  it("existe patchFlujoSimple y no llama a crearEnvioDelPedido en ese camino", () => {
    const r = rutaLista();
    expect(r).toContain("async function patchFlujoSimple");
    expect(r).toContain("if (PEDIDOS_FLUJO_SIMPLE_2026_10) {\n    return patchFlujoSimple(");
  });

  it("el flujo simplificado REEMPLAZA al de bulto-por-línea si los dos están prendidos", () => {
    expect(rutaLista()).toContain("const BULTOS_ACTIVO = PEDIDOS_BULTOS_2026_10 && !PEDIDOS_FLUJO_SIMPLE_2026_10");
  });
});
