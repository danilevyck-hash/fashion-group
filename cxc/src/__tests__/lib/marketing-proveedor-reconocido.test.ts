// 🔒 CANDADO — el proveedor que lee la factura sale con el nombre del que YA
// existe (Daniel, 8-oct-2026). Histórico = los nombres reales de producción.
import { describe, it, expect } from "vitest";
import { reconocerProveedor, ROTULO_PROVEEDOR_NUEVO } from "@/lib/marketing/proveedores-2026-10";

const veces = (n: string, k: number) => Array.from({ length: k }, () => n);
const HISTORICO = [
  ...veces("Impresora Comercial S a", 47),
  ...veces("Krysthel Yanneth Morales Martinez", 17),
  ...veces("Impreco", 6),
  ...veces("Confecciones Boston S.a", 3),
  ...veces("Iluminaciones Tecnicas, S.a", 2),
  ...veces("Grupo City Mall S.a.", 2),
  ...veces("A.g. Display / Venetto", 2),
  "Grupo Monat, S.a.",
  "Premium Paint Panama",
  "Cerantola Global Corp.",
  "A.g. Display",
  "Premium Paint Panama S a",
];
const nombre = (leido: string) => reconocerProveedor(leido, HISTORICO).nombre;
const esNuevo = (leido: string) => !reconocerProveedor(leido, HISTORICO).existente;

describe("reconocerProveedor", () => {
  it("Krysthel: todas sus variantes son UN proveedor", () => {
    for (const v of [
      "krysthel", "Kristel", "KRYSTEL", "Changalo", "Kristhel",
      "KRYSTHEL YANNETH MORALES MARTINEZ", "Krysthel Y. Morales M.",
      "Krysthel Morales", "Kristel Yaneth Morales Martínez",
    ]) {
      expect(nombre(v), v).toBe("Krysthel Yanneth Morales Martinez");
    }
  });

  it("Impresora Comercial / Impreco", () => {
    for (const v of ["Impreco", "IMPRECO, S.A.", "IMPRESORA COMERCIAL, S.A.", "Impresora Comercial S.A. (Impreco)"]) {
      expect(nombre(v), v).toBe("Impresora Comercial S a");
    }
  });

  it("Premium Paint", () => {
    for (const v of ["PREMIUM PAINT PANAMÁ, S.A.", "Premium Paint Panama S. A.", "Premium Paint"]) {
      expect(nombre(v), v).toBe("Premium Paint Panama");
    }
  });

  it("A.g. Display", () => {
    for (const v of ["A.G. DISPLAY, S.A.", "AG Display", "A.g. Display / Venetto"]) {
      expect(nombre(v), v).toBe("A.g. Display / Venetto");
    }
  });

  it("nuevo de verdad: queda lo leído y se marca", () => {
    const r = reconocerProveedor("Ferretería Novey, S.A.", HISTORICO);
    expect(r).toMatchObject({ nombre: "Ferretería Novey, S.A.", existente: false });
    expect(ROTULO_PROVEEDOR_NUEVO).toBe("Proveedor nuevo");
  });

  it("sin adivinar: una palabra suelta o un parecido ambiguo es nuevo", () => {
    expect(esNuevo("Grupo")).toBe(true);
    expect(esNuevo("Grupo S.A.")).toBe(true);
    expect(esNuevo("Display")).toBe(true);
    expect(esNuevo("Comercial")).toBe(true);
    expect(nombre("Grupo Monat")).toBe("Grupo Monat, S.a.");
    expect(nombre("Grupo City Mall")).toBe("Grupo City Mall S.a.");
  });

  it("vacío no es nuevo ni existente con nombre", () => {
    expect(reconocerProveedor("  ", HISTORICO)).toMatchObject({ nombre: "", existente: false });
  });
});
