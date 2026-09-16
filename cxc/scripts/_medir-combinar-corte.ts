/* SOLO LECTURA. Combina la quincena (sueldo, seguros, descuentos) con el
 * ajuste de los días que la quincena anterior pagó sin medir (29–31 ago),
 * usando el MISMO `aplicarAjusteEnLinea` de producción: cero aritmética nueva.
 *   npx tsx scripts/_medir-combinar-corte.ts <quincena.json> <ajuste.json> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { aplicarAjusteEnLinea, repartirAjuste } from "@/lib/asistencia/corte-quincena";

const [fQ, fA, salida] = process.argv.slice(2);
const Q = JSON.parse(readFileSync(fQ, "utf8"));
const A = JSON.parse(readFileSync(fA, "utf8"));
const ajusteDe = new Map<string, any>(A.personas.map((p: any) => [`${p.linea}|${p.codigo}`, p]));
const dias = { desde: A.desde, hasta: A.hasta };
const pct = { seguroSocialPct: Q.reglas.seguroSocialPct, seguroEducativoPct: Q.reglas.seguroEducativoPct };

const personas = Q.personas.map((p: any) => {
  const a = ajusteDe.get(`${p.linea}|${p.codigo}`);
  const con = aplicarAjusteEnLinea(p as any, a?.dinero ?? null, dias, pct) as any;
  return {
    ...con,
    ajusteReparto: a ? repartirAjuste(a.dinero) : {},
    relojAjuste: a ? {
      extraMin: a.extraMin, tardanzaMin: a.tardanzaMin,
      salidaTempranaMin: a.salidaTempranaMin, ausenciasDias: a.ausenciasDias,
      diasConMarca: a.diasConMarca,
    } : null,
  };
});
writeFileSync(salida, JSON.stringify({
  base: { desde: Q.desde, hasta: Q.hasta, corte: Q.corte },
  ajuste: dias, pct, reglas: Q.reglas,
  sinAjuste: A.personas.filter((a: any) => !Q.personas.some((p: any) => `${p.linea}|${p.codigo}` === `${a.linea}|${a.codigo}`)).map((a: any) => a.codigo),
  prestamos: Q.prestamos, personas,
}, null, 1));
console.log(`${salida}: ${personas.length} líneas · quincena ${Q.desde}→${Q.hasta} (corte ${Q.corte}) + ajuste ${dias.desde}→${dias.hasta}`);
