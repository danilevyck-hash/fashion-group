// Cliente y vendedor de Switch para un pedido del LINK PÚBLICO.
//
// Regresión que cubre (25-jul-2026): los pedidos del link se convertían a
// PED-### / JBP-### / TOM-### y ahí morían — la RPC los deja con
// cliente_switch_id y vendedor_switch_id en NULL y sin sesión que los aporte
// nadie podía mandarlos al ERP. Estos tests fijan de dónde salen esos dos ids
// (todos REALES, ninguno inventado) y que si falta uno NO se inventa: se
// devuelve el motivo y el envío queda recuperable.

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CODIGO_CLIENTE_CONTADO,
  NOMBRE_VENDEDOR_DEFAULT,
  TABLA_OVERRIDE,
  resolvePublicoSwitchActor,
} from "@/lib/catalogo/publico-switch-actor";

type Fila = Record<string, unknown> | null;

/** Doble mínimo de PostgREST: devuelve la fila de la tabla pedida (o null) y
 *  registra los filtros para poder asertarlos. */
function makeDb(tablas: Record<string, Fila>, filtros: Record<string, unknown>[] = []) {
  return {
    from(table: string) {
      const eqs: Record<string, unknown> = { table };
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          eqs[col] = val;
          return chain;
        },
        limit: () => chain,
        maybeSingle: async () => {
          filtros.push(eqs);
          if (!(table in tablas)) return { data: null, error: { message: "no existe" } };
          return { data: tablas[table], error: null };
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const CONTADO = { cliente_switch_id: 1, nombre: "Contado" };

describe("resolvePublicoSwitchActor", () => {
  it("regla por defecto: cliente de contado (TCKCTA) + vendedor DEFAULT del maestro", async () => {
    const filtros: Record<string, unknown>[] = [];
    const db = makeDb(
      {
        switch_clientes: CONTADO,
        vendedores: { switch_id: 3, nombre: "DEFAULT" },
      },
      filtros,
    );
    const res = await resolvePublicoSwitchActor(db, "active_shoes");
    expect(res).toEqual({
      ok: true,
      actor: { clienteId: 1, clienteNombre: "Contado", vendedorId: 3, vendedorNombre: "DEFAULT" },
    });

    // Busca por el CÓDIGO de Switch y por empresa, no por nombre a ojo.
    const cli = filtros.find((f) => f.table === "switch_clientes")!;
    expect(cli.codigo).toBe(CODIGO_CLIENTE_CONTADO);
    expect(cli.empresa_key).toBe("active_shoes");
    const ven = filtros.find((f) => f.table === "vendedores")!;
    expect(ven.nombre).toBe(NOMBRE_VENDEDOR_DEFAULT);
    expect(ven.empresa_key).toBe("active_shoes");
  });

  it("si el maestro `vendedores` no tiene la empresa, cae al mapeo de usuarios", async () => {
    // Caso real de joystep: `vendedores` vacío, fg_user_switch_vendedor sí tiene
    // el DEFAULT (id 1).
    const db = makeDb({
      switch_clientes: CONTADO,
      vendedores: null,
      fg_user_switch_vendedor: { vendedor_id: 1, vendedor_nombre: "DEFAULT" },
    });
    const res = await resolvePublicoSwitchActor(db, "joystep");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.actor).toMatchObject({ clienteId: 1, vendedorId: 1 });
  });

  it("el override por empresa gana sobre la regla por defecto", async () => {
    const db = makeDb({
      [TABLA_OVERRIDE]: {
        cliente_switch_id: 77,
        cliente_nombre: "Cliente del link",
        vendedor_id: 9,
        vendedor_nombre: "OTRO",
      },
      switch_clientes: CONTADO,
      vendedores: { switch_id: 3, nombre: "DEFAULT" },
    });
    const res = await resolvePublicoSwitchActor(db, "fashion_shoes");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.actor).toMatchObject({ clienteId: 77, vendedorId: 9 });
  });

  it("override incompleto (ids basura) no se usa: sigue la regla por defecto", async () => {
    const db = makeDb({
      [TABLA_OVERRIDE]: { cliente_switch_id: 0, vendedor_id: null },
      switch_clientes: CONTADO,
      vendedores: { switch_id: 1, nombre: "DEFAULT" },
    });
    const res = await resolvePublicoSwitchActor(db, "fashion_shoes");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.actor).toMatchObject({ clienteId: 1, vendedorId: 1 });
  });

  it("sin cliente de contado NO inventa un id: devuelve el motivo", async () => {
    const db = makeDb({ switch_clientes: null, vendedores: { switch_id: 3, nombre: "DEFAULT" } });
    const res = await resolvePublicoSwitchActor(db, "fashion_shoes");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.motivo).toContain(CODIGO_CLIENTE_CONTADO);
  });

  it("sin vendedor DEFAULT NO inventa un id: devuelve el motivo accionable", async () => {
    const db = makeDb({
      switch_clientes: CONTADO,
      vendedores: null,
      fg_user_switch_vendedor: null,
    });
    const res = await resolvePublicoSwitchActor(db, "fashion_shoes");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toContain(NOMBRE_VENDEDOR_DEFAULT);
      expect(res.motivo).toContain(TABLA_OVERRIDE);
    }
  });

  it("tolerante: si la tabla de override no existe, la regla por defecto igual resuelve", async () => {
    // Sin la clave en `tablas` el doble responde error de tabla inexistente.
    const db = makeDb({ switch_clientes: CONTADO, vendedores: { switch_id: 3, nombre: "DEFAULT" } });
    const res = await resolvePublicoSwitchActor(db, "active_shoes");
    expect(res.ok).toBe(true);
  });
});
