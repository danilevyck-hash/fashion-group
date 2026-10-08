// ============================================================================
// Marketing — CONTABILIDAD ENTRA SOLO A MIRAR, y la pantalla no le muestra
// lo que el servidor le va a rechazar (24-sep-2026).
//
// Daniel: «Esconder los botones a contabilidad ahora: es media hora y evita
// una confusión». Hasta hoy Impulsadoras dibujaba «+ Nueva impulsadora»,
// «Registrar pago» y «Eliminar» para todos los roles; el 403 llegaba después
// del toque. Las pantallas reciben `escribe` (derivado de
// `puedeEscribirMarketing`, la MISMA lista de roles de siempre). La vista vieja
// de Impulsadoras se borró el 8-oct-2026; quedan la lista de roles y Mobiliario.
// ============================================================================

import { describe, it, expect } from "vitest";
import { puedeEscribirMarketing, ROLES_MARKETING, ROLES_MARKETING_ESCRITURA } from "@/lib/marketing/roles";

describe("Marketing › Impulsadoras: contabilidad solo mira", () => {
  it("la lista de roles que escribe es la de siempre, y contabilidad no está", () => {
    expect(ROLES_MARKETING_ESCRITURA).toEqual(["admin", "secretaria"]);
    expect(ROLES_MARKETING).toContain("contabilidad");
    expect(puedeEscribirMarketing("contabilidad")).toBe(false);
    expect(puedeEscribirMarketing("secretaria")).toBe(true);
  });

  it("Mobiliario le pasa el rol, no un true escrito a mano", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const mobiliario = fs.readFileSync("src/app/marketing/mobiliario/page.tsx", "utf8");
    expect(mobiliario).toMatch(/const escribe = puedeEscribirMarketing\(role\)/);
    // Las tres puertas de escritura de Mobiliario cuelgan de `escribe`.
    expect(mobiliario.match(/\{escribe && \(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
