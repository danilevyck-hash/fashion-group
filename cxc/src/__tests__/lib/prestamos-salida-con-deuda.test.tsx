/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO DEL AVISO DE SALIDA CON DEUDA — sobre la PANTALLA VIVA.
 *
 * 🔴 Daniel, 5-sep-2026: al marcar la fecha de salida de alguien con deuda hay
 * que avisar **ahí mismo**: «Debe $100 — descuéntalo de la liquidación». Es el
 * momento en que se decide la liquidación, y el único en que ese dato sirve:
 * después la persona ya cobró y la plata se fue. **Sin Telegram** — Daniel
 * eligió que el aviso vaya donde se toma la decisión.
 *
 * ⚠️ CAMBIÓ DE DIRECCIÓN EL 11-SEP-2026, NO SE BORRÓ. Hasta hoy era un barrido
 * de TEXTO sobre `ConfiguracionTab.tsx` —el panel desplegable de la lista
 * vieja— y seguía VERDE mientras la página de la persona (la que de verdad se
 * usa, `NEXT_PUBLIC_PERSONA_EN_EL_CENTRO`) daba de baja diciendo «Listo,
 * guardado» y nada más (auditoría del 11-sep). Ahora se MONTA el formulario
 * de la ficha y se lee el DOM; el texto vive en UN módulo puro
 * (`lib/asistencia/salida-con-deuda.ts`) que usan la ficha, la lista vieja y
 * el toast.
 *
 * Hoy hay un caso vivo: BRICEIDA MONTERO, $100 desde marzo.
 * ─────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { avisoGuardadoConSalida, avisoSalidaConDeuda } from "@/lib/asistencia/salida-con-deuda";
import FichaEditar, { borradorDe } from "@/app/asistencia/colaboradores/FichaEditar";
import { ToastProvider } from "@/components/ToastSystem";

const leer = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const puro = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const configTab = leer("src", "app", "asistencia", "ConfiguracionTab.tsx");
const configRoute = leer("src", "app", "api", "asistencia", "configuracion", "route.ts");
const listaServer = leer("src", "lib", "prestamos-lista-server.ts");
const personaPagina = leer("src", "app", "asistencia", "colaboradores", "PersonaPagina.tsx");
const vercel = JSON.parse(leer("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };

afterEach(cleanup);

const PERMISOS = {
  puedeDarDeBaja: true, puedeMarcarServicioProfesional: true, puedeQuitarSeguros: true,
  puedeCargarBaseSeguros: true, puedeMarcarSueldoFijo: true, puedeCargarSaldoVacaciones: true,
};

function montarFicha(deuda: number) {
  const b = { ...borradorDe(null, "22"), nombre: "BRICEIDA MONTERO", empresa: "vistana", salario: "600" };
  render(
    <ToastProvider>
      <FichaEditar borrador={b} onCambio={() => {}} onGuardar={() => {}} onCancelar={() => {}}
        guardando={false} nueva={false} permisos={PERMISOS} puedeEditar onCambioFoto={() => {}}
        deudaPrestamo={deuda} />
    </ToastProvider>,
  );
}

describe("🔴 el texto, dicho UNA vez", () => {
  it("«Debe $100.00 en Préstamos — descuéntalo de la liquidación.»", () => {
    expect(avisoSalidaConDeuda(100)).toBe("Debe $100.00 en Préstamos — descuéntalo de la liquidación.");
    expect(avisoSalidaConDeuda(12.5)).toBe("Debe $12.50 en Préstamos — descuéntalo de la liquidación.");
  });
  it("sin deuda no hay aviso — ni con cero, ni con saldo a favor, ni sin dato", () => {
    expect(avisoSalidaConDeuda(0)).toBeNull();
    expect(avisoSalidaConDeuda(-30)).toBeNull();
    expect(avisoSalidaConDeuda(undefined)).toBeNull();
  });
  it("el aviso de «guardado» con fecha de salida lleva nombre, fecha y —si debe— el monto", () => {
    expect(avisoGuardadoConSalida("Briceida Montero", "2026-09-30", 100))
      .toBe("Listo. Briceida Montero no sale en las quincenas posteriores al 2026-09-30; las anteriores quedan igual. Debe $100.00 en Préstamos — descuéntalo de la liquidación.");
    expect(avisoGuardadoConSalida("Briceida Montero", "2026-09-30", 0))
      .toBe("Listo. Briceida Montero no sale en las quincenas posteriores al 2026-09-30; las anteriores quedan igual.");
  });
});

describe("🔴 la PANTALLA VIVA: Editar › «Dar de baja…» dice lo que debe", () => {
  it("con deuda, al abrir «Dar de baja…» aparece el aviso pegado al formulario", () => {
    montarFicha(100);
    expect(screen.queryByTestId("aviso-salida-con-deuda")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Dar de baja/ }));
    expect(screen.getByTestId("aviso-salida-con-deuda").textContent)
      .toBe("Debe $100.00 en Préstamos — descuéntalo de la liquidación.");
  });
  it("⚠️ CONTROL: sin deuda, el formulario de baja abre sin aviso", () => {
    montarFicha(0);
    fireEvent.click(screen.getByRole("button", { name: /Dar de baja/ }));
    expect(screen.queryByTestId("aviso-salida-con-deuda")).toBeNull();
    expect(screen.getByText(/Su último día/)).toBeTruthy();
  });
  it("la página de la persona le PASA la deuda a la ficha y la repite en el aviso de guardado", () => {
    const p = puro(personaPagina);
    expect(p).toContain("deudaPrestamo={persona?.deudaPrestamo ?? 0}");
    expect(p).toContain("avisoGuardadoConSalida(titulo, b.fechaSalida, deuda)");
    // ámbar y 8 s cuando hay deuda: el aviso tiene que alcanzar a leerse
    expect(p).toContain('deuda > 0 ? "warning" : "success"');
  });
});

describe("el dato viaja desde Préstamos hasta la ficha de Asistencia", () => {
  it("por `leerDeudaPorCodigo` (las tres cuentas, vía `calcularSaldoPrestamo`)", () => {
    expect(listaServer).toContain("export async function leerDeudaPorCodigo(");
    expect(listaServer.slice(listaServer.indexOf("export async function leerDeudaPorCodigo("))).toContain("calcularSaldoPrestamo(f.prestamos_movimientos).saldo");
    expect(configRoute).toContain("leerDeudaPorCodigo()");
    expect(configRoute).toContain("deudaPrestamo: deudaDe.get(codigo) ?? 0");
  });
  it("la lista vieja (ConfiguracionTab) usa el MISMO texto, no una copia", () => {
    const c = puro(configTab);
    expect(c).toContain("avisoSalidaConDeuda(persona.deudaPrestamo)");
    expect(c).toContain("avisoGuardadoConSalida(quien, fechaSalida, debe)");
    expect(c).not.toContain("descuéntalo de la liquidación");
  });
  it("⚠️ SIN TELEGRAM: el aviso va donde se toma la decisión (Daniel eligió (a))", () => {
    for (const s of [configTab, personaPagina, configRoute]) {
      expect(s).not.toContain("enviarNegocio");
      expect(s).not.toContain("sendTelegram");
    }
  });
  it("🔴 y si Préstamos no contesta, la planilla NO se cae: el aviso falta, nada más", () => {
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
  // 🩸 Y su fila en `cron_heartbeats` no sobrevive al cron: es el huérfano de
  // `sync-mayor` otra vez, y esta vez CON su migración (11-sep-2026).
  it("su heartbeat huérfano se borra por nombre EXACTO, con migración (patrón sync-mayor)", () => {
    const ruta = join(process.cwd(), "supabase", "migrations", "20261116120000_borrar_heartbeat_prestamos_caducan.sql");
    expect(existsSync(ruta)).toBe(true);
    const sql = readFileSync(ruta, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).toMatch(/DELETE FROM cron_heartbeats\s+WHERE cron_name = 'prestamos-caducan';/);
    expect(sql).not.toMatch(/LIKE/i);
    expect(sql.match(/DELETE/g)?.length).toBe(1);
  });
});
