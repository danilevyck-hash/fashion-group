/**
 * CANDADO — LOS COBROS VAN A ALERTAS, NO A NEGOCIO (7-oct-2026).
 *
 * Daniel: «Los cobros de Telegram deben llegar a Alertas, no a Negocio.»
 * «Alertas» es el chat privado de Daniel con @fashiongr_alertas_bot, el destino
 * de 🔧 SISTEMA. El texto no cambia: va por `enviarNegocioPrivado` (mismo
 * destino que las alertas, sin el prefijo "🔧 SISTEMA · "), igual que el
 * resumen de ACS y el mensual del grupo.
 *
 * Además fija el MAPA COMPLETO de quién manda por qué puerta: si alguien mueve
 * cualquier otro aviso de canal, este archivo se pone rojo y lo obliga a
 * actualizar el mapa a propósito.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const ENVIOS = /\benviar(?:NegocioPrivado|Negocio|Sistema)\s*\(/g;

function enviosUsados(rel: string): string[] {
  const codigo = sinComentarios(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
  return [...new Set((codigo.match(ENVIOS) ?? []).map((m) => m.replace(/\s*\($/, "")))].sort();
}

const N = "enviarNegocio"; // 📊 NEGOCIO — el grupo con el celular de la empresa
const A = "enviarNegocioPrivado"; // ALERTAS — privado de Daniel, sin prefijo
const S = "enviarSistema"; // ALERTAS — privado de Daniel, con "🔧 SISTEMA · "

/** Los mensajes de cobro. Todos a Alertas, ninguno al grupo. */
const COBROS = ["src/app/api/cron/cobros-del-dia/route.ts"];

/** Todos los demás, con su canal de hoy. */
const MAPA: Record<string, string[]> = {
  "src/app/api/catalogo/[marca]/orders/route.ts": [N],
  "src/app/api/catalogo/[marca]/pedido-publico/[id]/confirmar/route.ts": [N, S],
  "src/app/api/cron/acs-resumen-diario/route.ts": [A],
  "src/app/api/cron/asistencia-vigia/route.ts": [S],
  "src/app/api/cron/backup/route.ts": [S],
  "src/app/api/cron/catalogos-fotos-resumen/route.ts": [N],
  "src/app/api/cron/cheques-alert/route.ts": [N],
  "src/app/api/cron/db-salud/route.ts": [S],
  "src/app/api/cron/grupo-resumen-mensual/route.ts": [A],
  "src/app/api/cron/guias-pendientes/route.ts": [N],
  "src/app/api/cron/reclamos-viejos/route.ts": [N],
  "src/app/api/cron/switch-reconciliacion/route.ts": [N, A, S],
  "src/app/api/guias/[id]/route.ts": [N],
  "src/app/api/prestamos/movimientos/route.ts": [A],
  "src/lib/alertas/crons-que-avisan-io.ts": [S],
  "src/lib/alertas/cuadre-costo-io.ts": [S],
  "src/lib/alertas/lector-facturas-io.ts": [S],
  "src/lib/alertas/silencio-de-datos-io.ts": [S],
  "src/lib/asistencia/mismo-aparato-io.ts": [A],
  "src/lib/campos-obligatorios.ts": [S],
  "src/lib/catalogo/switch-envio.ts": [N, S],
  "src/lib/catalogos/clasificacion-aviso.ts": [S],
  "src/lib/catalogos/fotos-nuevos.ts": [N],
  "src/lib/cheques-alert.ts": [N, A],
  "src/lib/cron-telemetry.ts": [S],
  "src/lib/integrity-check-run.ts": [S],
  "src/lib/switch-api/alert-policy.ts": [S],
  "src/lib/switch-api/monto-guard-io.ts": [S],
  "src/lib/switch-api/renglones-ilegibles.ts": [S],
};

function archivosQueEnvian(dir = path.join(process.cwd(), "src"), acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "__tests__" && e.name !== "node_modules") archivosQueEnvian(p, acc);
    } else if (/\.tsx?$/.test(e.name)) {
      const rel = path.relative(process.cwd(), p).split(path.sep).join("/");
      if (rel !== "src/lib/alertas/canal.ts" && enviosUsados(rel).length) acc.push(rel);
    }
  }
  return acc;
}

describe("los cobros van a Alertas", () => {
  it.each(COBROS)("%s manda solo por enviarNegocioPrivado", (rel) => {
    expect(enviosUsados(rel)).toEqual([A]);
  });

  it("el texto de los cobros no lleva el prefijo de sistema", () => {
    for (const rel of COBROS) {
      const codigo = sinComentarios(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
      expect(codigo).not.toContain("PREFIJO_SISTEMA");
      expect(codigo).not.toMatch(/🔧\s*SISTEMA/);
    }
  });
});

describe("los demás no cambiaron de canal", () => {
  it.each(Object.entries(MAPA))("%s", (rel, esperado) => {
    expect(enviosUsados(rel)).toEqual([...esperado].sort());
  });

  it("no hay ningún archivo que mande a Telegram fuera del mapa", () => {
    const conocidos = new Set([...COBROS, ...Object.keys(MAPA)]);
    expect(archivosQueEnvian().filter((f) => !conocidos.has(f))).toEqual([]);
  });
});
