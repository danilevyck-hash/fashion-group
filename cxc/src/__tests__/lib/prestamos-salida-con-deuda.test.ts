/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO DEL AVISO DE SALIDA CON DEUDA — y del cron que caduca lo pendiente.
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
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const configTab = leer("src", "app", "asistencia", "ConfiguracionTab.tsx");
const configRoute = leer("src", "app", "api", "asistencia", "configuracion", "route.ts");
const listaServer = leer("src", "lib", "prestamos-lista-server.ts");
const cron = leer("src", "app", "api", "cron", "prestamos-caducan", "route.ts");
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

describe("🔴 lo pendiente caduca solo a los 7 días", () => {
  it("hay UNA entrada de cron, y una entrada es una ocurrencia al día", () => {
    const entradas = vercel.crons.filter((c) => c.path.startsWith("/api/cron/prestamos-caducan"));
    expect(entradas).toHaveLength(1);
    // Una sola hora: nada de listas `0 13,19 * * *` (la regla de la casa).
    expect(entradas[0].schedule).toBe("15 13 * * *");
    expect(entradas[0].schedule).not.toContain(",");
  });

  it("la regla vive en el módulo PURO, no en el route", () => {
    expect(cron).toContain("pendienteCaducado");
    expect(cron).toContain("DIAS_CADUCIDAD_PENDIENTE");
    // Nada de un umbral escrito a mano acá.
    expect(cron).not.toMatch(/7\s*\*\s*86400000/);
  });

  it("🔴 solo toca lo que está ESPERANDO, y con soft delete", () => {
    // DOS veces: al LEER y al ESCRIBIR. Con el filtro solo en la lectura, un
    // update sin condición borraría movimientos aprobados si la lista cambió
    // entre las dos consultas.
    expect((cron.match(/\.eq\("estado", ESTADO_PENDIENTE\)/g) ?? []).length).toBe(2);
    expect(cron).toContain("{ deleted: true }");
    // Ni un DELETE real: es la tabla de plata.
    expect(cron).not.toMatch(/\.delete\(\)/);
  });

  it("🔴 se DICE: un préstamo que se borra solo sin avisar es plata que desaparece", () => {
    expect(cron).toContain("enviarNegocioPrivado");
    expect(cron).toContain("se eliminó solo por no responder");
    // Y queda en el log de auditoría, persona por persona.
    expect(cron).toContain('"prestamo_caducado"');
  });

  it("sin nada que caducar NO manda ningún mensaje, pero registra el heartbeat", () => {
    const i = cron.indexOf("if (borrados > 0)");
    expect(i).toBeGreaterThan(-1);
    // El heartbeat se registra DESPUÉS del bloque del aviso: una corrida sin
    // nada que caducar es una corrida exitosa, no una fila que falta.
    expect(cron.lastIndexOf("await recordCronHeartbeat")).toBeGreaterThan(i);
  });
});
