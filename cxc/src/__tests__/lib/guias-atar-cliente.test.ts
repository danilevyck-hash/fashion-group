// CANDADO — atar el cliente de una línea de guía.
//
// Lo que estos casos impiden que vuelva a pasar:
//
//   · que un código de Boston/Multifashion (numérico pelado) entre a
//     `guia_items.cliente_codigo`. Ya pasó: la línea `111380` de GT-183 se coló
//     por el backfill de junio que filtraba `IS NOT NULL` en vez de `LIKE 'D-%'`;
//   · que "sin atar" se guarde como `""` en vez de NULL — con `""` un
//     `cliente_codigo IS NOT NULL` contaría líneas que no están atadas;
//   · que se acepte un D-XXX que no existe en el directorio (un vínculo a la
//     nada es peor que no tener vínculo).

import { describe, it, expect, vi } from "vitest";

// `atar-cliente.ts` importa la definición de cliente desde `mundos.ts`, que a su
// vez importa Supabase para OTRA cosa (leer `switch_clientes`). Acá se prueba
// solo la parte pura, así que se dobla el cliente — igual que en
// `clientes-puerta-unica.test.ts`.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: () => ({}) } }));
vi.mock("@/lib/supabase-paginado", () => ({ leerTodoPaginado: async () => [] }));

import { validarCodigoParaAtar } from "@/lib/guias/atar-cliente";

const DIRECTORIO = new Set(["D-25", "D-201", "D-80"]);

describe("validarCodigoParaAtar", () => {
  it("acepta un D-XXX que está en el directorio del grupo", () => {
    expect(validarCodigoParaAtar("D-25", DIRECTORIO)).toEqual({ ok: true, codigo: "D-25" });
  });

  it("desata con null y guarda NULL, nunca cadena vacía", () => {
    expect(validarCodigoParaAtar(null, DIRECTORIO)).toEqual({ ok: true, codigo: null });
    expect(validarCodigoParaAtar(undefined, DIRECTORIO)).toEqual({ ok: true, codigo: null });
  });

  it("una cadena vacía o de espacios también desata — y da NULL, no ''", () => {
    for (const v of ["", "   ", "\t"]) {
      const r = validarCodigoParaAtar(v, DIRECTORIO);
      expect(r).toEqual({ ok: true, codigo: null });
      // El punto del caso: `codigo` NO puede ser "".
      expect(r.ok && r.codigo).not.toBe("");
    }
  });

  it("🩸 RECHAZA el código numérico pelado de Boston (el caso 111380 de GT-183)", () => {
    const conBoston = new Set([...DIRECTORIO, "111380"]);
    const r = validarCodigoParaAtar("111380", conBoston);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/D-XXX/);
  });

  it("rechaza TCKCTA (el pseudo-cliente de mostrador) y cualquier texto suelto", () => {
    for (const v of ["TCKCTA", "City Mall", "D", "-25", "D-", "DD-25", "12188"]) {
      expect(validarCodigoParaAtar(v, DIRECTORIO).ok).toBe(false);
    }
  });

  it("rechaza un D-XXX bien formado que NO está en el directorio", () => {
    const r = validarCodigoParaAtar("D-999", DIRECTORIO);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/directorio/i);
  });

  it("normaliza espacios y mayúsculas, pero GUARDA el código tal cual está en el directorio", () => {
    expect(validarCodigoParaAtar("  d-201  ", DIRECTORIO)).toEqual({ ok: true, codigo: "D-201" });
  });

  it("con el directorio vacío no se puede atar nada (pero sí desatar)", () => {
    const vacio = new Set<string>();
    expect(validarCodigoParaAtar("D-25", vacio).ok).toBe(false);
    expect(validarCodigoParaAtar(null, vacio)).toEqual({ ok: true, codigo: null });
  });
});
