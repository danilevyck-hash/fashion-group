// @vitest-environment node
// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — el Historial del Depurador guarda EL MISMO Excel que se descargó,
// 90 días, y la fila con los totales se queda para siempre (4-sep-2026).
//
// Daniel, textual: «el historial solo quiero los excel para switch» · «que el
// archivo dure 90 días» · «todos» (Angela puede bajar lo que corrió Andrea).
//
// Lo que se vigila, contra las rutas REALES y la limpieza REAL (Supabase
// mockeado con un almacén en memoria):
//   1. 🔴 El archivo que entra por multipart queda en Storage BYTE A BYTE
//      igual, y la fila lo apunta (tiene_archivo → botón Descargar).
//   2. El GET del archivo devuelve esos mismos bytes; sin archivo → 404;
//      secretaria puede bajarlo (todos ven todo); sin sesión → 401.
//   3. 🔴 A los 91 días la limpieza borra el ARCHIVO y la FILA SE QUEDA (sin
//      botón). A los 89 días no toca nada. DDL pendiente → no-op limpio.
//   4. El POST JSON de siempre sigue andando (fila sin archivo, como las ~140
//      corridas viejas — gris, sin botón).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";

type Fila = Record<string, unknown>;

const estado = vi.hoisted(() => ({
  filas: [] as Fila[],
  storage: new Map<string, Uint8Array>(),
  /** false = la DDL 20260921120000 no corrió: las columnas del archivo no existen. */
  columnaArchivo: true,
}));

const ERROR_COLUMNA = { message: 'column "archivo_path" does not exist', code: "42703" };

vi.mock("@/lib/supabase-server", () => {
  const from = (tabla: string) => {
    if (tabla !== "carga_history") throw new Error(`tabla inesperada: ${tabla}`);
    return {
      insert: (row: Fila) => ({
        select: () => ({
          single: async () => {
            const fila: Fila = {
              id: crypto.randomUUID(),
              created_at: new Date().toISOString(),
              archivo_path: null,
              archivo_nombre: null,
              ...row,
            };
            estado.filas.push(fila);
            return { data: { id: fila.id }, error: null };
          },
        }),
      }),
      select: (cols: string) => {
        const filtros: ((f: Fila) => boolean)[] = [];
        const q = {
          order: () => q,
          limit: () => q,
          not: (c: string, op: string, v: unknown) => {
            if (op === "is" && v === null) filtros.push((f) => f[c] != null);
            return q;
          },
          lt: (c: string, v: string) => { filtros.push((f) => String(f[c]) < v); return q; },
          eq: (c: string, v: unknown) => { filtros.push((f) => f[c] === v); return q; },
          maybeSingle: async () => {
            if (!estado.columnaArchivo && /archivo_/.test(cols)) return { data: null, error: ERROR_COLUMNA };
            const fila = estado.filas.find((f) => filtros.every((x) => x(f))) ?? null;
            return { data: fila, error: null };
          },
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
            if (!estado.columnaArchivo && /archivo_/.test(cols)) {
              return Promise.resolve({ data: null, error: ERROR_COLUMNA }).then(res, rej);
            }
            const filas = estado.filas
              .filter((f) => filtros.every((x) => x(f)))
              .sort((a, b) => (String(a.created_at) < String(b.created_at) ? 1 : -1));
            return Promise.resolve({ data: filas, error: null }).then(res, rej);
          },
        };
        return q;
      },
      // La ruta y la limpieza REALES no borran filas jamás; el mock lo soporta
      // para que la MUTACIÓN «borrar la fila junto con el archivo» muera por
      // la aserción («la fila se queda»), no por un método inexistente.
      delete: () => ({
        eq: (c: string, v: unknown) => {
          for (let i = estado.filas.length - 1; i >= 0; i--) if (estado.filas[i][c] === v) estado.filas.splice(i, 1);
          return Promise.resolve({ error: null });
        },
        in: (c: string, vals: unknown[]) => {
          for (let i = estado.filas.length - 1; i >= 0; i--) if (vals.includes(estado.filas[i][c])) estado.filas.splice(i, 1);
          return Promise.resolve({ error: null });
        },
      }),
      update: (patch: Fila) => {
        const aplicar = (pred: (f: Fila) => boolean) => {
          if (!estado.columnaArchivo && ("archivo_path" in patch || "archivo_nombre" in patch)) {
            return Promise.resolve({ error: ERROR_COLUMNA });
          }
          for (const f of estado.filas) if (pred(f)) Object.assign(f, patch);
          return Promise.resolve({ error: null });
        };
        return {
          eq: (c: string, v: unknown) => aplicar((f) => f[c] === v),
          in: (c: string, vals: unknown[]) => aplicar((f) => vals.includes(f[c])),
        };
      },
    };
  };
  const storage = {
    from: (bucket: string) => ({
      upload: async (path: string, buf: Buffer) => {
        estado.storage.set(`${bucket}/${path}`, new Uint8Array(buf));
        return { error: null };
      },
      download: async (path: string) => {
        const b = estado.storage.get(`${bucket}/${path}`);
        return b
          ? { data: new Blob([Buffer.from(b)]), error: null }
          : { data: null, error: { message: "Object not found" } };
      },
      remove: async (paths: string[]) => {
        for (const p of paths) estado.storage.delete(`${bucket}/${p}`);
        return { error: null };
      },
    }),
  };
  return { supabaseServer: { from, storage }, HAS_SERVICE_ROLE: true };
});

const { GET, POST } = await import("@/app/api/productos/cargar/historial/route");
const { GET: GET_ARCHIVO } = await import("@/app/api/productos/cargar/historial/archivo/route");
const { runLimpiezaArchivosDepurador, BUCKET_PLANTILLAS } = await import("@/lib/depurador/historial-archivos");

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-depurador-historial"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

function cookieDe(role: string) {
  return `cxc_session=${signSession({ role, userId: "u1", userName: "Angela", sessionToken: "t1" })}`;
}

function reqGet(url: string, role: string | null = "secretaria") {
  const headers: Record<string, string> = {};
  if (role) headers.cookie = cookieDe(role);
  return new NextRequest(`https://fashiongr.com${url}`, { headers });
}

const BYTES = new Uint8Array([0x50, 0x4b, 3, 4, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 42, 77]);

async function postConArchivo(role = "secretaria", nombre = "PLANT_CK_2026-09.xlsx") {
  const fd = new FormData();
  fd.set("empresa", "Vistana International");
  fd.set("marca", "CK Jeans");
  fd.set("cantidad_estilos", "2");
  fd.set("total_unidades", "8");
  fd.set("total_costo", "123.45");
  fd.set("archivo", new File([BYTES], nombre, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const req = new NextRequest("https://fashiongr.com/api/productos/cargar/historial", {
    method: "POST",
    body: fd,
    headers: { cookie: cookieDe(role) },
  });
  return POST(req);
}

beforeEach(() => {
  estado.filas.length = 0;
  estado.storage.clear();
  estado.columnaArchivo = true;
});

describe("🔴 el archivo guardado es BYTE A BYTE el que se descargó", () => {
  it("POST multipart: fila + objeto en Storage con los mismos bytes, y la fila lo apunta", async () => {
    const res = await postConArchivo();
    expect(res.status).toBe(200);

    expect(estado.filas).toHaveLength(1);
    const fila = estado.filas[0];
    expect(fila.empresa).toBe("Vistana International");
    expect(fila.archivo_path).toBe(`${fila.id}/PLANT_CK_2026-09.xlsx`);
    expect(fila.archivo_nombre).toBe("PLANT_CK_2026-09.xlsx");

    const guardado = estado.storage.get(`${BUCKET_PLANTILLAS}/${fila.archivo_path}`);
    expect(guardado).toBeTruthy();
    expect([...guardado!]).toEqual([...BYTES]); // byte a byte

    // Y el GET del historial enciende el botón.
    const lista = await (await GET(reqGet("/api/productos/cargar/historial"))).json();
    expect(lista.rows[0].tiene_archivo).toBe(true);
    expect(lista.rows[0].archivo_nombre).toBe("PLANT_CK_2026-09.xlsx");
  });

  it("el GET del archivo devuelve esos mismos bytes, como descarga adjunta", async () => {
    await postConArchivo();
    const id = String(estado.filas[0].id);
    const res = await GET_ARCHIVO(reqGet(`/api/productos/cargar/historial/archivo?id=${id}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    expect(res.headers.get("content-disposition")).toContain("PLANT_CK_2026-09.xlsx");
    const cuerpo = new Uint8Array(await res.arrayBuffer());
    expect([...cuerpo]).toEqual([...BYTES]);
  });

  it("todos ven todo: la secretaria baja lo que corrió otra; sin sesión → 401; un rol ajeno → 403", async () => {
    await postConArchivo("admin");
    const id = String(estado.filas[0].id);
    expect((await GET_ARCHIVO(reqGet(`/api/productos/cargar/historial/archivo?id=${id}`, "secretaria"))).status).toBe(200);
    expect((await GET_ARCHIVO(reqGet(`/api/productos/cargar/historial/archivo?id=${id}`, null))).status).toBe(401);
    expect((await GET_ARCHIVO(reqGet(`/api/productos/cargar/historial/archivo?id=${id}`, "bodega"))).status).toBe(403);
  });

  it("una fila SIN archivo (corrida vieja) → 404, y el POST JSON de siempre la crea sin botón", async () => {
    const req = new NextRequest("https://fashiongr.com/api/productos/cargar/historial", {
      method: "POST",
      body: JSON.stringify({ empresa: "Fashion Wear", marca: "TH", cantidad_estilos: 1, total_unidades: 1, total_costo: 1 }),
      headers: { cookie: cookieDe("secretaria"), "content-type": "application/json" },
    });
    expect((await POST(req)).status).toBe(200);
    const fila = estado.filas[0];
    expect(fila.archivo_path).toBeNull();

    const lista = await (await GET(reqGet("/api/productos/cargar/historial"))).json();
    expect(lista.rows[0].tiene_archivo).toBe(false);

    expect((await GET_ARCHIVO(reqGet(`/api/productos/cargar/historial/archivo?id=${fila.id}`))).status).toBe(404);
  });

  it("DDL pendiente: el archivo no se puede anotar → la FILA se registra igual y no queda huérfano en Storage", async () => {
    estado.columnaArchivo = false;
    const res = await postConArchivo();
    expect(res.status).toBe(200);
    expect(estado.filas).toHaveLength(1); // los totales nunca se pierden
    expect(estado.storage.size).toBe(0); // el objeto subido se retiró (sin huérfanos)
  });
});

describe("🔴 a los 90 días se borra el ARCHIVO y la fila con los totales SE QUEDA", () => {
  const dias = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

  it("91 días → archivo fuera, fila sin botón; 89 días → intacto", async () => {
    await postConArchivo("admin", "VIEJO.xlsx");
    await postConArchivo("admin", "RECIENTE.xlsx");
    estado.filas[0].created_at = dias(91);
    estado.filas[1].created_at = dias(89);

    const r = await runLimpiezaArchivosDepurador();
    expect(r.ok).toBe(true);
    expect(r.borrados).toBe(1);

    // 🔴 Las DOS filas siguen existiendo — la limpieza nunca borra filas.
    expect(estado.filas).toHaveLength(2);
    expect(estado.filas[0].archivo_path).toBeNull(); // vencida: sin botón
    expect(estado.filas[1].archivo_path).toContain("RECIENTE.xlsx"); // viva

    // En Storage solo queda el reciente.
    expect(estado.storage.size).toBe(1);
    expect([...estado.storage.keys()][0]).toContain("RECIENTE.xlsx");

    // Y el GET refleja botón sí / botón no.
    const lista = await (await GET(reqGet("/api/productos/cargar/historial"))).json();
    const porNombre = Object.fromEntries(
      (lista.rows as { archivo_nombre: string | null; tiene_archivo: boolean }[]).map((x) => [x.archivo_nombre, x.tiene_archivo])
    );
    expect(porNombre["VIEJO.xlsx"]).toBe(false);
    expect(porNombre["RECIENTE.xlsx"]).toBe(true);

    // Idempotente: la segunda pasada no encuentra candidatos.
    const r2 = await runLimpiezaArchivosDepurador();
    expect(r2.borrados).toBe(0);
  });

  it("DDL pendiente → no-op limpio (nada que limpiar, no una avería)", async () => {
    estado.columnaArchivo = false;
    const r = await runLimpiezaArchivosDepurador();
    expect(r.ok).toBe(true);
    expect(r.borrados).toBe(0);
    expect(r.detail).toContain("pendiente");
  });
});
