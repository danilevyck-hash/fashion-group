/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — LA PANTALLA DE PACKING LISTS NO PUEDE MENTIR SOBRE LA RETENCIÓN
 *
 * 5-sep-2026. Bajo «Historial» decía: «Los PLs se eliminan automáticamente
 * después de 7 días.» Las dos mitades eran falsas:
 *
 *   · un PL ACTIVO no se borra NUNCA (el cron solo mira los que tienen
 *     `deleted_at`, o sea los que alguien borró a mano), y
 *   · no son 7 días sino **90**, contados desde ese borrado.
 *
 * El número estaba escrito dos veces —`RETENCION_DIAS` en el cron y la frase
 * tecleada aparte en el JSX— y se separaron sin que nada protestara.
 *
 * Este candado ata las dos copias:
 *   1. la definición ÚNICA vale 90,
 *   2. el cron la usa (no se re-teclea un número),
 *   3. la pantalla usa el generador (no re-teclea la frase),
 *   4. la frase dice las DOS cosas: los 90 días Y que el activo no se borra,
 *   5. la mentira vieja («7 días») no vuelve a la pantalla.
 *
 * Nota: el 4 es el que importa de verdad. Un texto que solo dijera «se
 * eliminan a los 90 días» sería exacto en el número y seguiría asustando —
 * que es lo que hacía el texto viejo.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  RETENCION_PACKING_LISTS_DIAS,
  textoRetencionPackingLists,
} from "@/lib/packing-lists/retencion";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf-8");

const PANTALLA = "src/app/packing-lists/PackingListsClient.tsx";
const CRON_LIB = "src/lib/cleanup-packing-lists.ts";

describe("🔴 la retención de packing lists se dice UNA vez", () => {
  it("la definición única son 90 días", () => {
    expect(RETENCION_PACKING_LISTS_DIAS).toBe(90);
  });

  it("el cron usa la definición compartida, no un número suyo", () => {
    const src = leer(CRON_LIB);
    expect(src).toMatch(/from\s+"@\/lib\/packing-lists\/retencion"/);
    expect(src).toMatch(/RETENCION_DIAS\s*=\s*RETENCION_PACKING_LISTS_DIAS/);
    // Ningún `const … = 90` suelto: ahí empezó la divergencia.
    expect(src).not.toMatch(/RETENCION_DIAS\s*=\s*\d+/);
  });

  it("la pantalla usa el generador, no una frase tecleada", () => {
    const src = leer(PANTALLA);
    expect(src).toMatch(/from\s+"@\/lib\/packing-lists\/retencion"/);
    expect(src).toMatch(/\{textoRetencionPackingLists\(\)\}/);
  });

  it("la mentira vieja («7 días») no está en la pantalla", () => {
    const src = leer(PANTALLA);
    expect(src).not.toMatch(/después de 7 días/i);
    expect(src).not.toMatch(/se eliminan automáticamente después de \d+ días/i);
  });

  it("el texto dice las DOS cosas: que el activo no se borra y los 90 días", () => {
    const t = textoRetencionPackingLists();
    expect(t).toMatch(/activo no se borra nunca/i);
    expect(t).toMatch(new RegExp(`${RETENCION_PACKING_LISTS_DIAS} días`));
  });

  it("el número del texto sale de la constante, no está tecleado adentro", () => {
    // Si alguien vuelve a escribir el número a mano en la frase, cambiar la
    // constante dejaría de cambiar la pantalla — el bug de origen.
    expect(textoRetencionPackingLists(7)).toContain("7 días");
    expect(textoRetencionPackingLists(7)).not.toContain("90 días");
  });

  it("CONTROL: el texto sigue siendo una frase para el dueño, no jerga", () => {
    const t = textoRetencionPackingLists();
    expect(t).not.toMatch(/deleted_at|soft.?delete|cron|purga|CASCADE/i);
  });
});
