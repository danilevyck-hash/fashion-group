/* BACKTESTING — SOLO LECTURA. Corre la ruta REAL `GET /api/asistencia/planilla`
 * (con dos stubs: la cookie y, para julio, los montos manuales del Excel) contra
 * producción tal como está hoy, y la compara al centavo con las matrices de la
 * contable. NO escribe una fila. Salida: comparacion.json + resumen.txt.
 *
 *   DOTENV_CONFIG_PATH=.env.local NEXT_PUBLIC_PLANILLA_UNIDA=1 npx tsx \
 *     --tsconfig scripts/_backtest-planilla-jul-2026-tsconfig.json -r dotenv/config \
 *     scripts/_backtest-planilla-jul-2026.ts
 */
import fs from "node:fs";
import { NextRequest } from "next/server";
import { GET as planillaGET } from "@/app/api/asistencia/planilla/route";
import { GET as reporteGET } from "@/app/api/asistencia/reporte/route";
import { ARCHIVOS, AMARRE, leerMatriz, normalizarNombre, type RenglonExcel } from "./_backtest-planilla-jul-2026-excel";

const OUT = "/Users/daniellevy/.claude/jobs/a93eb587/tmp/backtest/";
const r2 = (x: number) => Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
const iguales = (a: number, b: number) => Math.abs(r2(a) - r2(b)) < 0.005;

const QUINCENAS: Record<string, { desde: string; hasta: string; corte: string }> = {
  "2026-07-2": { desde: "2026-07-16", hasta: "2026-07-31", corte: "2026-07-30" },
  "2026-08-2": { desde: "2026-08-16", hasta: "2026-08-31", corte: "2026-08-30" },
};
const EMPRESAS = ["confecciones_boston", "fashion_wear", "vistana"];
/** Excel → dinero del sistema. */
const CAMPOS: Array<[keyof RenglonExcel, string, string]> = [
  ["qnal", "salarioQuincenal", "Sueldo quincenal"],
  ["e125", "extraDiurno", "Horas extra 1,25"],
  ["e150", "extraNocturno", "Horas extra 1,50"],
  ["exced", "excedente", "Excedente"],
  ["dom", "domingos", "Domingos"],
  ["fer", "feriados", "Feriados"],
  ["aus", "ausencias", "Ausencias"],
  ["tard", "tardanzas", "Tardanzas"],
  ["bruto", "totalBruto", "Total bruto"],
  ["ss", "seguroSocial", "Seguro social"],
  ["se", "seguroEducativo", "Seguro educativo"],
  ["isr", "isr", "ISR"],
  ["prest", "prestamo", "Préstamo"],
  ["terc", "terceros", "Terceros"],
  ["merc", "mercancia", "Mercancía"],
  ["totded", "totalDeducciones", "Total deducciones"],
  ["otros", "otrosServicios", "Otros servicios"],
  ["neto", "netoPagar", "NETO"],
];

async function llamar(fn: (r: NextRequest) => Promise<Response>, path: string, params: Record<string, string>) {
  const url = new URL(`http://backtest.local${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fn(new NextRequest(url));
  const j: any = await res.json();
  if (res.status !== 200) throw new Error(`${path} ${JSON.stringify(params)} → ${res.status} ${JSON.stringify(j)}`);
  return j;
}

function manualesDelExcel(rs: RenglonExcel[], codigoDe: (r: RenglonExcel) => string | null) {
  const m: Record<string, any> = {};
  for (const r of rs) {
    const c = codigoDe(r);
    if (!c) continue;
    // Julio Garay: sus montos manuales van UNA vez (en la línea principal, Vistana).
    if (c === "11" && r.empresa === "fashion_wear") continue;
    m[c] = { isr: r.isr, prestamo: r.prest, terceros: r.terc, mercancia: r.merc, otrosServicios: r.otros };
  }
  return m;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const excel = ARCHIVOS.flatMap((f) => leerMatriz(f.archivo, f.empresa, f.quincena));
  // Nombre → código. Exacto normalizado contra las fichas del sistema, si no, AMARRE.
  const cuadroCualquiera = await llamar(planillaGET, "/api/asistencia/planilla", { quincena: "2026-08-2" });
  const fichasSistema = new Map<string, string>(); // nombre normalizado → código
  for (const l of cuadroCualquiera.lineas) fichasSistema.set(normalizarNombre(l.etiqueta), l.codigo);
  const codigoDe = (r: RenglonExcel): string | null => {
    const nn = normalizarNombre(r.nombre);
    return fichasSistema.get(nn) ?? AMARRE[nn]?.codigo ?? null;
  };
  const comoCruzo = (r: RenglonExcel) => {
    const nn = normalizarNombre(r.nombre);
    if (fichasSistema.has(nn)) return "exacto";
    if (AMARRE[nn]) return `amarre a mano: ${AMARRE[nn].porque}`;
    return "SIN CRUZAR";
  };

  const resultado: any = { generado: new Date().toISOString(), quincenas: {} };
  const resumen: string[] = [];

  for (const [clave, q] of Object.entries(QUINCENAS)) {
    const excelQ = excel.filter((r) => r.quincena === clave);
    // Montos manuales: julio no tiene historia en el sistema → se INYECTAN los del Excel.
    // Agosto sí la tiene → se usa lo que el sistema tiene guardado (y se compara aparte).
    const manualesExcel = manualesDelExcel(excelQ, codigoDe);
    const archivoManuales = `${OUT}manuales-excel-${clave}.json`;
    fs.writeFileSync(archivoManuales, JSON.stringify({ [clave]: manualesExcel }, null, 2));
    const inyectar = clave === "2026-07-2";
    if (inyectar) process.env.BACKTEST_MANUALES = archivoManuales; else delete process.env.BACKTEST_MANUALES;

    // El reporte por día, una vez por quincena (todas las personas), para explicar diferencias.
    const rep = await llamar(reporteGET, "/api/asistencia/reporte", { desde: q.desde, hasta: q.hasta });
    const diasDe = new Map<string, any[]>();
    for (const p of rep.personas) diasDe.set(String(p.codigo), p.dias.map((d: any) => ({
      fecha: d.fecha, marcas: d.marcas, tardeMin: d.tardeMin, extraMin: d.extraMin, trabajadoMin: d.trabajadoMin,
      ausente: d.ausente, justificado: d.justificado ?? null, revisar: d.revisar, vacacion: d.vacacion ?? null,
      excesoAlmuerzoMin: d.excesoAlmuerzoMin, salidaTempranaMin: d.salidaTempranaMin, corregido: d.correcciones ?? d.corregido ?? null,
    })));

    const porEmpresa: any = {};
    for (const empresa of EMPRESAS) {
      const variantes: Record<string, any> = {};
      for (const [nombreVar, params] of [
        ["16-31", { quincena: clave, empresa }],
        ["16-30", { quincena: clave, empresa, corte: q.corte }],
      ] as const) {
        const j = await llamar(planillaGET, "/api/asistencia/planilla", params as any);
        variantes[nombreVar] = j;
      }
      const base = variantes["16-31"];
      const filas: any[] = [];
      const excelE = excelQ.filter((r) => r.empresa === empresa);
      const usados = new Set<string>();
      for (const r of excelE) {
        const codigo = codigoDe(r);
        const fila: any = {
          nombreExcel: r.nombre, cargoExcel: r.cargo, codigo, cruce: comoCruzo(r), notaExcel: r.nota,
          excel: Object.fromEntries(CAMPOS.map(([k, , et]) => [et, r2(r[k] as number)])),
          excelCrudo: Object.fromEntries(CAMPOS.map(([k]) => [k, r[k]])),
        };
        if (!codigo) { fila.estado = "SIN CRUZAR"; filas.push(fila); continue; }
        usados.add(codigo);
        for (const [nombreVar, j] of Object.entries(variantes)) {
          const l = j.lineas.find((x: any) => x.codigo === codigo);
          const v: any = { encontrado: !!l };
          if (l) {
            v.etiqueta = l.etiqueta; v.empresa = l.empresa; v.decidirAMano = l.decidirAMano ?? null;
            v.faltaConfigurar = l.faltaConfigurar; v.fueraDePlanilla = l.fueraDePlanilla;
            v.quincenalReferencia = l.quincenalReferencia ?? null;
            v.horas = l.horas; v.manuales = l.manuales;
            v.dinero = l.dinero ? Object.fromEntries(CAMPOS.map(([, s, et]) => [et, l.dinero[s]])) : null;
            v.rataHora = l.dinero?.rataHora ?? null;
            if (l.dinero) {
              const rata = l.dinero.rataHora;
              v.extraNoAprobadaValuada = r2((l.horas.extraNoAprobadaDiurnoMin / 60) * 1.25 * rata + (l.horas.extraNoAprobadaNocturnoMin / 60) * 1.5 * rata);
              // Agosto: qué daría el neto con los montos manuales del Excel en vez de los del sistema.
              const dSys = l.dinero.isr + l.dinero.prestamo + l.dinero.terceros + l.dinero.mercancia - l.dinero.otrosServicios;
              const dXls = r.isr + r.prest + r.terc + r.merc - r.otros;
              v.netoConManualesDelExcel = r2(l.dinero.netoPagar + dSys - dXls);
              v.netoSiSeAprobaraTodo = r2(l.dinero.netoPagar + v.extraNoAprobadaValuada * (l.dinero.seguroSocial > 0 && l.dinero.baseSeguros == null ? (1 - 0.11) : 1));
              v.dif = {};
              for (const [k, s, et] of CAMPOS) {
                const a = r2(r[k] as number), b = r2(l.dinero[s]);
                v.dif[et] = r2(b - a);
              }
              v.difNetoConManualesDelExcel = r2(v.netoConManualesDelExcel - r2(r.neto));
              v.cuadraNeto = iguales(l.dinero.netoPagar, r.neto);
              v.cuadraNetoConManualesDelExcel = iguales(v.netoConManualesDelExcel, r.neto);
              v.cuadraBrutoMenosSeguros = iguales(l.dinero.totalBruto - l.dinero.seguroSocial - l.dinero.seguroEducativo, r.bruto - r.ss - r.se);
            }
          }
          fila[`sistema ${nombreVar}`] = v;
        }
        fila.dias = diasDe.get(codigo) ?? [];
        filas.push(fila);
      }
      const sobran = base.lineas.filter((l: any) => !usados.has(l.codigo)).map((l: any) => ({
        codigo: l.codigo, etiqueta: l.etiqueta, neto: l.dinero?.netoPagar ?? null, decidirAMano: l.decidirAMano ?? null,
        faltaConfigurar: l.faltaConfigurar, fueraDePlanilla: l.fueraDePlanilla,
      }));
      porEmpresa[empresa] = {
        tituloExcel: excelE[0]?.rangoTitulo, filas, enSistemaYNoEnExcel: sobran,
        totalesSistema: Object.fromEntries(Object.entries(variantes).map(([k, j]) => [k, j.totales])),
        avisosSistema: Object.fromEntries(Object.entries(variantes).map(([k, j]) => [k, {
          corte: j.corte, extraSinAprobar: j.avisos.extraSinAprobar, prestamoSinAprobar: j.avisos.prestamoSinAprobar,
          correcciones: j.avisos.correcciones, sinHorario: j.avisos.sinHorario, conSabado: j.avisos.conSabado,
          sinFicha: j.avisos.sinFicha, marcaciones: j.marcaciones, vacacionesNoPagadas: j.avisos.vacacionesNoPagadas,
          prestamos: j.prestamos,
        }])),
        totalesExcel: {
          neto: r2(excelE.reduce((s, r) => s + r.neto, 0)), bruto: r2(excelE.reduce((s, r) => s + r.bruto, 0)),
          personas: excelE.length,
        },
      };

      // Resumen en texto, por variante
      for (const nombreVar of Object.keys(variantes)) {
        let cuadran = 0, no = 0, sinNumero = 0, dif = 0, difManXls = 0, cuadranManXls = 0, cuadranBMS = 0;
        const lineas: string[] = [];
        for (const f of filas) {
          const v = f[`sistema ${nombreVar}`];
          if (!v?.dinero) { sinNumero++; lineas.push(`   ${f.nombreExcel.padEnd(26)} ${String(f.codigo).padEnd(5)} SIN NÚMERO en el sistema: ${v?.decidirAMano ?? v?.faltaConfigurar?.join("; ") ?? (v?.encontrado ? "?" : "no está en el cuadro")} · Excel neto ${r2(f.excelCrudo.neto)}`); continue; }
          if (v.cuadraNeto) cuadran++; else no++;
          if (v.cuadraNetoConManualesDelExcel) cuadranManXls++;
          if (v.cuadraBrutoMenosSeguros) cuadranBMS++;
          dif += v.dif["NETO"]; difManXls += v.difNetoConManualesDelExcel;
          const partes = CAMPOS.filter(([, , et]) => Math.abs(v.dif[et]) >= 0.005 && et !== "NETO" && et !== "Total bruto" && et !== "Total deducciones").map(([, , et]) => `${et} ${v.dif[et] > 0 ? "+" : ""}${v.dif[et].toFixed(2)}`);
          lineas.push(`   ${(v.cuadraNeto ? "✅" : "❌")} ${f.nombreExcel.padEnd(26)} ${String(f.codigo).padEnd(5)} Excel ${r2(f.excelCrudo.neto).toFixed(2).padStart(8)} · sistema ${v.dinero["NETO"].toFixed(2).padStart(8)} · dif ${(v.dif["NETO"] > 0 ? "+" : "") + v.dif["NETO"].toFixed(2).padStart(7)}${clave === "2026-08-2" ? ` · con manuales del Excel ${v.netoConManualesDelExcel.toFixed(2)} (dif ${v.difNetoConManualesDelExcel.toFixed(2)})` : ""}${v.horas.extraNoAprobadaMin > 0 ? ` · extra SIN aprobar ${v.horas.extraNoAprobadaMin.toFixed(1)} min = $${v.extraNoAprobadaValuada.toFixed(2)}` : ""}${partes.length ? "  [" + partes.join(" · ") + "]" : ""}`);
        }
        resumen.push(`\n=== ${clave} · ${empresa} · reloj ${nombreVar} · Excel «${excelE[0]?.rangoTitulo}» ===`);
        resumen.push(`   cuadran al centavo ${cuadran} · no cuadran ${no} · sin número ${sinNumero} · dif neta total (sistema − Excel) ${dif.toFixed(2)}` + (clave === "2026-08-2" ? ` · con los manuales del Excel: cuadran ${cuadranManXls}, dif ${difManXls.toFixed(2)}` : "") + ` · cuadran en bruto−seguros ${cuadranBMS}`);
        resumen.push(...lineas);
        if (sobran.length) resumen.push(`   en el sistema y no en el Excel: ${sobran.map((s: any) => `${s.codigo} ${s.etiqueta} (${s.neto ?? s.decidirAMano ?? s.faltaConfigurar?.join(";") ?? "sin número"})`).join(" · ")}`);
      }
    }
    resultado.quincenas[clave] = { rango: q, manualesInyectadosDelExcel: inyectar, empresas: porEmpresa };
  }
  fs.writeFileSync(`${OUT}comparacion.json`, JSON.stringify(resultado, null, 1));
  fs.writeFileSync(`${OUT}resumen.txt`, resumen.join("\n") + "\n");
  console.log(resumen.join("\n"));
}
main().catch((e) => { console.error(e); process.exit(1); });
