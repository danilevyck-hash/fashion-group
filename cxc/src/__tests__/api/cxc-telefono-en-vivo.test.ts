/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 GET /api/cxc/aging — EL TELÉFONO SE LEE EN VIVO, LA PLATA SALE DE LA MV.
 *
 * 🩸 EL DEFECTO QUE ESTE ARCHIVO IMPIDE QUE VUELVA. Al tocar «WhatsApp» sobre
 * un cliente sin teléfono, el CXC decía *"Este cliente no tiene teléfono
 * registrado. Edite el contacto primero"*. Se iba a la ficha, se escribía el
 * teléfono —que se guarda en `clientes_master`—, se volvía… **y seguía diciendo
 * lo mismo**, porque esta ruta lee `switch_estadocuenta_aging_mv`, una vista
 * MATERIALIZADA que un cron refresca horas después. El aviso mandaba a hacer
 * algo que no arreglaba nada, y la persona quedaba pensando que la app se rompió.
 *
 * 🔑 SON TESTS DE CONDUCTA: se LLAMA al handler y se mira el payload que sale.
 * Un barrido de texto vería el `.from("clientes_master")` y se daría por
 * satisfecho aunque el resultado se calculara y se tirara a la basura — que es
 * exactamente cómo este repo ya pagó dos candados que pasaban en verde.
 *
 * Las tres cosas que se vigilan, y las tres importan por separado:
 *   1. el CONTACTO sale del maestro EN VIVO (el arreglo);
 *   2. la PLATA no se toca — ni un tramo, ni un total, ni el nombre con el que
 *      el panel consolida (cambiar `nombre_normalized` movería la agrupación);
 *   3. FALLA ABIERTO — si el maestro no se puede leer, el CXC se dibuja igual
 *      con el contacto de la MV. Una cartera que no carga es mucho peor que un
 *      teléfono viejo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/lib/require-auth", () => ({
  getSession: () => ({ role: "admin", userId: "u1", userName: "Daniel" }),
}));

/** Lo que hoy tiene materializado la MV (con el teléfono VIEJO: vacío). */
let filasMv: Record<string, unknown>[];
/** Lo que hoy dice `clientes_master` (con el teléfono RECIÉN guardado). */
let filasMaestro: Record<string, unknown>[] | null;
/** Cuando el maestro no se puede leer. */
let errorMaestro: { message: string } | null;
/** Tablas que la ruta llegó a tocar, en orden. */
let tablasLeidas: string[];

function dobleMv() {
  const res = { data: filasMv, error: null };
  const cadena = {
    select: () => cadena,
    eq: () => cadena,
    // La ruta hace `await mvQuery` directo: el builder tiene que ser awaitable.
    then: (ok: (v: unknown) => unknown) => Promise.resolve(res).then(ok),
  };
  return cadena;
}

function dobleMaestro() {
  let filtroIn: string[] = [];
  const cadena = {
    select: () => cadena,
    in: (_col: string, vals: string[]) => { filtroIn = vals; return cadena; },
    eq: () => cadena,
    order: () => cadena,
    range: async () => {
      if (errorMaestro) return { data: null, error: errorMaestro, count: null };
      const data = (filasMaestro ?? []).filter((f) => filtroIn.includes(f.codigo as string));
      return { data, error: null, count: data.length };
    },
  };
  return cadena;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (tabla: string) => {
      tablasLeidas.push(tabla);
      if (tabla === "clientes_master") return dobleMaestro();
      return dobleMv();
    },
  },
}));

/** Una fila de aging con la forma REAL de la vista (COALESCE → "" cuando falta). */
function filaAging(over: Record<string, unknown> = {}) {
  return {
    id: "id-1",
    company_key: "vistana",
    codigo: "D-25",
    nombre: "CITY MALL PASO CANOA",
    nombre_normalized: "CITY MALL PASO CANOA",
    correo: "",
    telefono: "",
    celular: "",
    contacto: "",
    d0_30: 1000, d31_60: 0, d61_90: 0, d91_120: 250.5,
    d121_180: 0, d181_270: 0, d271_365: 0, mas_365: 0,
    total: 1250.5,
    materializado_en: "2026-08-24T02:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  tablasLeidas = [];
  errorMaestro = null;
  filasMv = [filaAging()];
  // La secretaria acaba de guardar el celular en la ficha del cliente.
  filasMaestro = [
    { codigo: "D-25", email: "pagos@citymall.com", telefono: "507-123-4567", celular: "6000-1111" },
  ];
});

async function pedir() {
  const { GET } = await import("@/app/api/cxc/aging/route");
  const req = { url: "http://x/api/cxc/aging" } as never;
  const res = await GET(req);
  return { status: res.status, json: (await res.json()) as { rows: Record<string, unknown>[] } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. EL ARREGLO
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 el teléfono que se acaba de guardar en la ficha SE VE en el CXC", () => {
  it("el celular sale del maestro, no del que la MV tenía materializado", async () => {
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.json.rows[0].celular).toBe("6000-1111");
    expect(r.json.rows[0].telefono).toBe("507-123-4567");
    expect(r.json.rows[0].correo).toBe("pagos@citymall.com");
  });

  it("se lee `clientes_master` de verdad (no es un cálculo que se tira)", async () => {
    await pedir();
    expect(tablasLeidas).toContain("clientes_master");
  });

  it("un teléfono BORRADO en la ficha también se refleja (null → vacío)", async () => {
    // El caso simétrico: si sólo se copiara "cuando hay algo", borrar un dato
    // malo en la ficha dejaría el malo pegado en el CXC para siempre.
    filasMv = [filaAging({ telefono: "507-999-9999", celular: "6000-9999" })];
    filasMaestro = [{ codigo: "D-25", email: null, telefono: null, celular: null }];
    const r = await pedir();
    expect(r.json.rows[0].telefono).toBe("");
    expect(r.json.rows[0].celular).toBe("");
    expect(r.json.rows[0].correo).toBe("");
  });

  it("un cliente que NO está en el maestro conserva lo que traía la MV", async () => {
    filasMv = [filaAging({ codigo: "D-99", telefono: "507-777-7777" })];
    filasMaestro = [];
    const r = await pedir();
    expect(r.json.rows[0].telefono).toBe("507-777-7777");
  });

  it("sin filas de cartera no se va a preguntarle nada al maestro", async () => {
    filasMv = [];
    await pedir();
    expect(tablasLeidas).not.toContain("clientes_master");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. LA PLATA NO SE MUEVE
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 NINGÚN número de cartera cambia", () => {
  it("los tramos, el total y el nombre salen EXACTAMENTE como los dio la MV", async () => {
    const antes = filaAging();
    filasMv = [{ ...antes }];
    const r = await pedir();
    const fila = r.json.rows[0];
    for (const campo of [
      "d0_30", "d31_60", "d61_90", "d91_120",
      "d121_180", "d181_270", "d271_365", "mas_365", "total",
      // 🔑 El nombre también: el CXC consolida por `nombre_normalized`, así que
      // pisarlo con el del maestro movería la AGRUPACIÓN de la pantalla.
      "nombre", "nombre_normalized", "company_key", "codigo",
    ]) {
      expect(fila[campo], `cambió ${campo}`).toEqual(antes[campo as keyof typeof antes]);
    }
  });

  it("un saldo NEGATIVO (saldo a favor) llega intacto — no se 'limpia'", async () => {
    filasMv = [filaAging({ total: -840.25, d0_30: -840.25, d91_120: 0 })];
    const r = await pedir();
    expect(r.json.rows[0].total).toBe(-840.25);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. FALLA ABIERTO
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 si el maestro no se puede leer, el CXC se dibuja igual", () => {
  it("responde 200 con la cartera completa y el contacto de la MV", async () => {
    filasMv = [filaAging({ telefono: "507-555-5555" })];
    errorMaestro = { message: "timeout" };
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.json.rows).toHaveLength(1);
    expect(r.json.rows[0].total).toBe(1250.5);
    expect(r.json.rows[0].telefono).toBe("507-555-5555");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. LO QUE NO PUEDE PASAR NUNCA — barrido, con los comentarios FUERA
// ─────────────────────────────────────────────────────────────────────────────

describe("la ruta no se convierte en otra cosa", () => {
  const RUTA = path.join(process.cwd(), "src/app/api/cxc/aging/route.ts");
  // Este archivo CITA lo que prohíbe en su encabezado: sin borrar comentarios,
  // el barrido se cumpliría (o se rompería) con su propia explicación.
  const codigo = fs
    .readFileSync(RUTA, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("NO toca la tabla base `switch_estadocuenta` (Boston va aparte)", () => {
    expect(codigo).not.toMatch(/from\(\s*["']switch_estadocuenta["']\s*\)/);
  });

  it("la lectura del maestro va ACOTADA y PAGINADA (`db-max-rows` corta en silencio)", () => {
    expect(codigo).toMatch(/leerTodoPaginado/);
    expect(codigo).toMatch(/\.in\(\s*["']codigo["']/);
    // Sin `.order()` estable, paginar puede repetir o saltear filas.
    expect(codigo).toMatch(/\.order\(\s*["']codigo["']/);
  });

  it("el lote del `.in()` queda MUY por debajo del tope de PostgREST", () => {
    const m = codigo.match(/LOTE_CODIGOS\s*=\s*(\d+)/);
    expect(m, "no encontré LOTE_CODIGOS — ¿cambió de nombre?").toBeTruthy();
    expect(Number(m![1])).toBeLessThan(1000);
  });
});
