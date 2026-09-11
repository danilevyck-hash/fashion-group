/* ─────────────────────────────────────────────────────────────────────────────
 * EL AJUSTE POR CONCEPTO NO MUEVE EL NETO — medido contra producción, SOLO LECTURA.
 *
 * Quincena 16–31 ago 2026 con corte el 28, en las TRES empresas con planilla
 * (Boston · Fashion Wear · Vistana): los días sin medir son el 29, 30 y 31 de
 * agosto. Se corre la ruta REAL de la planilla (entra como admin por el stub de
 * guard, igual que el backtest del 10-sep) para:
 *   · el rango corto 29–31 ago → el `dinero` de esos días por persona;
 *   · la quincena 1–15 sep     → la línea que RECIBE el ajuste.
 * Y por persona se comparan:
 *   ANTES   = netoPagar − ajusteDeDiasSinMedir(dinero corto)   (un número neto)
 *   DESPUÉS = aplicarAjusteEnLinea(línea, dinero corto).netoPagar (por columna)
 *   Σ signo × reparto  vs  el ajuste viejo.
 *
 * ⚠️ NO ESCRIBE NADA. Lee y calcula en memoria.
 *
 *   DOTENV_CONFIG_PATH=.env.local NEXT_PUBLIC_PLANILLA_UNIDA=1 npx tsx \
 *     --tsconfig scripts/_medir-ajuste-por-concepto-tsconfig.json -r dotenv/config \
 *     scripts/_medir-ajuste-por-concepto.ts
 * ────────────────────────────────────────────────────────────────────────── */
import fs from "node:fs";
import { NextRequest } from "next/server";
import { GET as planillaGET } from "@/app/api/asistencia/planilla/route";
import {
  ORDEN_DEL_RELOJ, ROTULO_DEL_RELOJ, ajusteDeDiasSinMedir, aplicarAjusteEnLinea,
  efectoEnElNeto, netoConAjuste, repartirAjuste,
} from "@/lib/asistencia/corte-quincena";
import type { DineroLinea, LineaPlanilla } from "@/lib/asistencia/planilla";

const EMPRESAS = ["confecciones_boston", "fashion_wear", "vistana"];
const CORTO = { desde: "2026-08-29", hasta: "2026-08-31" };
const RECIBE = "2026-09-1";
const OUT = process.env.OUT ?? "/tmp/medir-ajuste-por-concepto.json";
const r2 = (x: number) => Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
const f2 = (x: number) => (x === 0 ? "—" : x.toFixed(2));

async function llamar(params: Record<string, string>) {
  const url = new URL("http://medicion.local/api/asistencia/planilla");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await planillaGET(new NextRequest(url));
  const j = (await res.json()) as { lineas: LineaPlanilla[]; empresaEtiqueta: string };
  if (res.status !== 200) throw new Error(`${JSON.stringify(params)} → ${res.status} ${JSON.stringify(j)}`);
  return j;
}

async function main() {
  const salida: Record<string, unknown> = { generado: new Date().toISOString(), corto: CORTO, recibe: RECIBE, empresas: {} };
  let filasTotal = 0, conAjuste = 0, difNetoMax = 0, difSumaMax = 0, salidaTempranaOlvidada = 0;
  const md: string[] = [];
  for (const empresa of EMPRESAS) {
    const corto = await llamar({ empresa, desde: CORTO.desde, hasta: CORTO.hasta });
    const recibe = await llamar({ empresa, quincena: RECIBE });
    const dineroCorto = new Map<string, DineroLinea>();
    for (const l of corto.lineas) if (l.dinero) dineroCorto.set(l.codigo, l.dinero);
    md.push(`\n### ${recibe.empresaEtiqueta} — días sin medir ${CORTO.desde}..${CORTO.hasta} → quincena ${RECIBE}\n`);
    md.push(`| Código | Colaborador | ${ORDEN_DEL_RELOJ.map((c) => ROTULO_DEL_RELOJ[c]).join(" | ")} | Ajuste viejo | Σ signo×reparto | Neto antes | Neto después | Salida temp. 29–31 (no entra) |`);
    md.push(`|---|---|${ORDEN_DEL_RELOJ.map(() => "---:").join("|")}|---:|---:|---:|---:|---:|`);
    const filas: unknown[] = [];
    for (const l of recibe.lineas) {
      if (!l.dinero) continue;
      const dc = dineroCorto.get(l.codigo);
      filasTotal += 1;
      const viejo = ajusteDeDiasSinMedir(dc);
      const reparto = repartirAjuste(dc);
      const suma = efectoEnElNeto(reparto);
      const netoAntes = netoConAjuste(l.dinero.netoPagar, viejo);
      const despues = aplicarAjusteEnLinea(l, dc, CORTO);
      const netoDespues = despues.dinero!.netoPagar;
      const st = r2(Number(dc?.salidaTemprana ?? 0));
      if (Object.keys(reparto).length) conAjuste += 1;
      difNetoMax = Math.max(difNetoMax, Math.abs(r2(netoAntes - netoDespues)));
      difSumaMax = Math.max(difSumaMax, Math.abs(r2(viejo - suma)));
      salidaTempranaOlvidada = r2(salidaTempranaOlvidada + st);
      // Control: cada columna de la línea DESPUÉS = antes + lo repartido.
      for (const c of ORDEN_DEL_RELOJ) {
        const esperado = r2(l.dinero[c] + (reparto[c] ?? 0));
        if (Math.abs(esperado - despues.dinero![c]) > 0.005) throw new Error(`columna ${c} no cuadra en ${l.codigo}`);
      }
      const fila = { codigo: l.codigo, etiqueta: l.etiqueta, reparto, viejo, suma, netoAntes, netoDespues, salidaTempranaSinEntrar: st };
      filas.push(fila);
      md.push(`| ${l.codigo} | ${l.etiqueta} | ${ORDEN_DEL_RELOJ.map((c) => f2(reparto[c] ?? 0)).join(" | ")} | ${viejo.toFixed(2)} | ${suma.toFixed(2)} | ${netoAntes.toFixed(2)} | ${netoDespues.toFixed(2)} | ${f2(st)} |`);
    }
    (salida.empresas as Record<string, unknown>)[empresa] = { etiqueta: recibe.empresaEtiqueta, filas };
  }
  md.unshift(
    `## Medición — ajuste por concepto, ${new Date().toISOString().slice(0, 10)}\n`,
    `Personas con dinero: **${filasTotal}** · con algo que repartir: **${conAjuste}** · `
    + `mayor diferencia de neto antes/después: **$${difNetoMax.toFixed(2)}** · `
    + `mayor diferencia Σreparto vs ajuste viejo: **$${difSumaMax.toFixed(2)}** · `
    + `salida temprana del 29–31 que NO entra al ajuste (ni antes ni ahora): **$${salidaTempranaOlvidada.toFixed(2)}**`,
  );
  Object.assign(salida, { filasTotal, conAjuste, difNetoMax, difSumaMax, salidaTempranaOlvidada });
  fs.writeFileSync(OUT, JSON.stringify(salida, null, 2));
  console.log(md.join("\n"));
  console.log(`\nJSON: ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
