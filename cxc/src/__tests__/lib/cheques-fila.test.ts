// ─────────────────────────────────────────────────────────────────────────────
// Candado del INSERT de `cheques`.
//
// EL BUG QUE ESTO IMPIDE VOLVER A TENER: `cheques.banco` es NOT NULL sin
// default y el INSERT dejó de mandarla el 14-abr-2026. Resultado: 3 meses y
// medio en los que guardar un cheque devolvía "Error interno" — siempre, para
// todos — porque Postgres respondía 23502 y el 500 genérico lo tapaba. Nadie lo
// vio hasta que Daniel intentó guardar uno.
//
// Los tests van en DOS niveles a propósito:
//   1. La fila cubre todas las columnas obligatorias (unitario, barato).
//   2. Un doble de Supabase que RECHAZA como la base de verdad: si a la fila le
//      falta una obligatoria, devuelve el 23502 real y el POST responde 500.
//      Este es el que reproduce el fallo exacto de producción.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (...a: unknown[]) => mockFrom(...a) },
}));

import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { POST as postCheque } from "@/app/api/cheques/route";
import { COLUMNAS_OBLIGATORIAS_CHEQUE, construirFilaCheque } from "@/lib/cheques-fila";

process.env.SESSION_SECRET ||= "test-secret-para-firmar-sesiones";

/** Los datos EXACTOS con los que Daniel no podía guardar el 27-jul-2026. */
const CHEQUE_DE_DANIEL = {
  cliente: "Xtreme Shoes",
  empresa: "vistana",
  numero_cheque: "aaaa",
  monto: 11111,
  fecha_deposito: "2026-07-27",
  notas: "",
  vendedor: "Edwin",
};

function req(body: unknown): NextRequest {
  const cookie = signSession({ role: "secretaria", userId: "u1", userName: "test", sessionToken: "t1" });
  return new NextRequest("http://localhost/api/cheques", {
    method: "POST",
    headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Doble de la tabla `cheques` que se comporta como Postgres: rechaza con 23502
 * si a la fila le falta cualquier columna NOT NULL sin default.
 *
 * `JSON.stringify` borra las claves `undefined` antes de que PostgREST vea el
 * cuerpo, así que "la mandé como undefined" y "no la mandé" son el MISMO caso
 * para la base — el doble los trata igual.
 */
function tablaQueExigeNotNull() {
  const recibido: Record<string, unknown>[] = [];
  mockFrom.mockReturnValue({
    insert: (fila: Record<string, unknown>) => {
      const comoLaVeLaBase = JSON.parse(JSON.stringify(fila)) as Record<string, unknown>;
      recibido.push(comoLaVeLaBase);
      const falta = COLUMNAS_OBLIGATORIAS_CHEQUE.find(
        (c) => !(c in comoLaVeLaBase) || comoLaVeLaBase[c] === null,
      );
      const error = falta
        ? {
            code: "23502",
            message: `null value in column "${falta}" of relation "cheques" violates not-null constraint`,
          }
        : null;
      return { select: () => ({ single: async () => ({ data: error ? null : { id: "nuevo", ...comoLaVeLaBase }, error }) }) };
    },
  });
  return recibido;
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/cheques — se guarda SIN capturar el banco", () => {
  it("guarda el cheque exacto que hoy da 'Error interno'", async () => {
    const recibido = tablaQueExigeNotNull();
    const res = await postCheque(req(CHEQUE_DE_DANIEL));
    expect(res.status).toBe(200);
    // Y la base recibió la columna que el formulario no captura.
    expect(recibido).toHaveLength(1);
    expect(typeof recibido[0].banco).toBe("string");
  });

  it("el body NO trae `banco` — el formulario no lo pide y no debe pedirlo", () => {
    expect("banco" in CHEQUE_DE_DANIEL).toBe(false);
  });

  it("mandar `banco` desde el cliente no lo pisa: la columna la decide el servidor", async () => {
    const recibido = tablaQueExigeNotNull();
    const res = await postCheque(req({ ...CHEQUE_DE_DANIEL, banco: "<script>Banco Falso" }));
    expect(res.status).toBe(200);
    expect(recibido[0].banco).toBe(construirFilaCheque(CHEQUE_DE_DANIEL).banco);
  });
});

describe("la fila cubre TODAS las columnas obligatorias de la tabla", () => {
  const fila = construirFilaCheque(CHEQUE_DE_DANIEL);

  // Si alguien agrega una columna NOT NULL sin default a `cheques` y la anota en
  // COLUMNAS_OBLIGATORIAS_CHEQUE sin cubrirla en construirFilaCheque, esto se
  // pone rojo en el build en vez de romperle el guardado al usuario.
  it.each(COLUMNAS_OBLIGATORIAS_CHEQUE.map((c) => [c] as const))(
    "la columna obligatoria %s viaja en el INSERT",
    (columna) => {
      expect(Object.prototype.hasOwnProperty.call(fila, columna)).toBe(true);
      expect(fila[columna]).not.toBeUndefined();
      expect(fila[columna]).not.toBeNull();
    },
  );

  it("sobrevive a `JSON.stringify` — undefined desaparece antes de llegar a la base", () => {
    const serializada = JSON.parse(JSON.stringify(fila)) as Record<string, unknown>;
    for (const columna of COLUMNAS_OBLIGATORIAS_CHEQUE) {
      expect(Object.prototype.hasOwnProperty.call(serializada, columna)).toBe(true);
    }
  });

  it("una fila a la que le falte una obligatoria SÍ es rechazada (el doble no miente)", async () => {
    // Mutación deliberada: le quitamos `banco` en el camino a la base, que es
    // exactamente lo que hacía el código roto. Si esto NO diera 500, el doble
    // sería complaciente y los demás tests de este archivo no probarían nada.
    const recibido = tablaQueExigeNotNull();
    const tabla = mockFrom();
    const insertReal = tabla.insert;
    mockFrom.mockReturnValue({
      insert: (f: Record<string, unknown>) => {
        const { banco: _omitida, ...sinBanco } = f;
        return insertReal(sinBanco);
      },
    });
    const res = await postCheque(req(CHEQUE_DE_DANIEL));
    expect(res.status).toBe(500);
    expect(recibido.at(-1)).not.toHaveProperty("banco");
  });
});

describe("la ruta no vuelve a armar el INSERT a mano", () => {
  const RUTA = path.join(process.cwd(), "src/app/api/cheques/route.ts");
  const fuente = fs.readFileSync(RUTA, "utf8");

  it("usa construirFilaCheque", () => {
    expect(fuente).toContain("construirFilaCheque");
  });

  it("no inserta un objeto literal (que es como se perdió `banco`)", () => {
    expect(fuente).not.toMatch(/\.insert\(\s*\{/);
  });

  it("`cheques` se inserta desde UN solo archivo en todo el sistema", () => {
    // Un segundo INSERT en otro lado repetiría el mismo agujero sin que este
    // candado lo vea.
    const raiz = path.join(process.cwd(), "src");
    const archivos: string[] = [];
    (function caminar(dir: string) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "__tests__") caminar(p); }
        else if (/\.tsx?$/.test(e.name)) archivos.push(p);
      }
    })(raiz);

    const conInsert = archivos.filter((f) => {
      const t = fs.readFileSync(f, "utf8");
      return /from\("cheques"\)[\s\S]{0,80}?\.(insert|upsert)\(/.test(t);
    });
    expect(conInsert).toEqual([RUTA]);
  });
});
