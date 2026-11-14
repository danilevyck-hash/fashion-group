// Revisión 110 (14-nov-2026) — las reglas chicas de los puntos 82, 90, 91 y 102.
// Solo forma: ningún monto ni dato guardado cambia.
import { describe, it, expect } from "vitest";
import { lineaDelMonto } from "@/app/marketing/components/nuevo/ImpulsadorasNuevo";
import { columnaEstadoSobra } from "@/app/marketing/components/nuevo/GastosNuevo";
import { empresasDelSaldo } from "@/lib/search/empresas-cxc";
import { opcionesDeEmpresa } from "@/lib/usuarios/opciones-empresa";

describe("n.º 90 · la línea de la impulsadora", () => {
  it("el 100 % no se repite en la tarjeta (ya se dice arriba)", () => {
    expect(lineaDelMonto("Tommy Hilfiger", "$800.00", 100)).toBe(" · $800.00 al mes");
  });
  it("un porcentaje distinto SÍ se dice: no se esconde un dato que cambia el cobro", () => {
    expect(lineaDelMonto("Calvin Klein", "$800.00", 50)).toBe(" · $800.00 al mes · se cobra 50 %");
  });
  it("sin marca no empieza con «·»", () => {
    expect(lineaDelMonto("", "$800.00", null)).toBe("$800.00 al mes");
  });
});

describe("n.º 91 · la columna «Estado» de Marketing › Gastos", () => {
  it("sobra con «Por cobrar»; vuelve con «Todos»", () => {
    expect(columnaEstadoSobra("por_cobrar")).toBe(true);
    expect(columnaEstadoSobra("")).toBe(false);
  });
  it("🔴 con «No recuperable» se queda: ahí lleva la observación", () => {
    expect(columnaEstadoSobra("no_recuperable")).toBe(false);
  });
});

describe("n.º 82 · búsqueda global › Cuentas por cobrar", () => {
  it("varias empresas: cuántas, nunca las claves internas", () => {
    expect(empresasDelSaldo("vistana, fashion_wear, fashion_shoes, active_shoes, active_wear, joystep")).toBe("6 empresas");
  });
  it("una sola: su nombre", () => {
    expect(empresasDelSaldo("fashion_wear")).toBe("Fashion Wear");
  });
  it("una clave repetida no cuenta dos veces", () => {
    expect(empresasDelSaldo("vistana, vistana")).toBe("Vistana International");
  });
});

describe("n.º 102 · Usuarios › empresa por su nombre", () => {
  it("en blanco + las ocho, con el valor de siempre (la clave)", () => {
    const o = opcionesDeEmpresa("");
    expect(o[0]).toEqual(["", "Selecciona una empresa"]);
    expect(o).toHaveLength(9);
    expect(o).toContainEqual(["vistana", "Vistana International"]);
    expect(o).toContainEqual(["american_classic", "Multifashion"]);
  });
  it("🔴 una clave guardada que no está en la lista se CONSERVA (guardar no la borra)", () => {
    expect(opcionesDeEmpresa("algo_viejo")).toContainEqual(["algo_viejo", "algo_viejo"]);
  });
});
