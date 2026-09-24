// ─────────────────────────────────────────────────────────────────────────────
// MULTIFASHION · VENDEDORAS — LA LÍNEA DEL DESGLOSE DICE EL NOMBRE (24-sep-2026)
//
// 🩸 QUÉ VINO A ARREGLAR. Bajo «Sheynee Batista» la línea gris decía
// «tienda $11,674.57 · redes $375.30». «tienda» no es nadie, y «redes» en
// minúscula parecía una nota al pie. Daniel, textual: *«que diga el nombre de
// la vendedora en vez de tienda, y Redes con mayúscula»*.
//
// Ahora dice, con los MISMOS números:
//   computadora → «Sheynee $11,674.57 · Redes $375.30»
//   celular     → «Sheynee $11,675 · Redes $375 · 275 tiquetes»
//
// «Sheynee» es el PRIMER nombre: el completo ya está en negrita arriba, en la
// misma fila, y repetirlo entero sería ruido.
//
// ── LOS DATOS SON REALES ─────────────────────────────────────────────────────
// Sheynee Batista, septiembre 2026, medido el 24-sep contra producción
// (`multifashion_vendedoras_v5`): ventas $12,049.87 · `por_canal` =
// `{ redes: 375.30 }` · 275 tiquetes (265 de tienda + 10 de redes, las 10
// primeras ventas del código «REDES Sheynee», del 22 al 24 de septiembre).
//
// 🔴 LA PLATA NO SE MOVIÓ. Esto es un RÓTULO. Las partes siguen sumando la
// fila al centavo ($11,674.57 + $375.30 = $12,049.87), la tienda se sigue
// DERIVANDO (total − canales) y la comisión y el bono ni pasan por acá.
//
// ── MUTACIONES QUE CAZA ──────────────────────────────────────────────────────
//   1. Dejar el rótulo en «tienda» aunque llegue el nombre.
//   2. Escribir el nombre COMPLETO en vez del primero.
//   3. Escribirlo gritado («SHEYNEE»), como llega de Switch.
//   4. Volver «redes» a minúscula.
//   5. Dejar un hueco («$11,674.57 · Redes…») cuando el nombre falta, en vez
//      de caer a «tienda».
//   6. Dibujarle la línea a una vendedora SIN canal.
//   7. Mover un centavo: que las partes dejen de sumar la fila.
//   8. Romper el recorte de centavos del celular con el nombre adelante.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { desgloseCanales, primerNombre, CANALES, ROTULO_TIENDA } from "@/lib/multifashion/canales";
import { lineaVendedora } from "@/lib/multifashion/celular";

// Sheynee Batista, septiembre 2026 — medido contra producción el 24-sep-2026.
const SHEYNEE = {
  nombre: "SHEYNEE BATISTA", // así llega de Switch: gritado
  ventas: 12049.87,
  por_canal: { redes: 375.3 },
  tickets: 275,
  ticket_promedio: 43.82,
} as const;

// Una vendedora sin canal: la fila normal, la de todas las demás.
const JAILINE = {
  nombre: "JAILINE",
  ventas: 5651.06,
  por_canal: null,
  tickets: 165,
  ticket_promedio: 34.25,
} as const;

const desgloseDe = (v: { ventas: number; por_canal: unknown; nombre: string }) =>
  desgloseCanales(v.ventas, v.por_canal as never, v.nombre);

describe("1 · la línea de la computadora", () => {
  it("🔴 dice el PRIMER nombre y «Redes» con mayúscula", () => {
    expect(desgloseDe(SHEYNEE)).toBe("Sheynee $11,674.57 · Redes $375.30");
  });

  it("el rótulo del canal es «Redes», no «redes»", () => {
    expect(CANALES.redes).toBe("Redes");
    expect(desgloseDe(SHEYNEE)).toContain("· Redes ");
    expect(desgloseDe(SHEYNEE)).not.toContain("redes");
  });

  it("🔴 no dice «tienda» cuando sabe de quién es la fila", () => {
    expect(desgloseDe(SHEYNEE)).not.toContain(ROTULO_TIENDA);
  });

  it("no repite el nombre completo: «Sheynee», no «Sheynee Batista»", () => {
    expect(primerNombre("Sheynee Batista")).toBe("Sheynee");
    expect(desgloseDe(SHEYNEE)).not.toContain("Batista");
  });

  it("a la vendedora SIN canal no se le dibuja nada", () => {
    expect(desgloseDe(JAILINE)).toBeNull();
  });
});

describe("2 · la línea del celular", () => {
  it("🔴 «Sheynee $11,675 · Redes $375 · 275 tiquetes»", () => {
    expect(
      lineaVendedora({
        desglose: desgloseDe(SHEYNEE),
        tiquetes: SHEYNEE.tickets,
        ticketPromedio: SHEYNEE.ticket_promedio,
        gerente: false,
      }),
    ).toBe("Sheynee $11,675 · Redes $375 · 275 tiquetes");
  });

  it("la de siempre, sin canal, no cambió", () => {
    expect(
      lineaVendedora({
        desglose: desgloseDe(JAILINE),
        tiquetes: JAILINE.tickets,
        ticketPromedio: JAILINE.ticket_promedio,
        gerente: false,
      }),
    ).toBe("165 tiquetes · $34.25 promedio");
  });
});

describe("3 · sin nombre, falla ABIERTA: vuelve «tienda»", () => {
  it("nombre vacío, nulo o ausente → el rótulo de siempre, nunca un hueco", () => {
    for (const nombre of [null, undefined, "", "   "]) {
      expect(desgloseCanales(SHEYNEE.ventas, SHEYNEE.por_canal, nombre))
        .toBe("tienda $11,674.57 · Redes $375.30");
    }
    expect(desgloseCanales(SHEYNEE.ventas, SHEYNEE.por_canal))
      .toBe("tienda $11,674.57 · Redes $375.30");
  });
});

describe("4 · 🔴 la plata no se movió", () => {
  it("las partes suman la fila al centavo", () => {
    const texto = desgloseDe(SHEYNEE)!;
    const montos = [...texto.matchAll(/\$([\d,]+\.\d\d)/g)]
      .map((m) => Number(m[1].replace(/,/g, "")));
    expect(montos).toEqual([11674.57, 375.3]);
    expect(Math.round(montos.reduce((a, b) => a + b, 0) * 100) / 100).toBe(SHEYNEE.ventas);
  });

  it("la tienda se DERIVA: es el total menos el canal, no un número aparte", () => {
    expect(desgloseCanales(1000, { redes: 250 }, "Sheynee Batista"))
      .toBe("Sheynee $750.00 · Redes $250.00");
    expect(desgloseCanales(1000, { redes: 1000 }, "Sheynee Batista"))
      .toBe("Sheynee $0.00 · Redes $1,000.00");
  });

  it("el celular recorta los CENTAVOS, no la plata: los mismos números, cortos", () => {
    expect(
      lineaVendedora({ desglose: "Sheynee $11,674.57 · Redes $375.30", tiquetes: 275, ticketPromedio: 43.82, gerente: false }),
    ).toBe("Sheynee $11,675 · Redes $375 · 275 tiquetes");
  });
});
