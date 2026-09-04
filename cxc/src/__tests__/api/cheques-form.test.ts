// Lo que sostiene al formulario de cheques del lado del servidor:
//
//   1. La fecha de depósito, que la pantalla exige y el servidor NO miraba.
//   2. Los "más usados" del selector de cliente, que salen de la tabla `cheques`
//      (no de guías) y se resuelven por NOMBRE porque `cheques` no guarda código.
//   3. La lista de vendedores, que pasó de localStorage a la base y tiene que
//      seguir funcionando MIENTRAS el DDL no se haya corrido.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (...a: unknown[]) => mockFrom(...a) },
}));

// El selector resuelve nombre → código por LA PUERTA ÚNICA de clientes
// (`leerClientesDelGrupo`), no con una consulta propia. Se dobla la puerta para
// que estos tests midan lo que le toca al route —contar, normalizar y ordenar—
// sin arrastrar el caché de 60 s del módulo real.
const puerta = vi.hoisted(() => ({ clientes: [] as Array<{ codigo: string; nombre: string }> }));
vi.mock("@/lib/clientes/directorio-cache", () => ({
  leerClientesDelGrupo: async () => puerta.clientes,
}));

import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { POST as postCheque } from "@/app/api/cheques/route";
import { GET as getFrecuencias } from "@/app/api/cheques/frecuencias/route";
import { GET as getVendedores, POST as postVendedor } from "@/app/api/cheques/vendedores/route";
import { VENDEDORES_POR_DEFECTO } from "@/lib/cheques-vendedores";

process.env.SESSION_SECRET ||= "test-secret-para-firmar-sesiones";

function req(url: string, init: { method?: string; body?: unknown; role?: string } = {}): NextRequest {
  const cookie = signSession({ role: init.role ?? "secretaria", userId: "u1", userName: "test", sessionToken: "t1" });
  return new NextRequest(`http://localhost${url}`, {
    method: init.method ?? "GET",
    headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

const CHEQUE_OK = {
  cliente: "XTREME SHOES",
  empresa: "vistana",
  numero_cheque: "246001",
  monto: 1000,
  fecha_deposito: "2026-08-15",
  notas: "",
  vendedor: "Rey",
};

/** Cadena de inserción que devuelve la fila creada. */
function insertOk() {
  return {
    insert: () => ({ select: () => ({ single: async () => ({ data: { id: "nuevo" }, error: null }) }) }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue(insertOk());
});

describe("POST /api/cheques — la fecha de depósito se valida en el servidor", () => {
  it("acepta un cheque completo", async () => {
    const res = await postCheque(req("/api/cheques", { method: "POST", body: CHEQUE_OK }));
    expect(res.status).toBe(200);
  });

  it.each([
    ["ausente", undefined],
    ["vacía", ""],
    ["texto suelto", "mañana"],
    ["formato del país", "15/08/2026"],
    ["día inexistente", "2026-02-31"],
    ["no es texto", 20260815],
  ])("rechaza la fecha %s", async (_caso, fecha) => {
    const body = { ...CHEQUE_OK, fecha_deposito: fecha };
    const res = await postCheque(req("/api/cheques", { method: "POST", body }));
    expect(res.status).toBe(400);
    // Sin fecha, el cheque sería invisible para el calendario y para el aviso
    // de vencimiento: no puede entrar a la tabla.
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("GET /api/cheques/frecuencias — los más usados salen de CHEQUES", () => {
  function conDatos(cheques: Array<{ cliente: string; created_at: string }>, master: Array<{ codigo: string; nombre: string }>) {
    puerta.clientes = master;
    mockFrom.mockImplementation((tabla: string) => {
      if (tabla === "cheques") return { select: () => ({ eq: async () => ({ data: cheques, error: null }) }) };
      return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
    });
  }

  it("ordena por cantidad de cheques y resuelve el código del directorio", async () => {
    conDatos(
      [
        { cliente: "XTREME SHOES", created_at: "2026-04-01" },
        { cliente: "XTREME SHOES", created_at: "2026-04-02" },
        { cliente: "PLAZA LOS ANGELES", created_at: "2026-04-03" },
      ],
      [
        { codigo: "D-159", nombre: "Xtreme Shoes" },
        { codigo: "D-126", nombre: "Plaza Los Angeles" },
      ],
    );
    const d = await (await getFrecuencias(req("/api/cheques/frecuencias"))).json();
    expect(d.clientes).toEqual([
      { codigo: "D-159", nombre: "Xtreme Shoes" },
      { codigo: "D-126", nombre: "Plaza Los Angeles" },
    ]);
  });

  it("parea aunque el cheque lo tenga en MAYÚSCULAS y el directorio no", async () => {
    // Es el caso real medido en producción: los cheques vivos dicen
    // "PLAZA LOS ANGELES" / "DOLLAR MALL" y clientes_master dice
    // "Plaza Los Angeles" / "Dollar Mall". Sin normalizar, ningún chip saldría.
    conDatos(
      [
        { cliente: "  PLAZA LOS ANGELES ", created_at: "2026-04-03" },
        { cliente: "Dollar Mall.", created_at: "2026-04-02" },
      ],
      [
        { codigo: "D-126", nombre: "Plaza Los Angeles" },
        { codigo: "D-46", nombre: "Dollar Mall" },
      ],
    );
    const d = await (await getFrecuencias(req("/api/cheques/frecuencias"))).json();
    expect(d.clientes).toEqual([
      { codigo: "D-126", nombre: "Plaza Los Angeles" },
      { codigo: "D-46", nombre: "Dollar Mall" },
    ]);
  });

  it("un cliente escrito a mano que no está en el directorio no rompe nada", async () => {
    conDatos([{ cliente: "TIENDA DE LA ESQUINA", created_at: "2026-04-03" }], []);
    const res = await getFrecuencias(req("/api/cheques/frecuencias"));
    expect(res.status).toBe(200);
    expect((await res.json()).clientes).toEqual([]);
  });

  it("empatados en cantidad, primero el más reciente", async () => {
    conDatos(
      [
        { cliente: "A", created_at: "2026-01-01" },
        { cliente: "B", created_at: "2026-06-01" },
      ],
      [{ codigo: "D-1", nombre: "A" }, { codigo: "D-2", nombre: "B" }],
    );
    const d = await (await getFrecuencias(req("/api/cheques/frecuencias"))).json();
    expect(d.clientes.map((c: { codigo: string }) => c.codigo)).toEqual(["D-2", "D-1"]);
  });

  it("sin sesión de cheques, 403", async () => {
    const res = await getFrecuencias(req("/api/cheques/frecuencias", { role: "bodega" }));
    expect(res.status).toBe(403);
  });
});

// ⚠️ Cambio de dirección (3-sep-2026): la tolerancia a la DDL se retiró —
// `cheque_vendedores` existe desde 20260727160000. El GET SIGUE devolviendo los
// de siempre ante cualquier error (el vendedor es obligatorio y el formulario no
// puede quedar sin poder guardar), pero ahora lo LOGUEA; el POST ya no distingue
// "tabla ausente" y responde 500 como cualquier otro error.
describe("GET/POST /api/cheques/vendedores — la lista compartida falla blanda", () => {
  const TABLA_AUSENTE = { code: "PGRST205", message: "Could not find the table 'public.cheque_vendedores' in the schema cache" };

  it("devuelve los vendedores activos de la base", async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ order: async () => ({ data: [{ nombre: "Edwin" }, { nombre: "Rey" }], error: null }) }) }),
    });
    const d = await (await getVendedores(req("/api/cheques/vendedores"))).json();
    expect(d).toEqual({ vendedores: ["Edwin", "Rey"], fuente: "db" });
  });

  it("con un error de la base (PGRST205 incluido) responde 200 con los de siempre — y lo LOGUEA", async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ order: async () => ({ data: null, error: TABLA_AUSENTE }) }) }),
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await getVendedores(req("/api/cheques/vendedores"));
    // Si esto fuera un 503, el desplegable quedaría vacío y el vendedor es
    // obligatorio: no se podría guardar ningún cheque. Pero el error ya no se
    // traga en silencio como "todavía no corrió el SQL".
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ vendedores: VENDEDORES_POR_DEFECTO, fuente: "local" });
    expect(err).toHaveBeenCalledWith(expect.stringContaining("[api/cheques/vendedores] GET"), expect.stringContaining("cheque_vendedores"));
    err.mockRestore();
  });

  it("agrega un vendedor nuevo", async () => {
    mockFrom.mockReturnValue({ insert: async () => ({ error: null }) });
    const res = await postVendedor(req("/api/cheques/vendedores", { method: "POST", body: { nombre: " Julio " } }));
    expect(res.status).toBe(200);
    expect((await res.json()).nombre).toBe("Julio");
  });

  it("agregar con PGRST205 es un 500 con mensaje (antes: 503 'todavía es local')", async () => {
    // Con la tabla puesta, "no existe" es un permiso, un timeout o un cambio de
    // esquema: decirle a la persona que "todavía no está activa" sería mentir.
    mockFrom.mockReturnValue({ insert: async () => ({ error: TABLA_AUSENTE }) });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await postVendedor(req("/api/cheques/vendedores", { method: "POST", body: { nombre: "Julio" } }));
    expect(res.status).toBe(500);
    const d = await res.json();
    expect(d.error).toBe("No se pudo agregar. Intenta de nuevo.");
    expect(d.fuente).toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("un vendedor repetido no es un error para el usuario", async () => {
    mockFrom.mockReturnValue({ insert: async () => ({ error: { code: "23505", message: "duplicate key" } }) });
    const res = await postVendedor(req("/api/cheques/vendedores", { method: "POST", body: { nombre: "rey" } }));
    expect(res.status).toBe(200);
    expect((await res.json()).yaExistia).toBe(true);
  });

  it("nombre vacío, 400", async () => {
    const res = await postVendedor(req("/api/cheques/vendedores", { method: "POST", body: { nombre: "   " } }));
    expect(res.status).toBe(400);
  });
});
