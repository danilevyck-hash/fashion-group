/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO DEL AVISO DE SALIDA CON DEUDA.
 *
 * ⚠️ Hasta el 11-sep-2026 también amarraba «el cron que caduca lo pendiente»
 * (`prestamos-caducan`). Se retiró con la aprobación de préstamos (Daniel:
 * *«Aprobar préstamos: eso también se quita»*); ver la sección de abajo.
 *
 * 🔴 Daniel, 5-sep-2026: al marcar la fecha de salida de alguien con deuda hay
 * que avisar **ahí mismo**: «Debe $100 — descuéntalo de la liquidación». Es el
 * momento en que se decide la liquidación, y el único en que ese dato sirve:
 * después la persona ya cobró y la plata se fue. **Sin Telegram** — Daniel
 * eligió que el aviso vaya donde se toma la decisión.
 *
 * Hoy hay un caso vivo: BRICEIDA MONTERO, $100 desde marzo.
 *
 * Son assertions sobre el fuente porque lo que se protege es que el aviso ESTÉ
 * y esté DONDE se decide — no una medición de layout.
 * ─────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const configTab = leer("src", "app", "asistencia", "ConfiguracionTab.tsx");
const configRoute = leer("src", "app", "api", "asistencia", "configuracion", "route.ts");
const listaServer = leer("src", "lib", "prestamos-lista-server.ts");
const vercel = JSON.parse(leer("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };

describe("🔴 quien se va debiendo, se dice al dar de baja", () => {
  it("el dato viaja desde Préstamos hasta la ficha de Asistencia", () => {
    // Con el paréntesis: renombrar la función a `leerDeudaPorCodigoRenombrada`
    // deja pasar un `toContain` del nombre pelado.
    expect(listaServer).toContain("export async function leerDeudaPorCodigo(");
    expect(configRoute).toContain("leerDeudaPorCodigo()");
    expect(configRoute).toContain("deudaPrestamo: deudaDe.get(codigo) ?? 0");
  });

  it("🔴 el aviso está PEGADO al formulario de dar de baja, no en otra pantalla", () => {
    const i = configTab.indexOf("¿Se fue de la empresa?");
    expect(i).toBeGreaterThan(-1);
    const bloque = configTab.slice(i, i + 2500);
    expect(bloque).toContain("descuéntalo de la liquidación");
    // 🔑 La condición ENTERA, no que la palabra esté: un `{false && …}` delante
    // apaga el aviso sin borrar una sola letra del texto.
    expect(bloque).toContain("{(persona.deudaPrestamo ?? 0) > 0 && (");
  });

  it("🔑 y viaja también en el aviso de «guardado»: la ficha se cierra al guardar", () => {
    const i = configTab.indexOf("no sale en las quincenas posteriores");
    expect(i).toBeGreaterThan(-1);
    expect(configTab.slice(i - 400, i + 500)).toContain("descuéntalo de la liquidación");
  });

  it("⚠️ SIN TELEGRAM: el aviso va donde se toma la decisión (Daniel eligió (a))", () => {
    expect(configTab).not.toContain("enviarNegocio");
    expect(configTab).not.toContain("sendTelegram");
    expect(configRoute).not.toContain("enviarNegocio");
  });

  it("🔴 y si Préstamos no contesta, la planilla NO se cae: el aviso falta, nada más", () => {
    // Cambiar esto por un `throw` convertiría «no sé cuánto debe» en «no hay
    // pantalla de Asistencia» — un aviso que falta por una planilla que no sale.
    const i = listaServer.indexOf("export async function leerDeudaPorCodigo");
    const cuerpo = listaServer.slice(i, i + 2000);
    expect(cuerpo).toMatch(/catch\s*\(/);
    expect(cuerpo).toMatch(/return deuda;/);
  });
});

// ⚠️ CAMBIÓ DE DIRECCIÓN EL 11-SEP-2026, NO SE BORRÓ. Acá vivía «🔴 lo pendiente
// caduca solo a los 7 días»: una entrada de cron, la regla en el módulo puro,
// soft delete, aviso por Telegram y heartbeat. Daniel: *«Aprobar préstamos: eso
// también se quita»* — sin estado pendiente no hay nada que caducar, y el cron
// salió de `vercel.json`, del registro (`cron-telemetry.ts`) y de la lista de
// crons que avisan. Medido antes: 0 préstamos esperando.
describe("🔴 el cron `prestamos-caducan` se retiró entero", () => {
  it("no está en vercel.json ni en el registro, y su route no existe", () => {
    expect(vercel.crons.some((c) => c.path.includes("prestamos-caducan"))).toBe(false);
    const telemetry = leer("src", "lib", "cron-telemetry.ts").replace(/\/\/.*$/gm, "");
    expect(telemetry).not.toContain('"prestamos-caducan"');
    const avisan = leer("src", "lib", "alertas", "crons-que-avisan.ts").replace(/\/\/.*$/gm, "");
    expect(avisan).not.toContain('"prestamos-caducan"');
    expect(existsSync(join(process.cwd(), "src", "app", "api", "cron", "prestamos-caducan", "route.ts"))).toBe(false);
  });
});
