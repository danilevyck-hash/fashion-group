// La sincronización automática del mayor contable — candados de diseño.
//
// Lo que este archivo protege NO es la aritmética (esa vive en
// `mayor-parser.test.ts`, medida contra el archivo real), sino las cuatro
// decisiones que, si alguien las deshace sin darse cuenta, rompen algo caro y
// EN SILENCIO:
//
//  A. La ventana es el AÑO ENTERO. Con una ventana de "mes en curso + anterior",
//     el día que la contadora cierre de febrero a julio de una sentada, esos
//     meses quedan fuera para siempre y la pantalla sigue diciendo "sin cerrar"
//     con la contabilidad ya hecha.
//  B. SECUENCIAL y con la sesión CERRADA. El login hace changesession="SI", que
//     expulsa del panel a quien esté adentro — y el usuario es el de Daniel.
//     Un Promise.all serían 8 sesiones simultáneas.
//  C. La hora es la MADRUGADA DE PANAMÁ. Los crons de Vercel van en UTC y
//     Panamá es UTC−5: es el error fácil, y equivocarse deja el cron corriendo
//     mientras Daniel trabaja.
//  D. No se estrena una CUARTA alerta de sistema. La lista está cerrada en 3;
//     esto entra en la regla 2 reusando `alertSwitchCronErrors`.

import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(),
  shortError: (s: string) => s,
}));
vi.mock("@/lib/alertas/canal", () => ({ enviarSistema: vi.fn(), enviarNegocio: vi.fn() }));

import { rangoDelAnio, MAYOR_EMPRESA_KEYS } from "@/lib/switch-api/sync-mayor";
import { pareceCsvDelMayor } from "@/lib/switch-api/web-client";
import { SYNC_LOG_TYPES } from "@/lib/switch-api/sync-log-tipos";
import { ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { horaPanamaDeUtc, esHorarioDeOficinaPanama, SWITCH_CRON_ENTRADAS } from "@/lib/cron-telemetry";

const SRC = path.join(process.cwd(), "src");
const leer = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

/**
 * Quita comentarios. Los barridos de abajo tienen que mirar el CÓDIGO: estos
 * archivos EXPLICAN en prosa por qué no usan `Promise.all`, y un barrido sobre
 * el texto crudo se marcaría a sí mismo por la explicación.
 */
const soloCodigo = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SYNC = soloCodigo(leer(path.join("lib", "switch-api", "sync-mayor.ts")));
const ROUTE = soloCodigo(leer(path.join("app", "api", "cron", "sync-mayor", "route.ts")));

// ─────────────────────────────────────────────────────────────────────────────
describe("A. la ventana es el AÑO ENTERO", () => {
  it("1-ene al 31-dic — el mismo rango que Daniel baja a mano", () => {
    expect(rangoDelAnio(2026)).toEqual({ desde: "2026-01-01", hasta: "2026-12-31" });
    expect(rangoDelAnio(2025)).toEqual({ desde: "2025-01-01", hasta: "2025-12-31" });
  });

  it("cubre los 12 meses, así que ninguno queda como 'no traído'", () => {
    // Que el rango abarque el año completo es lo que permite decir "se pidió y
    // vino vacío" (sin cerrar) en vez de "no sabemos nada" (no traído).
    const { desde, hasta } = rangoDelAnio(2026);
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, "0");
      expect(desde <= `2026-${mm}-01`).toBe(true);
      expect(hasta >= `2026-${mm}-28`).toBe(true);
    }
  });

  it("se recorren los 12 meses al escribir, no solo los que traen líneas", () => {
    // Un mes que la contadora deshizo tiene que quedar vacío acá también.
    // Saltear los meses sin líneas dejaría datos viejos pasando por buenos.
    expect(SYNC).toMatch(/for \(const mes of mesesDelAnio\(anio\)\)/);
  });

  it("entran las 8 empresas", () => {
    expect([...MAYOR_EMPRESA_KEYS].sort()).toEqual([...ALL_EMPRESA_KEYS].sort());
    expect(MAYOR_EMPRESA_KEYS).toHaveLength(8);
    // Multifashion es la key `american_classic`.
    expect(MAYOR_EMPRESA_KEYS).toContain("american_classic");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B. secuencial, una sesión por empresa, cerrada al terminar", () => {
  it("NO usa Promise.all / allSettled: serían 8 sesiones a la vez", () => {
    expect(SYNC).not.toMatch(/Promise\.all\b/);
    expect(SYNC).not.toMatch(/Promise\.allSettled\b/);
  });

  it("el bucle de empresas es un for…of que espera cada una", () => {
    expect(SYNC).toMatch(/for \(const empresaKey of empresas\)[\s\S]*?await syncEmpresaMayor/);
  });

  it("la sesión se cierra SIEMPRE, en un finally", () => {
    expect(SYNC).toMatch(/finally\s*\{[\s\S]*?cerrarSesionWeb/);
  });

  it("el reemplazo del mes es ATÓMICO (RPC), no un delete + insert suelto", () => {
    // Hechos por separado desde PostgREST habría una ventana en la que el mes
    // se ve vacío — y un mes vacío es justo lo que la pantalla lee como
    // "sin cerrar".
    expect(SYNC).toMatch(/rpc\("mayor_reemplazar_mes"/);
    expect(SYNC).not.toMatch(/\.from\("mayor_lineas"\)[\s\S]{0,120}\.delete\(/);
  });

  it("guard del CERO SILENCIOSO: no borra un año que ya tenía datos", () => {
    expect(SYNC).toMatch(/vino vacío pero ya había/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C. la hora es la MADRUGADA DE PANAMÁ, no la de UTC", () => {
  const entrada = SWITCH_CRON_ENTRADAS.find((e) => e.cron === "sync-mayor");

  it("está declarada en el cronograma de Switch", () => {
    expect(entrada, "sync-mayor falta en SWITCH_CRON_ENTRADAS").toBeTruthy();
    expect(entrada!.hhmmUtc).toBe("0905");
  });

  it("09:05 UTC son las 4:05 a.m. de Panamá — fuera de horario de oficina", () => {
    expect(horaPanamaDeUtc(9)).toBe(4);
    expect(esHorarioDeOficinaPanama(9)).toBe(false);
  });

  it("🩸 la franja 00:20-05:20 UTC NO es madrugada: es la tarde-noche de Panamá", () => {
    // Es el error fácil, y por eso queda escrito como test: 02:00 UTC son las
    // 9 de la noche en Panamá, hora en la que Daniel puede estar en Switch.
    expect(horaPanamaDeUtc(1)).toBe(20);
    expect(horaPanamaDeUtc(2)).toBe(21);
    expect(horaPanamaDeUtc(5)).toBe(0);
    // Y la franja donde SÍ es madrugada es la de los otros dos crons web.
    expect(horaPanamaDeUtc(7)).toBe(2); // sync-utilidad
    expect(horaPanamaDeUtc(8)).toBe(3); // boston-cartera
  });

  it("toca las 8 empresas, así que comparte empresa con casi todo", () => {
    expect(entrada!.empresas.length).toBe(8);
  });

  it("corre 1×/día: una sola entrada en el cronograma", () => {
    expect(SWITCH_CRON_ENTRADAS.filter((e) => e.cron === "sync-mayor")).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D. no se estrena una cuarta alerta de sistema", () => {
  it("el fallo va por alertSwitchCronErrors (regla de los 2 fallos seguidos)", () => {
    expect(ROUTE).toMatch(/alertSwitchCronErrors/);
  });

  it("el route NO manda Telegram por su cuenta", () => {
    expect(ROUTE).not.toMatch(/enviarSistema|enviarNegocio|sendTelegramAlert/);
  });

  it("el heartbeat se registra SOLO si no falló ninguna empresa", () => {
    expect(ROUTE).toMatch(/if \(fallidas\.length === 0\)[\s\S]{0,80}recordCronHeartbeat/);
  });

  it("'mayor' está en SYNC_LOG_TYPES (si no, la corrida sería invisible)", () => {
    // Sin el tipo, el INSERT viola el CHECK, el logger se traga el error y la
    // corrida no deja fila ni de éxito ni de error. Ya pasó dos veces.
    expect(SYNC_LOG_TYPES).toContain("mayor");
  });

  it("y su DDL reescribe el CHECK en la misma migración", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "supabase", "migrations", "20260810160000_mayor_contable.sql"),
      "utf8",
    );
    expect(sql).toMatch(/switch_sync_log_sync_type_check/);
    expect(sql).toMatch(/'mayor'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la descarga se valida ANTES de escribir nada", () => {
  it("reconoce el CSV real del mayor", () => {
    const real = fs.readFileSync(
      path.join(SRC, "__tests__", "fixtures", "mayor-vistana-2026.csv"),
      "utf8",
    );
    expect(pareceCsvDelMayor(real)).toBe(true);
  });

  it("🩸 rechaza el HTML de excepción de Switch, que llega con HTTP 200", () => {
    // Switch responde 200 con su página de error cuando la ruta no existe: el
    // código de estado NO alcanza para distinguir. Si esto pasara por bueno,
    // el parser no encontraría líneas y el guard del cero silencioso sería lo
    // único entre nosotros y borrar el año entero.
    expect(pareceCsvDelMayor("<!DOCTYPE html><html><body>Exception - SWITCH SOFT</body></html>")).toBe(false);
    expect(pareceCsvDelMayor("")).toBe(false);
    expect(pareceCsvDelMayor("otra;cosa;cualquiera")).toBe(false);
  });

  it("acepta el encabezado con dobles espacios, que es como viene", () => {
    expect(
      pareceCsvDelMayor("ASIENTO;DESCRIPCION;FECHA; NOMBRE  CUENTA ;CUENTA;DEBITO;CREDITO\n"),
    ).toBe(true);
  });

  it("tolera BOM", () => {
    expect(
      pareceCsvDelMayor("﻿ASIENTO;DESCRIPCION;FECHA; NOMBRE  CUENTA ;CUENTA;DEBITO;CREDITO\n"),
    ).toBe(true);
  });
});
