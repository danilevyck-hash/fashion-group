// ─────────────────────────────────────────────────────────────────────────────
// MULTIFASHION · «REDES Sheynee» ES SHEYNEE — el candado (18-sep-2026)
//
// Daniel: *«tendría que sumarse ambos vendedores para lo de la comisión ya que
// sigue siendo la misma persona»* · *«quiero el sistema limpio y minimalista»*.
//
// Lo que este archivo no deja romper:
//   1. 🔴 EL CANAL NO SE DEDUCE DEL NOMBRE. Es una columna del amarre
//      (`multifashion_vendedora_alias.canal`), escrita a mano, con lista
//      cerrada; la función que lo resuelve lee la tabla y nada más.
//   2. 🔴 UNA SOLA FILA EN EL RANKING. La v5 agrupa por persona y el canal es
//      un desglose ADENTRO de esa fila (`por_canal`); ventas, tickets y
//      comisión salen juntos. La pantalla dibuja «tienda $X · redes $Y» solo
//      cuando hay algo que desglosar.
//   3. 🔴 EL BONO USA EL TOTAL JUNTO. `multifashion_bonos_v4` agrupa por
//      `vendedor_canonico` y esta migración no lo toca.
//   4. 🔴 METAS USA EL CANÓNICO. `multifashion_meta_ventas_v2` devuelve la
//      persona, no el texto crudo; la lectura pide la v2 y cae a la v1 SOLO si
//      no existe.
//   5. El amarre 15 → 11 viaja en la migración, con soft delete y sin DELETE.
//   6. Las tres notas viejas de la doc quedaron corregidas.
//
// Verificación por mutación: `scripts/_mutar-candados-redes-canal.sh`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const raiz = process.cwd();
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const sinComentariosSql = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");

const dobleSupabase = vi.hoisted(() => ({
  from: vi.fn(() => {
    throw new Error("este test no debe tocar la base");
  }),
  rpc: vi.fn(() => {
    throw new Error("este test no debe tocar la base");
  }),
}));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: dobleSupabase }));

import {
  CANALES,
  ROTULO_TIENDA,
  desgloseCanales,
} from "@/lib/multifashion/canales";
import { leerVentasDelPeriodo, totalDeParticipantes } from "@/lib/multifashion/metas-lectura";

const MIGRACION = "supabase/migrations/20261209120000_multifashion_vendedora_canal.sql";
const sql = leer(MIGRACION);
const sqlCodigo = sinComentariosSql(sql);
const sqlAlias = leer("supabase/migrations/20261009120000_multifashion_vendedora_alias.sql");
const canales = leer("src/lib/multifashion/canales.ts");
const pantalla = leer("src/components/multifashion/VendedorasSubtab.tsx");
const rutaVendedoras = leer("src/app/api/multifashion/vendedoras/route.ts");
const rutaBonos = leer("src/app/api/multifashion/bonos/route.ts");
const bonosSection = leer("src/components/multifashion/BonosSection.tsx");
const lectura = leer("src/lib/multifashion/metas-lectura.ts");

/** El cuerpo de UNA función de un archivo SQL, hasta su `$function$;`. */
function cuerpoFn(src: string, nombre: string): string {
  const i = src.indexOf(`CREATE OR REPLACE FUNCTION public.${nombre}(`);
  expect(i, `no está ${nombre}`).toBeGreaterThanOrEqual(0);
  const fin = src.indexOf("$function$;", i);
  return src.slice(i, fin);
}

// ─────────────────────────────────────────────────────────────────────────────
describe("1 · el canal NO se deduce del nombre", () => {
  it("es una columna del amarre, con lista CERRADA", () => {
    expect(sqlCodigo).toContain("ADD COLUMN IF NOT EXISTS canal text");
    expect(sqlCodigo).toContain("CHECK (canal IS NULL OR canal IN ('redes'))");
  });

  it("🔴 la función lee la TABLA por código, y nada más", () => {
    const i = sqlCodigo.indexOf("FUNCTION public.multifashion_vendedora_canal(");
    expect(i).toBeGreaterThanOrEqual(0);
    const cuerpo = sqlCodigo.slice(i, sqlCodigo.indexOf("$$;", i));
    expect(cuerpo).toContain("FROM public.multifashion_vendedora_alias a");
    expect(cuerpo).toContain("a.activo AND a.codigo_switch = p_codigo AND a.canal IS NOT NULL");
    expect(cuerpo).not.toMatch(/nombre/i);
  });

  it("🔴 en toda la migración no hay una sola comparación de texto por parecido", () => {
    expect(sqlCodigo).not.toMatch(/\bI?LIKE\b/);
    expect(sqlCodigo).not.toMatch(/SIMILAR TO/);
    expect(sqlCodigo).not.toMatch(/\s~\*?\s/);
    expect(sqlCodigo).not.toMatch(/vendedor_nombre\s*(=|<>|IN)/);
  });

  it("la lista del código es espejo del CHECK: solo «redes», y la tienda se llama tienda", () => {
    expect(Object.keys(CANALES)).toEqual(["redes"]);
    expect(CANALES.redes).toBe("redes");
    expect(ROTULO_TIENDA).toBe("tienda");
  });

  it("🔴 el texto de la pantalla se arma SIN el nombre de nadie", () => {
    // Dos argumentos: el total y lo que la base dijo por canal. Ni un nombre.
    expect(desgloseCanales.length).toBe(2);
    const codigo = sinComentarios(canales);
    expect(codigo).not.toMatch(/nombre/i);
    expect(codigo).not.toMatch(/REDES/);
    expect(codigo).not.toMatch(/includes\(|toUpperCase|match\(|test\(/);
    // Y la pantalla tampoco mira el nombre para decidir el desglose.
    const componente = sinComentarios(pantalla);
    expect(componente).not.toMatch(/REDES/);
    expect(componente).not.toMatch(/nombre[^\n]*includes/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2 · una sola fila en el ranking, con el desglose adentro", () => {
  // El comentario de tres líneas que explica el CTE (empieza en su sangría).
  const cabecera = / *-- Primero por \(persona, canal\)[\s\S]*?para las demás va NULL\.\n/g;
  const ACTUAL_CON_CANAL =
    "  WITH por_persona_y_canal AS (\n" +
    "    SELECT vendedor_canonico AS vendedor, vendedor_canal AS canal,\n" +
    "      SUM(subtotal) AS ventas, COUNT(*) AS tickets,\n" +
    "      SUM(subtotal_comision) AS base_comision\n" +
    "    FROM _multifashion_sf_vw\n" +
    "    WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin\n" +
    "      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'\n" +
    "    GROUP BY vendedor_canonico, vendedor_canal\n" +
    "  ),\n" +
    "  actual AS (\n" +
    "    SELECT vendedor,\n" +
    "      SUM(ventas) AS ventas, SUM(tickets)::bigint AS tickets,\n" +
    "      SUM(base_comision) AS base_comision,\n" +
    "      jsonb_object_agg(canal, ventas) FILTER (WHERE canal IS NOT NULL) AS por_canal\n" +
    "    FROM por_persona_y_canal\n" +
    "    GROUP BY vendedor\n" +
    "  ),";
  const FILA_CON_CANAL =
    "      'comision', a.base_comision * 0.005,\n" +
    "      'por_canal', a.por_canal,\n" +
    "      'manager', v_managers ? a.vendedor,";

  it("🔴 la v5 ES la v4 con el desglose, y NADA MÁS (byte a byte)", () => {
    const v4 = cuerpoFn(sqlAlias, "multifashion_vendedoras_v4");
    const v5 = cuerpoFn(sql, "multifashion_vendedoras_v5").replace(cabecera, "");
    const esperado = v4
      .replace("multifashion_vendedoras_v4(", "multifashion_vendedoras_v5(")
      .replace(
        "  WITH actual AS (\n" +
          "    SELECT vendedor_canonico AS vendedor,\n" +
          "      SUM(subtotal) AS ventas, COUNT(*) AS tickets,\n" +
          "      SUM(subtotal_comision) AS base_comision\n" +
          "    FROM _multifashion_sf_vw\n" +
          "    WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin\n" +
          "      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'\n" +
          "    GROUP BY vendedor_canonico\n" +
          "  ),",
        ACTUAL_CON_CANAL,
      )
      .replace(
        "      'comision', a.base_comision * 0.005,\n      'manager', v_managers ? a.vendedor,",
        FILA_CON_CANAL,
      );
    expect(v5).toBe(esperado);
  });

  it("🔴 la ventana rodante (range_v3) ES la range_v2 con el desglose, y NADA MÁS", () => {
    const v2 = cuerpoFn(sqlAlias, "multifashion_vendedoras_range_v2");
    const v3 = cuerpoFn(sql, "multifashion_vendedoras_range_v3").replace(cabecera, "");
    const esperado = v2
      .replace("multifashion_vendedoras_range_v2(", "multifashion_vendedoras_range_v3(")
      .replace(
        "  WITH actual AS (\n" +
          "    SELECT vendedor_canonico AS vendedor,\n" +
          "      SUM(subtotal) AS ventas, COUNT(*) AS tickets, SUM(subtotal_comision) AS base_comision\n" +
          "    FROM _multifashion_sf_vw\n" +
          "    WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin\n" +
          "      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'\n" +
          "    GROUP BY vendedor_canonico\n" +
          "  ),",
        ACTUAL_CON_CANAL,
      )
      .replace(
        "      'comision', a.base_comision * 0.005,\n      'manager', v_managers ? a.vendedor,",
        FILA_CON_CANAL,
      );
    expect(v3).toBe(esperado);
  });

  it("la persona es UNA fila: el canal se agrupa adentro, no aparte", () => {
    for (const fn of ["multifashion_vendedoras_v5", "multifashion_vendedoras_range_v3"]) {
      const cuerpo = cuerpoFn(sql, fn);
      expect(cuerpo).toContain("GROUP BY vendedor_canonico, vendedor_canal");
      expect(cuerpo).toContain("    GROUP BY vendedor\n");
      expect(cuerpo).toContain("jsonb_object_agg(canal, ventas) FILTER (WHERE canal IS NOT NULL) AS por_canal");
      expect(cuerpo).toContain("'por_canal', a.por_canal,");
      // La comisión sigue saliendo de la MISMA base: contado, 0,5 %.
      expect(cuerpo).toContain("SUM(subtotal_comision) AS base_comision");
      expect(cuerpo).toContain("'comision', a.base_comision * 0.005,");
    }
  });

  it("la vista expone `vendedor_canal` AL FINAL, resuelto por la función", () => {
    const i = sqlCodigo.indexOf("CREATE OR REPLACE VIEW public._multifashion_sf_vw");
    const cuerpo = sqlCodigo.slice(i, sqlCodigo.indexOf("FROM switch_facturas", i));
    expect(cuerpo).toContain("public.multifashion_vendedora_canal(vendedor_switch_id) AS vendedor_canal");
    expect(cuerpo.indexOf("AS vendedor_canonico")).toBeLessThan(cuerpo.indexOf("AS vendedor_canal"));
  });

  it("la ruta pide la v5 y CAE a la v4 y a la v3; la rodante, v3 → v2 → v1", () => {
    const codigo = sinComentarios(rutaVendedoras);
    const iV5 = codigo.indexOf('rpc("multifashion_vendedoras_v5"');
    const iV4 = codigo.indexOf('rpc("multifashion_vendedoras_v4"');
    const iV3 = codigo.indexOf('rpc("multifashion_vendedoras_v3"');
    expect(iV5).toBeGreaterThanOrEqual(0);
    expect(iV5).toBeLessThan(iV4);
    expect(iV4).toBeLessThan(iV3);
    expect(codigo).toContain("if (!v5.error) return v5;");
    const iR3 = codigo.indexOf('rpc("multifashion_vendedoras_range_v3"');
    const iR2 = codigo.indexOf('rpc("multifashion_vendedoras_range_v2"');
    const iR1 = codigo.indexOf('rpc("multifashion_vendedoras_range"');
    expect(iR3).toBeGreaterThanOrEqual(0);
    expect(iR3).toBeLessThan(iR2);
    expect(iR2).toBeLessThan(iR1);
    expect(codigo).toContain("if (!v3.error) return v3;");
  });

  it("🔴 la pantalla dibuja el desglose desde `por_canal`, en la fila Y en la tarjeta", () => {
    const codigo = sinComentarios(pantalla);
    expect(codigo).toContain('import { desgloseCanales } from "@/lib/multifashion/canales";');
    const usos = codigo.split("desgloseCanales(v.ventas, v.por_canal)").length - 1;
    expect(usos).toBe(2);
    expect(codigo.split("{desglose && (").length - 1).toBe(2);
    expect(codigo.split("data-desglose-canal").length - 1).toBe(2);
    // La fila sigue siendo una por nombre canónico.
    expect(codigo.split("key={v.nombre}").length - 1).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2b · el texto «tienda $X · redes $Y»", () => {
  it("con lo de redes, dice las dos partes y suman la fila", () => {
    expect(desgloseCanales(9117.73, { redes: 1717.73 })).toBe("tienda $7,400.00 · redes $1,717.73");
  });

  it("acepta el número como texto (así llega el numeric por JSON)", () => {
    expect(desgloseCanales(9117.73, { redes: "1717.73" })).toBe("tienda $7,400.00 · redes $1,717.73");
  });

  it("🔴 sin nada que desglosar no dice NADA: ni null, ni {}, ni un canal vacío", () => {
    expect(desgloseCanales(5651.06, null)).toBeNull();
    expect(desgloseCanales(5651.06, undefined)).toBeNull();
    expect(desgloseCanales(5651.06, {})).toBeNull();
    expect(desgloseCanales(5651.06, { redes: null })).toBeNull();
  });

  it("un canal que no está en la lista cerrada no se dibuja", () => {
    expect(desgloseCanales(100, { whatsapp: 40 } as never)).toBeNull();
  });

  it("la tienda es lo que queda: total − canales, al centavo", () => {
    expect(desgloseCanales(100, { redes: 100 })).toBe("tienda $0.00 · redes $100.00");
    expect(desgloseCanales(50.1, { redes: 0.2 })).toBe("tienda $49.90 · redes $0.20");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3 · el bono usa el total junto", () => {
  it("esta migración NO redefine el bono", () => {
    expect(sqlCodigo).not.toContain("multifashion_bonos");
  });

  it("la v4 del bono (la que sigue viva) agrupa por la persona, no por el código", () => {
    const bono = cuerpoFn(sqlAlias, "multifashion_bonos_v4");
    expect(bono).toContain("GROUP BY vendedor_canonico");
    expect(bono).not.toContain("vendedor_canal");
    expect(bono).toContain("AND j.ventas = mx.m");
  });

  it("la ruta y la sección del bono siguen en la v4, sin mirar canales", () => {
    expect(rutaBonos).toContain('supabaseServer.rpc("multifashion_bonos_v4"');
    expect(sinComentarios(rutaBonos)).not.toContain("por_canal");
    expect(sinComentarios(bonosSection)).not.toContain("por_canal");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4 · Metas usa el canónico", () => {
  const FILAS_V2 = [
    { vendedor: "Sheynee Batista", mes: "2026-09", ventas: "9117.73", documentos: 217, ultima: "2026-09-18" },
    { vendedor: "Sheynee Batista", mes: "2026-09", ventas: "1717.73", documentos: 3, ultima: "2026-09-20" },
    { vendedor: "Jailine", mes: "2026-09", ventas: "5651.06", documentos: 123, ultima: "2026-09-18" },
    { vendedor: "DEFAULT", mes: "2026-09", ventas: "296.425", documentos: 1, ultima: "2026-09-05" },
  ];
  // Lo que devolvería la v1: el texto crudo, con «REDES Sheynee» aparte.
  const FILAS_V1 = [
    { vendedor: "Sheynee Batista", mes: "2026-09", ventas: "9117.73", documentos: 217, ultima: "2026-09-18" },
    { vendedor: "REDES Sheynee", mes: "2026-09", ventas: "1717.73", documentos: 3, ultima: "2026-09-20" },
    { vendedor: "Jailine", mes: "2026-09", ventas: "5651.06", documentos: 123, ultima: "2026-09-18" },
    { vendedor: "DEFAULT", mes: "2026-09", ventas: "296.425", documentos: 1, ultima: "2026-09-05" },
  ];
  const AUSENTE = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };

  afterEach(() => {
    dobleSupabase.rpc.mockReset();
    dobleSupabase.rpc.mockImplementation(() => {
      throw new Error("este test no debe tocar la base");
    });
  });

  it("la migración devuelve la PERSONA, con los mismos filtros de la v1", () => {
    const v2 = sqlCodigo.slice(sqlCodigo.indexOf("FUNCTION public.multifashion_meta_ventas_v2("));
    expect(v2).toContain("COALESCE(v.vendedor_canonico, '') AS vendedor");
    expect(v2).toContain("WHERE v.is_wholesale = false");
    expect(v2).toContain("GROUP BY 1, 2");
    expect(v2).not.toContain("COALESCE(v.vendedor, '')");
  });

  it("🔴 pide la v2 primero, y con ella lo de redes cae en Sheynee", async () => {
    dobleSupabase.rpc.mockImplementation((async (fn: string) => {
      if (fn === "multifashion_meta_ventas_v2") return { data: FILAS_V2, error: null };
      if (fn === "multifashion_meta_ventas_v1") return { data: FILAS_V1, error: null };
      throw new Error(`RPC inesperada: ${fn}`);
    }) as never);
    const r = await leerVentasDelPeriodo("2026-09-01", "2026-12-31");
    expect(r.fuente).toBe("rpc");
    const porClave = totalDeParticipantes(r.filas, ["SHEYNEE BATISTA", "JAILINE"]);
    expect(porClave.get("SHEYNEE BATISTA")).toBe(10835.46);
    expect(porClave.get("JAILINE")).toBe(5651.06);
    expect(dobleSupabase.rpc).toHaveBeenCalledTimes(1);
    expect(dobleSupabase.rpc.mock.calls[0][0]).toBe("multifashion_meta_ventas_v2");
  });

  it("sin la migración cae a la v1 con los MISMOS argumentos (falla abierto)", async () => {
    dobleSupabase.rpc.mockImplementation((async (fn: string) => {
      if (fn === "multifashion_meta_ventas_v2") return AUSENTE;
      if (fn === "multifashion_meta_ventas_v1") return { data: FILAS_V1, error: null };
      throw new Error(`RPC inesperada: ${fn}`);
    }) as never);
    const r = await leerVentasDelPeriodo("2026-09-01", "2026-12-31");
    expect(r.fuente).toBe("rpc");
    expect(dobleSupabase.rpc.mock.calls.map((c) => c[0])).toEqual([
      "multifashion_meta_ventas_v2",
      "multifashion_meta_ventas_v1",
    ]);
    expect(dobleSupabase.rpc.mock.calls[1][1]).toEqual({ p_desde: "2026-09-01", p_hasta: "2026-12-31" });
    // Y acá se ve el defecto que la v2 arregla: lo de redes NO es de Sheynee.
    expect(totalDeParticipantes(r.filas, ["SHEYNEE BATISTA"]).get("SHEYNEE BATISTA")).toBe(9117.73);
  });

  it("🔴 un error REAL de la v2 no se disfraza de «no existe»: se lanza", async () => {
    dobleSupabase.rpc.mockImplementation((async (fn: string) => {
      if (fn === "multifashion_meta_ventas_v2")
        return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
      if (fn === "multifashion_meta_ventas_v1") return { data: FILAS_V1, error: null };
      throw new Error(`RPC inesperada: ${fn}`);
    }) as never);
    await expect(leerVentasDelPeriodo("2026-09-01", "2026-12-31")).rejects.toThrow(/timeout/);
    expect(dobleSupabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("el camino paginado también lee el canónico de la vista", () => {
    const codigo = sinComentarios(lectura);
    expect(codigo).toContain('.select("fecha,vendedor,vendedor_canonico,subtotal"');
    expect(codigo).toContain("(f.vendedor_canonico ?? f.vendedor ?? \"\").trim()");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("5 · el amarre 15 → 11 viaja en la migración", () => {
  it("REDES Sheynee (15) es Sheynee Batista (11), canal redes, sin pisar nada", () => {
    expect(sqlCodigo).toContain("(15, 11, 'REDES Sheynee', 'Sheynee Batista', 'redes',");
    expect(sqlCodigo).toContain("ON CONFLICT DO NOTHING");
  });

  it("soft delete se respeta: ninguna migración borra filas del amarre", () => {
    expect(sqlCodigo).not.toMatch(/DELETE FROM/i);
    expect(sqlCodigo).not.toMatch(/DROP TABLE/i);
  });

  it("las cuatro funciones nuevas se pueden llamar desde el servidor", () => {
    for (const g of [
      "GRANT EXECUTE ON FUNCTION public.multifashion_vendedora_canal(integer) TO service_role;",
      "GRANT EXECUTE ON FUNCTION public.multifashion_vendedoras_v5(integer, text, integer, integer) TO service_role;",
      "GRANT EXECUTE ON FUNCTION public.multifashion_vendedoras_range_v3(integer, integer, integer) TO service_role;",
      "GRANT EXECUTE ON FUNCTION public.multifashion_meta_ventas_v2(date, date) TO service_role;",
    ]) expect(sqlCodigo).toContain(g);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("6 · las notas viejas de la doc", () => {
  it("la migración del amarre ya no se llama «pendiente» en ningún lado", () => {
    const postmortem = leer("docs/postmortems/multifashion.md");
    const mapa = leer("docs/mapas/multifashion.md");
    const linea = postmortem.split("\n").find((l) => l.includes("20261009120000_multifashion_vendedora_alias.sql"));
    expect(linea).toBeDefined();
    expect(linea).not.toMatch(/PENDIENTE/);
    expect(linea).toMatch(/aplicada/);
    const fila = mapa.split("\n").find((l) => l.includes("multifashion_vendedora_canonica"));
    expect(fila).toBeDefined();
    expect(fila).not.toMatch(/PENDIENTE/);
  });

  it("CLAUDE.md ya no dice que Multifashion comisiona «sobre TODA la venta»", () => {
    const doc = leer("CLAUDE.md");
    const linea = doc.split("\n").find((l) => l.includes("Multifashion es OTRO módulo de comisiones"));
    expect(linea).toBeDefined();
    expect(linea).not.toMatch(/TODA la venta/);
    expect(linea).toMatch(/CONTADO/);
  });
});
