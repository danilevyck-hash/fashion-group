/**
 * La RUTA `/api/saldos-banco`, ejecutada de verdad.
 *
 * 🩸 POR QUÉ EXISTE, y no alcanzaba con el barrido estático: en la verificación
 * por mutación de este PR, cambiar el `return` del GET de
 * `{ bancos, historial }` a `{ bancos }` **no puso rojo NADA**. El candado de
 * texto miraba que el archivo importara y llamara a `historialPorEmpresa(...)`
 * — y eso seguía siendo cierto con el resultado calculado y tirado a la basura.
 * La pantalla habría perdido el historial y el aviso del saldo copiado en
 * silencio, que es exactamente lo que este PR vino a construir.
 *
 * Así que acá se LLAMA al handler real con la base mockeada y se mira el JSON.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// La sesión no es lo que se está probando: se da por buena.
vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "contabilidad", userName: "Contabilidad" }),
}));

/** Las filas de producción (13-ago-2026), con `saldo` como STRING — que es como
 *  las manda PostgREST para una columna `numeric`. Si la ruta no las convirtiera,
 *  la comparación de "repite exacto" trabajaría sobre texto. */
const FILAS = [
  { id: "1", empresa_key: "active_shoes", saldo: "62911.97", fecha_dato: "2026-06-30", created_by: "Contabilidad", created_at: "2026-08-10T15:55:00Z" },
  { id: "2", empresa_key: "active_shoes", saldo: "27647.97", fecha_dato: "2026-07-31", created_by: "Contabilidad", created_at: "2026-08-10T15:55:00Z" },
  { id: "3", empresa_key: "active_shoes", saldo: "27647.97", fecha_dato: "2026-08-10", created_by: "Contabilidad", created_at: "2026-08-10T17:57:00Z" },
  { id: "4", empresa_key: "fashion_wear", saldo: "189431.88", fecha_dato: "2026-06-30", created_by: "Contabilidad", created_at: "2026-08-10T14:30:00Z" },
  { id: "5", empresa_key: "fashion_wear", saldo: "317460.51", fecha_dato: "2026-07-31", created_by: "Contabilidad", created_at: "2026-08-10T14:33:00Z" },
];

const rango = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: () => ({
      select: () => ({
        order: () => ({ range: (...a: unknown[]) => rango(...a) }),
      }),
    }),
  },
}));

beforeEach(() => {
  rango.mockReset();
  rango.mockImplementation((desde: number) =>
    Promise.resolve(desde === 0 ? { data: FILAS, error: null, count: FILAS.length } : { data: [], error: null }),
  );
});

async function pedirGet() {
  const { GET } = await import("@/app/api/saldos-banco/route");
  const res = await GET({} as never);
  return (await res.json()) as {
    bancos: { empresa_key: string; saldo: number; fecha_dato: string }[];
    historial: Record<string, { fecha_dato: string; saldo: number; repiteAnterior: boolean; fechaAnterior: string | null }[]>;
  };
}

describe("GET /api/saldos-banco", () => {
  it("🔴 devuelve el HISTORIAL, no solo el último saldo", () => {
    return pedirGet().then((json) => {
      expect(json.historial).toBeTruthy();
      expect(Object.keys(json.historial).sort()).toEqual(["active_shoes", "fashion_wear"]);
      expect(json.historial.active_shoes).toHaveLength(3);
    });
  });

  it("marca la carga del 10-ago como copia de la del 31-jul", () => {
    return pedirGet().then((json) => {
      const [ultima, previa] = json.historial.active_shoes;
      expect(ultima.fecha_dato).toBe("2026-08-10");
      expect(ultima.repiteAnterior).toBe(true);
      expect(ultima.fechaAnterior).toBe("2026-07-31");
      // Y la del 31-jul NO repite: la de junio era otro monto.
      expect(previa.repiteAnterior).toBe(false);
    });
  });

  it("la empresa que no copió no queda marcada", () => {
    return pedirGet().then((json) => {
      expect(json.historial.fashion_wear.every((c) => !c.repiteAnterior)).toBe(true);
    });
  });

  it("`saldo` viaja como NÚMERO, no como el string de PostgREST", () => {
    return pedirGet().then((json) => {
      expect(typeof json.bancos[0].saldo).toBe("number");
      expect(typeof json.historial.active_shoes[0].saldo).toBe("number");
    });
  });

  it("🔴 el último saldo por empresa NO se movió: sigue siendo la fecha más reciente", () => {
    return pedirGet().then((json) => {
      const porEmpresa = new Map(json.bancos.map((b) => [b.empresa_key, b]));
      expect(porEmpresa.get("active_shoes")).toEqual({
        empresa_key: "active_shoes",
        saldo: 27647.97,
        fecha_dato: "2026-08-10",
      });
      expect(porEmpresa.get("fashion_wear")).toEqual({
        empresa_key: "fashion_wear",
        saldo: 317460.51,
        fecha_dato: "2026-07-31",
      });
    });
  });

  it("pagina de verdad: pide la 2ª página y verifica contra el COUNT", async () => {
    // `db-max-rows` = 1000 corta EN SILENCIO, y acá un truncado se vería como
    // "esta empresa no tiene saldo". El helper pide páginas hasta agotar.
    await pedirGet();
    expect(rango.mock.calls[0]).toEqual([0, 999]);
    expect(rango.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("si la lectura falla, la ruta NO devuelve medio historial", async () => {
    rango.mockImplementation(() => Promise.resolve({ data: null, error: { message: "boom" }, count: null }));
    const { GET } = await import("@/app/api/saldos-banco/route");
    const res = await GET({} as never);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.historial).toBeUndefined();
    expect(json.error).toMatch(/No se pudieron cargar los saldos/);
  });
});
