// ============================================================================
// Marketing — CONTABILIDAD ENTRA SOLO A MIRAR, y la pantalla no le muestra
// lo que el servidor le va a rechazar (24-sep-2026).
//
// Daniel: «Esconder los botones a contabilidad ahora: es media hora y evita
// una confusión». Hasta hoy Impulsadoras dibujaba «+ Nueva impulsadora»,
// «Registrar pago» y «Eliminar» para todos los roles; el 403 llegaba después
// del toque. Ahora `ImpulsadorasView` recibe `escribe` (derivado de
// `puedeEscribirMarketing`, la MISMA lista de roles de siempre) y sin él no
// dibuja ninguna puerta de escritura. «Ver historial» es lectura y se queda.
//
// Mutaciones cazadas al escribirlo: (1) quitar `escribe &&` de «+ Nueva» ·
// (2) quitar el `escribe &&` de «Registrar pago» · (3) quitar el de
// «Eliminar» · (4) `escribe = true` fijo en la portada.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import ImpulsadorasView from "@/app/marketing/components/ImpulsadorasView";
import { puedeEscribirMarketing, ROLES_MARKETING, ROLES_MARKETING_ESCRITURA } from "@/lib/marketing/roles";

const IMPULSADORA = {
  id: "imp-1",
  nombre: "Yeisibeth",
  activa: true,
  monto_mensual: 650,
  marcas: [{ marca: { id: "m1", nombre: "Tommy Hilfiger" }, porcentaje: 100 }],
  mesAnterior: { mes: "2026-08", estado: "pendiente", faltan: "$650.00" },
  mesActual: { mes: "2026-09", estado: "pendiente", faltan: "$650.00" },
  mesesSinPagar: [{ mes: "2026-08", estado: "pendiente", faltan: "$650.00" }],
  ultimosPeriodos: ["1–15 jul 2026"],
  pagosRegistrados: 3,
};

function montar(escribe: boolean) {
  return render(
    <ToastProvider>
      <ImpulsadorasView marcas={[]} escribe={escribe} />
    </ToastProvider>,
  );
}

describe("Marketing › Impulsadoras: contabilidad solo mira", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => [IMPULSADORA] })),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("la lista de roles que escribe es la de siempre, y contabilidad no está", () => {
    expect(ROLES_MARKETING_ESCRITURA).toEqual(["admin", "secretaria"]);
    expect(ROLES_MARKETING).toContain("contabilidad");
    expect(puedeEscribirMarketing("contabilidad")).toBe(false);
    expect(puedeEscribirMarketing("secretaria")).toBe(true);
  });

  it("con escribe=false: sin «+ Nueva impulsadora», «Registrar pago» ni «Eliminar»; «Ver historial» sigue", async () => {
    montar(false);
    await waitFor(() => expect(screen.getByText("Yeisibeth")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Nueva impulsadora/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Registrar pago/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Eliminar/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Ver historial/ })).toBeTruthy();
  });

  it("con escribe=true: los tres botones están, como siempre", async () => {
    montar(true);
    await waitFor(() => expect(screen.getByText("Yeisibeth")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Nueva impulsadora/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Registrar pago/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Eliminar/ })).toBeTruthy();
  });

  it("la portada de Tiendas y Marcas y Mobiliario le pasan el rol, no un true escrito a mano", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const portada = fs.readFileSync("src/app/marketing/components/PortadaTiendasYMarcas.tsx", "utf8");
    const pagina = fs.readFileSync("src/app/marketing/page.tsx", "utf8");
    const mobiliario = fs.readFileSync("src/app/marketing/mobiliario/page.tsx", "utf8");
    expect(portada).toMatch(/<ImpulsadorasView[^>]*escribe=\{escribe\}/);
    expect(pagina).toMatch(/<ImpulsadorasView[^>]*escribe=\{puedeEscribirMarketing\(role\)\}/);
    expect(mobiliario).toMatch(/const escribe = puedeEscribirMarketing\(role\)/);
    // Las tres puertas de escritura de Mobiliario cuelgan de `escribe`.
    expect(mobiliario.match(/\{escribe && \(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
