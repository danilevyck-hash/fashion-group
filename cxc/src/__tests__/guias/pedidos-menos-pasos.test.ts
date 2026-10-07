// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — GUÍAS › PEDIDOS: MENOS PASOS Y LOS SEIS ARREGLOS (7-oct-2026)
//
// Lo que Daniel aprobó, cada punto con su prueba. Varias CORRIGEN una decisión
// del 6-oct-2026, y dónde pasa eso se dice.
//
//   1. 🔴 CAMBIAR DE ESTADO PIDE CONFIRMAR. Daniel: *«al menos que al poner,
//      ponga botón de confirmar para que no se le vaya sin querer»*. Marcar
//      «Preparado» y marcar «Verificado» abren la ventana del sistema.
//   2. 🔴 «VOLVER A PREPARADO», SOLO SECRETARIA Y ADMIN (nunca bodega), con
//      confirmación, CONSERVANDO LA FIRMA de quien preparó —el servidor la
//      pisaba con la de quien deshacía— y DESHACIENDO el envío de Etiquetas que
//      nació al verificar, en vez de dejarlo huérfano con el conteo viejo. Si no
//      se puede deshacer, se DICE y no se mueve nada.
//   3. 🔴 «VERIFICAR» BLOQUEADO mientras queden líneas sin bulto. Antes solo
//      avisaba y dejaba verificar igual.
//   4. 🔴 EL DETALLE SE CONGELA AL VERIFICAR: `PATCH …/pedidos/detalle` no
//      miraba el estado y bodega podía quitarle bultos a un pedido verificado.
//   5. 🔴 EL VENDEDOR SOLO MIRA: veía el círculo y la casilla del bulto
//      prendidos y el servidor le contestaba 403.
//   6. 🔴 DOS PASOS PARA ASIGNAR UN BULTO, no cuatro: la casilla de la fila (en
//      las DOS pantallas) y el número EN LA MISMA barra de abajo, sin el paso
//      intermedio de «Asignar bulto» para que apareciera el campo. Y la lista
//      termina con COLCHÓN: la barra no tapa la última fila.
//
// ⚠️ El enlace del pedido al envío de Etiquetas NO se programó (Daniel,
// 7-oct-2026: *«habría que ver cómo sería en la vida real porque se usa la
// factura, no el pedido»*).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  ROLES_PREPARADO,
  ROLES_VERIFICADO,
  faltaParaVerificar,
  cuantosSinBulto,
  puedeMover,
  rolesDelEstado,
  rolesDelPaso,
} from "@/lib/guias/pedidos-bultos";
import { puedeMarcarPedidos } from "@/lib/guias/pedidos-bodega";

const leer = (f: string) => fs.readFileSync(path.resolve(__dirname, "../..", f), "utf8");
const vista = () => leer("app/guias/components/PedidosView.tsx");
const detalle = () => leer("app/guias/components/PedidoBultos.tsx");
const rutaLista = () => leer("app/api/guias/pedidos/route.ts");
const rutaDetalle = () => leer("app/api/guias/pedidos/detalle/route.ts");

describe("🔴 1 · cambiar de estado pide confirmar", () => {
  it("la ventana es la del sistema (`ConfirmModal`), no una propia", () => {
    const v = vista();
    expect(v).toContain('import { ConfirmModal } from "@/components/ui"');
    expect(v).toContain("<ConfirmModal");
    // Nada de `confirm()` del navegador ni de una caja inventada.
    expect(v).not.toMatch(/window\.confirm|[^.\w]confirm\(\)/);
  });

  it("los DOS toques pasan por la confirmación: el círculo y «Verificar»", () => {
    const v = vista();
    // El círculo (pendiente → preparado) ya no llama a `cambiar` directo.
    expect(v).toContain('if (BULTOS) return setPorConfirmar({ pedido: p, destino: "preparado" })');
    // Y «Verificar» tampoco.
    expect(v).toContain('onClick={() => setPorConfirmar({ pedido: p, destino: "verificado" })}');
    expect(v).not.toContain('onClick={() => void cambiar(p, "verificado")}');
  });

  it("la ventana DICE cuál pedido es y qué va a pasar", () => {
    const v = vista();
    expect(v).toContain("function textoDeConfirmar");
    expect(v).toContain("`Pedido ${p.secuencial} · ${p.cliente_nombre}`");
    expect(v).toContain("Marcar verificado");
    expect(v).toContain("Marcar preparado");
    expect(v).toContain("Volver a Preparado");
  });
});

describe("🔴 2 · «Volver a Preparado»", () => {
  it("lo marcan la secretaria y admin, NUNCA bodega", () => {
    // Deshacer una verificación es parte de la verificación: si bodega pudiera
    // devolver el pedido y cambiarle los bultos, los dos pares de ojos no
    // servirían de nada.
    expect([...rolesDelPaso("verificado", "preparado")]).toEqual([...ROLES_VERIFICADO]);
    expect(rolesDelPaso("verificado", "preparado")).not.toContain("bodega");
    // Y hacia adelante no cambia nada: «Preparado» lo sigue marcando bodega.
    expect([...rolesDelPaso("pendiente", "preparado")]).toEqual([...ROLES_PREPARADO]);
    expect([...rolesDelPaso("preparado", "verificado")]).toEqual([...rolesDelEstado("verificado")]);
  });

  it("y el SERVIDOR lo rechaza: bodega no puede deshacer", () => {
    const arg = { desde: "verificado", hasta: "preparado", empresa_key: "vistana", preparado_por: "julio" } as const;
    expect(puedeMover(arg, { role: "bodega", userName: "rodrigo" })).toEqual({
      ok: false,
      error: "Volver a «Preparado» lo marca la secretaria",
    });
    expect(puedeMover(arg, { role: "secretaria", userName: "angela" })).toEqual({ ok: true });
    expect(puedeMover(arg, { role: "admin", userName: "daniel" })).toEqual({ ok: true });
  });

  it("🩸 CONSERVA LA FIRMA de quien preparó: el servidor ya no la pisa", () => {
    const r = rutaLista();
    // Volver atrás copia la firma previa en vez de escribir la de quien deshace.
    expect(r).toMatch(/desde === "verificado"\s*\?\s*\{\s*preparado_por: previo\?\.preparado_por \?\? null/);
    expect(r).toContain("preparado_en: previo?.preparado_en ?? null");
    // Y solo borra la firma del paso que se deshace.
    expect(r).toMatch(/preparado_por: previo\?\.preparado_por[\s\S]{0,160}verificado_por: null/);
  });

  it("deshace el envío de Etiquetas y suelta su `envio_id`", () => {
    const r = rutaLista();
    expect(r).toContain("deshacerEnvioDelPedido");
    expect(r).toContain("deshacerElEnvio");
    // Soltar el id es lo que permite que verificar otra vez cree uno nuevo con
    // los bultos de ese momento: sin esto queda el conteo viejo.
    expect(r).toContain("deshacerElEnvio ? { envio_id: null } : {}");
    expect(r).toContain("envioAnulado: true");
  });

  it("🔴 si el envío NO se puede deshacer, se DICE y el estado no se mueve", () => {
    const r = rutaLista();
    // El motivo de Etiquetas («Ya salió en GT-xxx: el envío no se anula») sale
    // tal cual, con 409, ANTES de escribir el estado.
    expect(r).toMatch(/if \(!r\.ok\) return NextResponse\.json\(\{ error: r\.error \}, \{ status: 409 \}\)/);
    expect(r).toContain('error: "No se pudo deshacer el envío de Etiquetas"');
    // Y la pantalla lo muestra: el `catch` de `cambiar` revierte y avisa.
    expect(vista()).toContain("poner(p.estado);");
  });

  it("🔑 el envío NO se corrige, se anula: lo impreso no se cambia (1-oct-2026)", () => {
    const servidor = leer("lib/guias/pedido-detalle-server.ts");
    expect(servidor).toContain("anularEnvio");
    // `corregirCajas` rechaza a propósito con envíos; nadie la llama desde acá
    // (solo se la NOMBRA en el comentario que explica por qué).
    expect(servidor).not.toMatch(/corregirCajas\s*\(/);
    expect(servidor).not.toMatch(/import \{[^}]*corregirCajas/);
    // El envío que ya no está no frena nada: no hay qué deshacer.
    expect(servidor).toContain("r.status === 404");
  });
});

describe("🔴 3 · «Verificar» bloqueado mientras falten bultos", () => {
  it("el motivo lo dice UNA función, corta y sin inventar plurales", () => {
    expect(faltaParaVerificar(0, 24)).toBeNull();
    expect(faltaParaVerificar(1, 24)).toBe("1 artículo sin bulto");
    expect(faltaParaVerificar(6, 24)).toBe("6 artículos sin bulto");
    // Un pedido sin artículos bajados tampoco se verifica.
    expect(faltaParaVerificar(0, 0)).toBe("Sin artículos todavía");
  });

  it("cuenta las líneas sin bulto, no los bultos", () => {
    const l = (bulto: number | null) => ({ bulto });
    expect(cuantosSinBulto([l(1), l(1), l(null), l(3)])).toBe(1);
    expect(cuantosSinBulto([])).toBe(0);
  });

  it("🔴 el SERVIDOR lo rechaza con 409, no solo avisa", () => {
    const r = rutaLista();
    expect(r).toContain("faltaParaVerificarPedido");
    expect(r).toMatch(/if \(falta\) return NextResponse\.json\(\{ error: falta \}, \{ status: 409 \}\)/);
    // Y el freno va ANTES de crear el envío.
    expect(r.indexOf("faltaParaVerificarPedido")).toBeLessThan(r.indexOf("crearEnvioDelPedido("));
  });

  it("la pantalla apaga el botón con la MISMA función y dice qué falta", () => {
    const v = vista();
    expect(v).toContain("faltaParaVerificar(p.sin_bulto, p.articulos ?? 0)");
    expect(v).toContain("disabled={!!falta}");
    // Visible, no solo en el `title`: un `title` no se ve en el celular.
    expect(v).toContain('{falta && <span className="mt-0.5 block text-xs text-gray-400">{falta}</span>}');
  });

  it("🔴 FALLA ABIERTA: sin dato (`null`) la pantalla no apaga nada", () => {
    expect(vista()).toContain("p.sin_bulto == null ? null :");
    // Y en el servidor, sin la tabla del detalle no se bloquea.
    expect(leer("lib/guias/pedido-detalle-server.ts")).toContain("if (d.sinTabla) return null;");
  });
});

describe("🔴 4 · el detalle se congela al verificar", () => {
  it("el PATCH del detalle mira el estado y contesta 409", () => {
    const r = rutaDetalle();
    expect(r).toContain("estadoDelPedido");
    expect(r).toMatch(/await estadoDelPedido\(empresa, id\)\) === "verificado"/);
    expect(r).toContain('error: "El pedido está verificado: los bultos no se cambian"');
  });

  it("y la pantalla no dibuja las casillas de un pedido verificado", () => {
    const v = vista();
    expect(v).toContain("puedePoner={puedeMarcar && !verificado}");
    expect(v).toContain("verificado={verificado}");
    expect(detalle()).toContain("verificado = false");
  });

  it("sin fila de estado es «pendiente», y falla ABIERTA", () => {
    const s = leer("lib/guias/pedido-detalle-server.ts");
    expect(s).toContain('?.estado ?? "pendiente"');
  });
});

describe("🔴 5 · el vendedor solo mira", () => {
  it("la lista de quién marca es la MISMA del servidor", () => {
    expect(puedeMarcarPedidos("vendedor")).toBe(false);
    for (const r of ROLES_PREPARADO) expect(puedeMarcarPedidos(r)).toBe(true);
    expect(puedeMarcarPedidos("contabilidad")).toBe(false);
    expect(puedeMarcarPedidos(null)).toBe(false);
    // Derivada, no escrita a mano: no puede haber dos respuestas.
    expect(leer("lib/guias/pedidos-bodega.ts")).toContain(
      "const lista = PEDIDOS_BULTOS_2026_10 ? ROLES_PREPARADO : PEDIDOS_BODEGA_ROLES;",
    );
  });

  it("y sigue VIENDO la pestaña: solo mira, no se le esconde", () => {
    const b = leer("lib/guias/pedidos-bodega.ts");
    expect(b).toMatch(/PEDIDOS_VER_ROLES[\s\S]{0,120}ROLES_DE_GUIAS/);
  });
});

describe("🔴 6 · dos pasos para asignar un bulto", () => {
  it("camino A · la casilla de la fila asigna sola, en las DOS pantallas", () => {
    const d = detalle();
    expect(d).toContain("guardarUna");
    expect(d).toContain("onBlur");
    // 🩸 Ya no es `hidden … sm:block` con un chip en el celular.
    expect(d).not.toContain("sm:block");
    expect(d).not.toContain('<span className="sm:hidden">{chip}</span>');
    expect(d).toMatch(/className="h-11 w-14 rounded-md border border-gray-300[^"]*sm:h-9 sm:w-16/);
  });

  it("camino B · el número se escribe EN LA BARRA, sin paso intermedio", () => {
    const d = detalle();
    // 🩸 Se fue el botón que solo servía para que apareciera el campo.
    expect(d).not.toContain("pidiendoBulto");
    expect(d).not.toContain("setPidiendoBulto");
    // La barra es «Bulto [ 3 ] · Asignar bulto», de una sola vez.
    expect(d).toContain("<span>Bulto</span>");
    expect(d).toContain("onKeyDown={(e) => e.key === \"Enter\" && confirmarBulto()}");
    expect(d).toContain("onClick={confirmarBulto}");
    // Y las casillas de marcar varias filas siguen existiendo.
    expect(d).toContain("marcarTodas");
    // 🔴 El nombre se queda: es el del ERP (Daniel, 7-oct-2026).
    expect(d).toContain("Asignar bulto");
  });

  it("la lista termina con COLCHÓN: la barra no tapa la última fila", () => {
    const d = detalle();
    // El colchón de la casa, no un número escrito a mano.
    expect(d).toContain("ALTO_COLCHON_DE_ABAJO");
    expect(d).toContain('data-colchon-pedido');
    expect(d).toContain("calc(var(--fg-alto-barra-fija, 0px) + 1rem)");
  });

  it("⚠️ «Referencia» no se dibuja: ni encabezado, ni celda, ni celda vacía", () => {
    // Switch no la manda por ningún campo (medido): la columna no existe. El
    // archivo solo la NOMBRA para decir que no está.
    const d = detalle();
    expect(d).not.toMatch(/>\s*Referencia\s*</);
    expect(d).not.toMatch(/referencia va vacía|repetir el código/);
    // Y la lista de columnas tampoco (el candado del 6-oct ya lo exige).
    expect(leer("lib/guias/pedidos-bultos.ts")).not.toMatch(/"Referencia"/);
  });
});
