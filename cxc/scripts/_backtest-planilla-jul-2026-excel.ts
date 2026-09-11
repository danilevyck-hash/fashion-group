/* Lee las matrices de la contable (solo lectura). Un renglón por persona, con las
 * 21 columnas de su cuadro. Los nombres se cruzan por CÓDIGO vía `AMARRE`, que es
 * una lista ESCRITA A MANO (nunca por parecido): cada par se declara y se puede revisar. */
import * as XLSX from "xlsx-js-style";

export interface RenglonExcel {
  archivo: string;
  empresa: string;
  quincena: string;       // "2026-07-2"
  bloque: string;         // "principal" | "servicios profesionales"
  nombre: string;
  cargo: string;
  mensual: number; qnal: number; e125: number; aus: number; tard: number; e150: number;
  exced: number; dom: number; fer: number; bruto: number; ss: number; se: number;
  isr: number; prest: number; terc: number; merc: number; totded: number; otros: number; neto: number;
  nota: string;
  rangoTitulo: string;
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function normalizarNombre(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Excel → código. Lo que no cruza EXACTO (normalizado) se declara acá, con el porqué. */
export const AMARRE: Record<string, { codigo: string; porque: string }> = {
  "KENER HERNANDEZ": { codigo: "17", porque: "ficha 17 KENNER HERNANDEZ (mismo sueldo $600 · 48 h · Boston)" },
  "CRISTIAN BLANCO": { codigo: "25", porque: "ficha 25 CRISTIAM BLANCO (la cédula en la nota del Excel dice CRISTIAM ANDRES BLANCO BERRIO)" },
  "JULICAR CORONA": { codigo: "15", porque: "ficha 15 YULICAR CORONA ($650 · 48 h · Boston)" },
  "ANDRES A GONZALEZ C": { codigo: "23", porque: "ficha 23 ANDRES GONZALEZ ($850 · 48 h · Boston)" },
  "LUZ LOPEZ": { codigo: "18", porque: "ficha 18 LUZ BOSQUEZ ($523,47 · seguros SÍ · única Luz de Boston)" },
  "LAURA L CASIANO V": { codigo: "38", porque: "ficha 38 Laura Lismari Casiano Vega" },
  "MARTA A CHAVARRIA": { codigo: "43", porque: "ficha 43 MARTHA ASUCENA CHAVARRIA Z." },
  "CARLOS RUIZ": { codigo: "44", porque: "ficha 44 CARLOS NOE RUIZ" },
  "LUIS BALLESTA": { codigo: "46", porque: "ficha 46 LUIS FERNANDO BALLESTA A." },
  "MARIA BETHANCOURT": { codigo: "49", porque: "ficha 49 MARIA V. BETHANCOURTH G." },
  "HECTOR L PEREZ A": { codigo: "48", porque: "ficha 48 HECTOR LEONEL PEREZ A." },
  "YERITZA Y SOLIS CASTRO": { codigo: "51", porque: "ficha 51 YERITZA YANETH SOLIS CASTRO" },
  "YEISHKA I DIAS M": { codigo: "54", porque: "ficha 54 YEISHKA IRENE DIAZ MARKHAM" },
  "JHONY FLORES": { codigo: "40", porque: "ficha 40 JHONNY FLORES" },
  "SAMUEL GOMEZ": { codigo: "41", porque: "ficha 41 SAMUEL ANTONIO GOMEZ ADAMES" },
  "JULIO GUZMAN": { codigo: "11", porque: "ficha 11 JULIO GARAY — su sueldo está repartido $800 Vistana + $200 Fashion Wear; el renglón de Vistana trae $800 y rata 5,77, y no existe ningún Guzmán en las fichas" },
  "LUCIA ANGELA GARCIA": { codigo: "7", porque: "ficha 7 ANGELA GARCIA ($800 · Vistana)" },
  "LUIS ADRIAN ARROYO": { codigo: "9", porque: "ficha 9 LUIS ARROYO ($566,52 · Vistana)" },
};

export function leerMatriz(archivo: string, empresa: string, quincena: string): RenglonExcel[] {
  const wb = XLSX.readFile(archivo);
  const sn = wb.SheetNames.find((s) => /30 de (julio|agosto)/i.test(s));
  if (!sn) throw new Error(`${archivo}: no encuentro la hoja de la matriz`);
  const ws = wb.Sheets[sn];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const out: RenglonExcel[] = [];
  let bloque = "principal";
  let rangoTitulo = "";
  let enTabla = false;
  for (const r of rows) {
    const a = typeof r[0] === "string" ? r[0].trim() : "";
    const l = typeof r[11] === "string" ? r[11].trim() : "";
    if (/^MATRIZ/i.test(a) && l) rangoTitulo = l;
    if (/^Servicios Profesionales/i.test(a)) bloque = "servicios profesionales";
    if (a === "Nombre") { enTabla = true; continue; }
    if (!enTabla) continue;
    if (typeof r[1] === "string" && /^Totales/i.test(r[1].trim())) { enTabla = false; continue; }
    if (!a) continue;
    out.push({
      archivo, empresa, quincena, bloque, nombre: a, cargo: String(r[1] ?? "").trim(), rangoTitulo,
      mensual: n(r[2]), qnal: n(r[3]), e125: n(r[4]), aus: n(r[5]), tard: n(r[6]), e150: n(r[7]),
      exced: n(r[8]), dom: n(r[9]), fer: n(r[10]), bruto: n(r[11]), ss: n(r[12]), se: n(r[13]),
      isr: n(r[14]), prest: n(r[15]), terc: n(r[16]), merc: n(r[17]), totded: n(r[18]), otros: n(r[19]), neto: n(r[20]),
      nota: String(r[21] ?? "").trim(),
    });
  }
  return out;
}

export const DIR = "/Users/daniellevy/.claude/jobs/a93eb587/tmp/planillas-jul/";
export const ARCHIVOS: Array<{ archivo: string; empresa: string; quincena: string }> = [
  { archivo: DIR + "BOSTON Planilla Quincenal -30 de julio de 2026.xlsx", empresa: "confecciones_boston", quincena: "2026-07-2" },
  { archivo: DIR + "FASHION WEAR Planilla Quincenal -30de julio de 2026.xlsx", empresa: "fashion_wear", quincena: "2026-07-2" },
  { archivo: DIR + "VIST ANA Planilla Quincenal -30 de julio de 2026.xlsx", empresa: "vistana", quincena: "2026-07-2" },
  { archivo: DIR + "BOSTON Planilla Quincenal -30 de agosto de 2026.xlsx", empresa: "confecciones_boston", quincena: "2026-08-2" },
  { archivo: DIR + "FASHION WEAR Planilla Quincenal -30 de agosto de 2026.xlsx", empresa: "fashion_wear", quincena: "2026-08-2" },
  { archivo: DIR + "VIST ANA Planilla Quincenal -30 de agosto de 2026.xlsx", empresa: "vistana", quincena: "2026-08-2" },
];

if (process.argv[1]?.endsWith("_backtest-planilla-jul-2026-excel.ts")) {
  for (const f of ARCHIVOS) {
    const rs = leerMatriz(f.archivo, f.empresa, f.quincena);
    console.log(`\n${f.quincena} ${f.empresa} (${rs.length}) título: «${rs[0]?.rangoTitulo}»`);
    for (const r of rs) {
      const nn = normalizarNombre(r.nombre);
      console.log(`  ${r.bloque.padEnd(24)} ${r.nombre.padEnd(26)} → ${nn.padEnd(24)} amarre=${AMARRE[nn]?.codigo ?? "-"} qnal ${r.qnal} neto ${r.neto} · Σded=${(r.ss+r.se+r.isr+r.prest+r.terc+r.merc).toFixed(4)} vs ${r.totded} · bruto−ded+otros=${(r.bruto-r.totded+r.otros).toFixed(4)}`);
    }
  }
}
