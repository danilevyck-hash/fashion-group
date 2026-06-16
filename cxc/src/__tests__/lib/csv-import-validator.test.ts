import { describe, it, expect } from "vitest";
import { validateCsvImport } from "@/lib/csv-import-validator";

// Helper: build a one-row CSV with the given gender and run the validator.
function genderWarnings(gender: string): string[] {
  const csv = `SKU,Nombre,Precio,Cantidad,Genero,Estado\nABC,Producto,10,5,${gender},`;
  const result = validateCsvImport(csv, new Set());
  return result.warnings.filter(w => w.includes("genero"));
}

describe("validateCsvImport — genero reconocido por raiz", () => {
  // The original bug: Active Shoes ships "MEN" and got "no reconocido" even though
  // the catalog displays it correctly as Hombre. These must NOT warn anymore.
  it.each([
    "MEN", "men", "Men",
    "male", "MALE",
    "hombre", "HOMBRE",
    "women", "WOMEN",
    "female",
    "mujer", "dama",
    "kids", "nino", "junior",
    "unisex", "UNISEX",
  ])("acepta '%s' sin warning", (gender) => {
    expect(genderWarnings(gender)).toHaveLength(0);
  });

  // Joybees values that reebok-gender maps to "otros" but are valid in that catalog.
  it.each(["adults", "adults_m"])("conserva valor Joybees '%s' sin warning", (gender) => {
    expect(genderWarnings(gender)).toHaveLength(0);
  });

  // Genuine garbage still warns.
  it.each(["xyz", "qwerty", "123"])("advierte sobre basura real '%s'", (gender) => {
    expect(genderWarnings(gender)).toHaveLength(1);
  });

  it("no advierte cuando el genero esta vacio", () => {
    expect(genderWarnings("")).toHaveLength(0);
  });
});
