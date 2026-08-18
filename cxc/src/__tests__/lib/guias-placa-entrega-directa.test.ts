// ─────────────────────────────────────────────────────────────────────────────
// La PLACA solo es obligatoria en TRANSPORTISTA EXTERNO, no en entrega directa.
//
// 🩸 POR QUÉ. Medido el 3-ago-2026 sobre las 172 guías vivas de producción:
//
//     transportista      107 despachadas / 18 pendientes   (85% se cierran)
//     entrega directa      10 despachadas / 37 pendientes   (78% NUNCA se cierran)
//
// Cuatro de cada cinco entregas directas quedaban en "Pendiente Bodega" para
// siempre. La mercancía SÍ salía —Daniel lo confirmó con la captura de su
// lista— pero la guía nunca se cerraba, y como el aviso de Telegram sale
// únicamente al pasar a "Completada", él dejó de enterarse de los despachos.
// La causa estaba escrita como comentario en el propio código: *"La placa es
// obligatoria SIEMPRE, sin importar el tipo de despacho"*. Pedirle placa de
// vehículo a una entrega que hace la gente de la casa no aporta nada.
//
// Daniel, textual: *"entrega directa no es necesario placa"*.
//
// ⚠️ LO QUE NO CAMBIÓ, y el test lo fija: en transportista externo la placa
// SIGUE siendo obligatoria (ahí sí importa en qué vehículo de un tercero se fue
// la mercancía), y el resto de requisitos —receptor, cédula, chofer, firmas,
// bultos— no se tocaron en NINGUNO de los dos modos.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { faltaParaDespachar } from "@/lib/guias/falta-para-despachar";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (s: string) =>
  s
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
    .join("\n");

const api = sinComentarios(leer("src/app/api/guias/[id]/route.ts"));
const form = sinComentarios(leer("src/app/guias/components/DespachoForm.tsx"));

// ⚠️ Desde el rediseño de ago-2026 el formulario ya no decide con `if`s propios:
// el botón se APAGA y debajo dice qué falta, y esa lista la arma el módulo puro
// `falta-para-despachar`. Lo que se congela acá sigue siendo lo mismo —quién
// exige placa y quién no— pero se prueba sobre la función, que es donde vive.
const base = {
  placa: "", receptor: "Juan", cedula: "8-888-8888", chofer: "Pedro",
  tieneFirma1: true, tieneFirma2: true,
} as const;

describe("🔴 la placa ya no traba la entrega directa", () => {
  it("el servidor (PUT) condiciona la placa al tipo de despacho", () => {
    expect(api).toContain('tipo_despacho !== "directo" && !placa');
  });

  it("el despacho rápido (PATCH) usa el MISMO criterio", () => {
    // Mira el tipo que venga en el body o el ya guardado — si mirara solo uno,
    // el atajo de la lista seguiría pidiendo placa.
    expect(api).toContain("const tipoEfectivo = body.tipo_despacho ?? current?.tipo_despacho");
    expect(api).toContain('tipoEfectivo !== "directo"');
  });

  it("el PATCH lee tipo_despacho de la base (si no, no podría decidir)", () => {
    expect(api).toContain('select("estado, placa, tipo_despacho")');
  });

  it("en entrega directa, sin placa NO falta nada — se puede despachar", () => {
    expect(faltaParaDespachar({ ...base, tipoDespacho: "directo" })).toEqual([]);
  });

  it("ya NO existe la validación incondicional de placa", () => {
    // La forma vieja era `if (!bPlaca.trim()) return showToast(...)` suelta.
    expect(form).not.toMatch(/^\s*if \(!bPlaca\.trim\(\)\) return showToast/m);
    // Y la nueva tampoco puede mirar la placa sin mirar el tipo.
    const modulo = sinComentarios(leer("src/lib/guias/falta-para-despachar.ts"));
    const i = modulo.indexOf('if (vacio(e.placa))');
    expect(i).toBeGreaterThan(0);
    expect(modulo.slice(0, i)).toContain('const externo = e.tipoDespacho === "externo"');
    expect(modulo.slice(0, i)).toContain("if (externo) {");
  });
});

describe("⚠️ en transportista externo NADA se aflojó", () => {
  it("la placa sigue siendo obligatoria del lado del servidor", () => {
    expect(api).toContain('{ error: "Placa del vehículo requerida" }');
  });

  it("y del lado de la pantalla: sin placa el botón queda apagado y lo dice", () => {
    expect(faltaParaDespachar({ ...base, tipoDespacho: "externo" })).toContain("placa");
  });

  // ⚠️ El N° de guía del transportista SÍ se aflojó, y a propósito (17-ago-2026):
  // Daniel, textual, *"a veces el transportista lo da, a veces no"*. Ese candado
  // se mudó a `guias-numero-transp-no-bloquea.test.ts`, que exige lo contrario —
  // que el servidor NO lo pida— y que lo que falte quede MARCADO.
});

describe("⚠️ el resto de requisitos de despacho no se tocó", () => {
  it.each([
    ["receptor", '{ error: "Nombre del receptor requerido" }'],
    ["cédula", '{ error: "Cédula del receptor requerida" }'],
    ["items", "No se puede despachar una guía sin items"],
    ["bultos", "No se puede despachar una guía con 0 bultos"],
    ["chofer en directo", 'tipo_despacho === "directo" && !nombre_chofer'],
  ])("sigue exigiendo %s", (_, fragmento) => {
    expect(api).toContain(fragmento);
  });

  it("la pantalla sigue pidiendo las DOS firmas, en los dos modos", () => {
    expect(faltaParaDespachar({ ...base, placa: "AB-1234", tipoDespacho: "externo", tieneFirma1: false }))
      .toEqual(["la firma del transportista"]);
    expect(faltaParaDespachar({ ...base, placa: "AB-1234", tipoDespacho: "externo", tieneFirma2: false }))
      .toEqual(["la firma del entregador"]);
    expect(faltaParaDespachar({ ...base, tipoDespacho: "directo", tieneFirma1: false }))
      .toEqual(["la firma del chofer"]);
    expect(faltaParaDespachar({ ...base, tipoDespacho: "directo", tieneFirma2: false }))
      .toEqual(["la firma del cliente"]);
    // Y el botón mira ESA lista, no el canvas: un ref no re-renderiza.
    expect(form).toContain("faltaParaDespachar(");
    expect(form).toContain("const puedeDespachar = faltantes.length === 0");
    expect(form).toContain("disabled={!puedeDespachar || bSaving}");
  });
});
