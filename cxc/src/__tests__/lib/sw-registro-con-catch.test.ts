/**
 * 🔴 EL REGISTRO DEL SERVICE WORKER NUNCA VA SIN `.catch()` (19-sep-2026).
 *
 * 🩸 `SWUpdater.tsx` llamaba `void serwist.update()` y `void serwist.register()`
 * pelados. Cuando un teléfono pierde señal a media carga esas promesas se
 * rechazan, nadie las atrapa, y Sentry las reporta como error del sistema:
 * «Script https://www.fashiongr.com/sw.js load failed» y «Error: Rejected».
 * A nadie se le rompe la pantalla — la app es SIEMPRE online y sin service
 * worker funciona igual.
 *
 * La regla: las dos llevan `.catch()`, y el catch NO se traga el dato — quedarse
 * sin señal queda como breadcrumb, y cualquier otro motivo se reporta.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { esFalloDeSenal, textoDelFallo } from "@/lib/sw-registro-fallo";

const raiz = join(__dirname, "..", "..", "..");
const updater = readFileSync(join(raiz, "src", "components", "SWUpdater.tsx"), "utf8");
const lib = readFileSync(join(raiz, "src", "lib", "sw-registro-fallo.ts"), "utf8");

// Solo el código: los comentarios nombran las dos llamadas y darían falsos verdes.
const codigo = updater
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

describe("SWUpdater · las dos llamadas tienen .catch()", () => {
  it("serwist.update() no va suelto", () => {
    const usos = codigo.match(/serwist\.update\(\)[^\n]*/g) ?? [];
    expect(usos.length, "se esperaba UNA llamada a serwist.update()").toBe(1);
    expect(usos[0]).toContain(".catch(");
  });

  it("serwist.register() no va suelto", () => {
    const usos = codigo.match(/serwist\.register\(\)[^\n]*/g) ?? [];
    expect(usos.length, "se esperaba UNA llamada a serwist.register()").toBe(1);
    expect(usos[0]).toContain(".catch(");
  });

  it("las dos reportan por la MISMA puerta", () => {
    expect(codigo).toContain('reportarFalloSW("update", err)');
    expect(codigo).toContain('reportarFalloSW("register", err)');
    expect(updater).toContain('from "@/lib/sw-registro-fallo"');
  });

  it("y el catch no es un `catch (() => {})` vacío", () => {
    expect(codigo).not.toMatch(/serwist\.(?:update|register)\(\)\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/);
  });
});

describe("sw-registro-fallo · sin señal se calla, lo raro se reporta", () => {
  it("estar desconectado explica cualquier mensaje", () => {
    expect(esFalloDeSenal(new Error("lo que sea"), false)).toBe(true);
  });

  it("los dos mensajes que Sentry reportaba son de señal", () => {
    expect(esFalloDeSenal(new Error("Script https://www.fashiongr.com/sw.js load failed"), true)).toBe(true);
    expect(esFalloDeSenal(new Error("Rejected"), true)).toBe(true);
    expect(esFalloDeSenal(new TypeError("Failed to fetch"), true)).toBe(true);
  });

  it("con red, un fallo de otra causa SÍ se reporta", () => {
    expect(esFalloDeSenal(new Error("The path of the provided scope is not under the max scope"), true)).toBe(false);
    expect(esFalloDeSenal(new Error("SecurityError"), true)).toBe(false);
  });

  it("el texto del fallo sale venga como venga", () => {
    expect(textoDelFallo(new Error("hola"))).toBe("hola");
    expect(textoDelFallo("hola")).toBe("hola");
    expect(textoDelFallo({ message: "hola" })).toBe("hola");
    expect(textoDelFallo(undefined)).toBe("undefined");
  });

  it("reportar nunca lanza (está envuelto en try/catch)", () => {
    expect(lib).toMatch(/export function reportarFalloSW[\s\S]*try \{/);
    expect(lib).toContain("Sentry.captureException");
    expect(lib).toContain("Sentry.addBreadcrumb");
  });
});
