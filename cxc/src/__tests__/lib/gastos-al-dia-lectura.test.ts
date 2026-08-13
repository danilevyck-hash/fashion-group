/**
 * `leerEgresosMes` ejecutada de verdad — el indicador tiene que VIAJAR.
 *
 * 🩸 POR QUÉ EXISTE, y no es hipotético: en la verificación por mutación de este
 * PR, **DOS cambios no pusieron rojo NADA** y los dos vivían acá, en la capa de
 * lectura, que no tenía un solo test:
 *   1. Borrar la línea que agrega `alDia` a cada empresa → la pantalla se queda
 *      SIN el indicador entero, en silencio (`fraseAlDia` devuelve `null` ante
 *      un `alDia` ausente, que es lo correcto para un payload viejo y aquí sería
 *      el bug perfecto: la función tolerante tapa la ruta rota).
 *   2. Dejar de filtrar la serie a GASTO (grupo 6) → el "lo habitual acá" se
 *      calcularía sobre TODO lo que salió de caja (transferencias entre cuentas
 *      propias, pagos intercompañía, planilla por pagar), o sea contra un número
 *      que no es el que la pantalla muestra al lado.
 *
 * Los candados puros cubrían la matemática y los de componente la pantalla; en
 * el medio quedaba el cable. Acá se llama al lector real con la base mockeada y
 * se mira lo que sale.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cuentas/leer", () => ({
  leerNombresDeCuentas: async () => new Map(),
}));

/** Los renglones de `egresos_varios`, con `total` como STRING (numeric de
 *  PostgREST) y con cuentas de los DOS grupos: 6 es gasto, 2 no. */
const RENGLONES = [
  // fashion_wear — ene a may. Mayo trae el 10% de lo habitual (caso real).
  { id: "1", empresa_key: "fashion_wear", mes: "2026-01-01", fecha: "2026-01-15", n_interno: "1", cuenta: "6.02.01.00.00", sucursal: null, proveedor: null, referencia: null, total: "6482.97", linea_nro: 0 },
  { id: "2", empresa_key: "fashion_wear", mes: "2026-02-01", fecha: "2026-02-15", n_interno: "2", cuenta: "6.02.01.00.00", sucursal: null, proveedor: null, referencia: null, total: "2262.80", linea_nro: 0 },
  { id: "3", empresa_key: "fashion_wear", mes: "2026-03-01", fecha: "2026-03-15", n_interno: "3", cuenta: "6.02.01.00.00", sucursal: null, proveedor: null, referencia: null, total: "2701.29", linea_nro: 0 },
  { id: "4", empresa_key: "fashion_wear", mes: "2026-04-01", fecha: "2026-04-15", n_interno: "4", cuenta: "6.02.01.00.00", sucursal: null, proveedor: null, referencia: null, total: "27.18", linea_nro: 0 },
  { id: "5", empresa_key: "fashion_wear", mes: "2026-05-01", fecha: "2026-05-15", n_interno: "5", cuenta: "6.02.01.00.00", sucursal: null, proveedor: null, referencia: null, total: "257.43", linea_nro: 0 },
  // 🔴 vistana — el gasto real es CHICO (~$1.000/mes) y las transferencias entre
  // cuentas propias son ENORMES ($90.000 en ene, feb y mar). Los montos están
  // elegidos para que la mutación CAMBIE el resultado, que es lo único que hace
  // valer el candado: filtrando a grupo 6, lo habitual es $1.000 y abril ($950)
  // es un mes normal; sin filtrar, lo habitual sería $91.000 y abril quedaría
  // marcado "puede estar a medio cargar" siendo perfectamente sano.
  { id: "6", empresa_key: "vistana", mes: "2026-01-01", fecha: "2026-01-10", n_interno: "6", cuenta: "6.03.07.00.00", sucursal: null, proveedor: null, referencia: null, total: "1000.00", linea_nro: 0 },
  { id: "7", empresa_key: "vistana", mes: "2026-01-01", fecha: "2026-01-11", n_interno: "7", cuenta: "2.01.04.02.00", sucursal: null, proveedor: null, referencia: null, total: "90000.00", linea_nro: 0 },
  { id: "8", empresa_key: "vistana", mes: "2026-02-01", fecha: "2026-02-10", n_interno: "8", cuenta: "6.03.07.00.00", sucursal: null, proveedor: null, referencia: null, total: "1000.00", linea_nro: 0 },
  { id: "8b", empresa_key: "vistana", mes: "2026-02-01", fecha: "2026-02-11", n_interno: "8b", cuenta: "2.01.04.02.00", sucursal: null, proveedor: null, referencia: null, total: "90000.00", linea_nro: 0 },
  { id: "9", empresa_key: "vistana", mes: "2026-03-01", fecha: "2026-03-10", n_interno: "9", cuenta: "6.03.07.00.00", sucursal: null, proveedor: null, referencia: null, total: "1000.00", linea_nro: 0 },
  { id: "9b", empresa_key: "vistana", mes: "2026-03-01", fecha: "2026-03-11", n_interno: "9b", cuenta: "2.01.04.02.00", sucursal: null, proveedor: null, referencia: null, total: "90000.00", linea_nro: 0 },
  { id: "10", empresa_key: "vistana", mes: "2026-04-01", fecha: "2026-04-10", n_interno: "10", cuenta: "6.03.07.00.00", sucursal: null, proveedor: null, referencia: null, total: "950.00", linea_nro: 0 },
];

const IMPORTACIONES = [
  { empresa_key: "fashion_wear", rango_desde: "2026-01-01", rango_hasta: "2026-08-13" },
  { empresa_key: "vistana", rango_desde: "2026-01-01", rango_hasta: "2026-08-13" },
];

/** Doble de PostgREST: encadenable, y devuelve según la tabla y los filtros. */
function tabla(nombre: string) {
  const estado = { eqMes: null as string | null };
  const api: Record<string, unknown> = {};
  const chain = () => api;
  api.select = chain;
  api.limit = () => Promise.resolve({ data: [], error: null });
  api.eq = (col: string, val: string) => {
    if (col === "mes") estado.eqMes = val;
    return api;
  };
  api.order = chain;
  api.range = (desde: number) => {
    if (desde > 0) return Promise.resolve({ data: [], error: null });
    if (nombre === "egresos_importaciones") {
      return Promise.resolve({ data: IMPORTACIONES, error: null, count: IMPORTACIONES.length });
    }
    const filas = estado.eqMes ? RENGLONES.filter((r) => r.mes === estado.eqMes) : RENGLONES;
    return Promise.resolve({ data: filas, error: null, count: filas.length });
  };
  return api;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (nombre: string) => tabla(nombre) },
}));

// El mes en curso: agosto de 2026, el día en que se midió todo esto.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-13T18:00:00Z"));
});

async function leer(mes: string) {
  const { leerEgresosMes } = await import("@/lib/egresos/leer");
  const r = await leerEgresosMes(mes);
  return new Map(r.empresas.map((e) => [e.empresaKey, e]));
}

describe("el indicador VIAJA hasta la pantalla", () => {
  it("🔴 cada empresa trae su `alDia` — las 8, también las que no tienen nada", async () => {
    const porEmpresa = await leer("2026-03");
    expect(porEmpresa.size).toBe(8);
    for (const [key, e] of porEmpresa) {
      expect(e.alDia, `${key} se quedó sin alDia`).toBeTruthy();
      expect(typeof e.alDia.estado).toBe("string");
    }
  });

  it("dice hasta dónde llegó cada una, con los datos reales", async () => {
    const porEmpresa = await leer("2026-03");
    expect(porEmpresa.get("fashion_wear")!.alDia).toEqual({
      estado: "quizas_incompleto",
      mes: "2026-05",
      gastoCent: 25_743,
      habitualCent: 248_205,
    });
    expect(porEmpresa.get("vistana")!.alDia).toEqual({ estado: "al_dia", mes: "2026-04" });
  });

  it("🔴 las que no tienen NI UNA fila dicen `sin_nada`, no un mes inventado", async () => {
    const porEmpresa = await leer("2026-03");
    for (const key of ["active_shoes", "joystep", "american_classic", "confecciones_boston", "fashion_shoes", "active_wear"]) {
      expect(porEmpresa.get(key)!.alDia, key).toEqual({ estado: "sin_nada" });
    }
  });

  it("🔴 'lo habitual' sale SOLO del GASTO (grupo 6), no de todo lo que salió de caja", async () => {
    // vistana movió $90.000 de transferencias en enero contra $1.000 de gasto.
    // Sin el filtro, la mediana se dispararía y su abril ($950) quedaría marcado
    // como "puede estar a medio cargar" siendo un mes perfectamente normal.
    const vistana = (await leer("2026-03")).get("vistana")!;
    expect(vistana.alDia.estado).toBe("al_dia");
    expect(JSON.stringify(vistana.alDia)).not.toContain("habitualCent");
  });

  it("el `alDia` NO depende del mes que se esté mirando", async () => {
    // Es la pregunta "¿por dónde va la contadora?", no "¿qué pasó en marzo?".
    const marzo = (await leer("2026-03")).get("fashion_wear")!.alDia;
    const julio = (await leer("2026-07")).get("fashion_wear")!.alDia;
    expect(julio).toEqual(marzo);
  });

  it("`ultimoMesConMovimientos` y `alDia.mes` no pueden contradecirse", async () => {
    // Salen de la MISMA lectura: si divergieran, la fila diría dos meses.
    for (const [, e] of await leer("2026-03")) {
      if (e.alDia.estado === "sin_nada") {
        expect(e.ultimoMesConMovimientos).toBeNull();
      } else {
        expect(e.ultimoMesConMovimientos).toBe(e.alDia.mes);
      }
    }
  });
});
