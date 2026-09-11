/**
 * 🔴 LA PLANILLA QUE VE DAVID = LA QUE VE YULISSA — contra la DB de PRODUCCIÓN,
 * solo lectura (11-sep-2026).
 *
 * Llama al handler REAL de `/api/asistencia/planilla` dos veces para la misma
 * quincena de Confecciones Boston: como la contadora (admin, con el corte que
 * la Planilla del grupo propone) y como David (`gerente_boston`, con el MISMO
 * corte, que es lo que su pestaña manda desde hoy). El neto de cada persona
 * tiene que ser IDÉNTICO. Y de paso mide lo que corrige el arreglo: cuánto
 * cambiaba el neto cuando Boston pedía SIN corte.
 *
 * NO corre en `npm test` por defecto:
 *   RUN_DB_TESTS=1 npx vitest run src/__tests__/integration/boston-planilla-mismos-numeros.test.ts
 *
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y SESSION_SECRET.
 * ⚠️ NO ESCRIBE NADA: el GET de la planilla solo calcula.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

const RUN = !!process.env.RUN_DB_TESTS;
const DESDE = process.env.BOSTON_DESDE ?? "2026-09-01";
const HASTA = process.env.BOSTON_HASTA ?? "2026-09-15";

function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i > 0 && !line.trim().startsWith("#")) {
        const k = line.slice(0, i).trim();
        if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
      }
    }
  } catch { /* sin .env.local → el test se salta */ }
  // La cookie se firma y se verifica en ESTE proceso con el mismo secreto: no
  // hace falta el de producción (y no debe estar en .env.local).
  if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = "medicion-local";
}

type Linea = { codigo: string; etiqueta: string; dinero: { netoPagar: number; totalBruto: number; salidaTemprana?: number } | null };

describe.skipIf(!RUN)("Boston: David y Yulissa ven los mismos netos para la misma quincena", () => {
  let GET: (req: NextRequest) => Promise<Response>;
  let sign: (p: Record<string, unknown>) => string;
  let corteSugerido: string;

  beforeAll(async () => {
    loadEnv();
    process.env.NEXT_PUBLIC_PLANILLA_UNIDA = "1";
    ({ GET } = await import("@/app/api/asistencia/planilla/route"));
    ({ signSession: sign } = await import("@/lib/session-cookie"));
    const { corteParaBoston } = await import("@/lib/boston/planilla-corte");
    corteSugerido = corteParaBoston(DESDE, HASTA, null, true)!;
  });

  async function cuadro(role: string, params: Record<string, string>): Promise<Linea[]> {
    const cookie = sign({ role, userId: "medicion", userName: role === "admin" ? "daniel" : "david", sessionToken: "medicion", modules: ["asistencia", "boston"] });
    const url = new URL("https://fashiongr.com/api/asistencia/planilla");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await GET(new NextRequest(url, { headers: { cookie: `cxc_session=${cookie}` } }));
    expect(res.status).toBe(200);
    return ((await res.json()) as { lineas: Linea[] }).lineas;
  }

  const netos = (ls: Linea[]) => new Map(ls.filter((l) => l.dinero).map((l) => [l.codigo, l.dinero!.netoPagar]));

  it("🔴 con el MISMO corte, neto por neto idénticos (y se imprime la medición)", { timeout: 120_000 }, async () => {
    const yulissa = await cuadro("admin", { empresa: "confecciones_boston", desde: DESDE, hasta: HASTA, corte: corteSugerido });
    const david = await cuadro("gerente_boston", { desde: DESDE, hasta: HASTA, corte: corteSugerido });
    const davidAntes = await cuadro("gerente_boston", { desde: DESDE, hasta: HASTA });
    const nY = netos(yulissa), nD = netos(david), nA = netos(davidAntes);
    expect(nD.size).toBeGreaterThan(0);
    expect([...nD.keys()].sort()).toEqual([...nY.keys()].sort());
    let distintosAntes = 0;
    const filas: string[] = [];
    for (const [codigo, neto] of nY) {
      expect(nD.get(codigo), `neto de ${codigo}`).toBe(neto);
      const antes = nA.get(codigo);
      if (antes !== neto) distintosAntes++;
      const et = yulissa.find((l) => l.codigo === codigo)?.etiqueta ?? codigo;
      filas.push(`${et.padEnd(28)} Yulissa ${neto.toFixed(2).padStart(9)}  David ${String(nD.get(codigo)!.toFixed(2)).padStart(9)}  David-sin-corte ${String(antes?.toFixed(2) ?? "—").padStart(9)}`);
    }
    const suma = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    process.stderr.write("\n" + [
      `Boston ${DESDE}..${HASTA} · corte ${corteSugerido} · ${nY.size} personas`,
      ...filas,
      `TOTAL  Yulissa ${suma(nY).toFixed(2)} · David ${suma(nD).toFixed(2)} · David sin corte (antes) ${suma(nA).toFixed(2)}`,
      `Personas cuyo neto cambiaba sin corte: ${distintosAntes} de ${nY.size}`,
      `Columna «Salida temprana» con plata: ${yulissa.filter((l) => (l.dinero?.salidaTemprana ?? 0) > 0).length} personas`,
    ].join("\n") + "\n");
  });
});
