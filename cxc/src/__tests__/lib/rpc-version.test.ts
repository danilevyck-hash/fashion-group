// El puente entre "el código ya está desplegado" y "el SQL todavía no corrió".
//
// Las migraciones de este repo las corre Daniel a mano. Entre el deploy y la
// corrida hay una ventana en la que la función nueva no existe, y en esa ventana
// la proyección de cierre tiene que seguir dando un número (el de la versión
// anterior) en vez de desaparecer de /ventas.

import { describe, it, expect, vi } from "vitest";
import { rpcConFallbackDeVersion, esFuncionInexistente } from "@/lib/ventas/rpc-version";

const ok = (data: unknown) => async () => ({ data, error: null });
const falla = (error: { message?: string; code?: string }) => async () => ({ data: null, error });

describe("rpcConFallbackDeVersion", () => {
  it("usa la versión nueva cuando existe y ni toca la anterior", async () => {
    const anterior = vi.fn(ok("vieja"));
    const r = await rpcConFallbackDeVersion(ok("nueva"), anterior);
    expect(r.data).toBe("nueva");
    expect(anterior).not.toHaveBeenCalled();
  });

  it("cae a la anterior cuando la migración todavía no corrió", async () => {
    const logger = vi.fn();
    const r = await rpcConFallbackDeVersion(
      falla({ code: "PGRST202", message: "Could not find the function public.ventas_proyeccion_cierre_v7" }),
      ok("vieja"),
      { label: "v7", logger },
    );
    expect(r.data).toBe("vieja");
    expect(r.error).toBeNull();
    expect(logger).toHaveBeenCalledOnce();
  });

  it("NO reintenta con la anterior si el fallo fue un timeout", async () => {
    // La anterior es la MISMA consulta pero más lenta: correrla solo duplica la
    // espera del usuario. El retry de más arriba es el que tiene que actuar.
    const anterior = vi.fn(ok("vieja"));
    const r = await rpcConFallbackDeVersion(
      falla({ code: "57014", message: "canceling statement due to statement timeout" }),
      anterior,
      { logger: vi.fn() },
    );
    expect(anterior).not.toHaveBeenCalled();
    expect(r.error?.code).toBe("57014");
  });

  it("si la anterior también falla, devuelve ese error (no se lo traga)", async () => {
    const r = await rpcConFallbackDeVersion(
      falla({ code: "PGRST202", message: "not found" }),
      falla({ message: "tampoco existe" }),
      { logger: vi.fn() },
    );
    expect(r.data).toBeNull();
    expect(r.error?.message).toBe("tampoco existe");
  });
});

describe("esFuncionInexistente", () => {
  it("reconoce la firma de 'la migración no corrió'", () => {
    expect(esFuncionInexistente({ code: "PGRST202" })).toBe(true);
    expect(esFuncionInexistente({ code: "42883" })).toBe(true);
    expect(esFuncionInexistente({ message: "Could not find the function public.foo" })).toBe(true);
    expect(esFuncionInexistente({ message: 'function foo(integer) does not exist' })).toBe(true);
  });

  it("no confunde un timeout ni un error de permisos con una función ausente", () => {
    expect(esFuncionInexistente({ code: "57014", message: "canceling statement" })).toBe(false);
    expect(esFuncionInexistente({ message: "permission denied for function foo" })).toBe(false);
    expect(esFuncionInexistente(null)).toBe(false);
  });
});
