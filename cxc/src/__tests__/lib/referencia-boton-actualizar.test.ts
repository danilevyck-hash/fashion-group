/**
 * CANDADO — «Actualizar datos de Switch» de Referencia: vuelve, es de TODOS y
 * no abre dos sesiones.
 *
 * ─── LO QUE PASÓ ────────────────────────────────────────────────────────────
 * La ruta `POST /api/ventas/referencia/actualizar` nunca se fue, pero su BOTÓN
 * desapareció el 11-ago-2026 en el rediseño de Referencia (`9b1899e1`): vivía
 * dentro de la «franja de catálogo» que ese PR retiró junto con los veredictos.
 * No fue una decisión — fue colateral, y la ruta quedó viva y sin puerta.
 *
 * ─── LO QUE DANIEL PIDIÓ (4-sep-2026), textual ──────────────────────────────
 *   «activa el botón de Referencia»
 *   «referencia lo puede ver todos, y sin aviso»
 *
 * ─── LO QUE ESTE ARCHIVO VIGILA ─────────────────────────────────────────────
 * 1. 🔴 El botón está en la pantalla.
 * 2. 🔴 Lo puede tocar TODO el que entra al módulo — no solo admin. La lista de
 *    roles es UNA (`REFERENCIA_ROLES`) y la comparten la página, la búsqueda y
 *    esta ruta: tres copias a mano fue justo lo que dejó el POST en `["admin"]`
 *    mientras la pantalla se abría a vendedor y bodega.
 * 3. 🔴 SIN AVISO: nada de «esto te saca del panel de Switch».
 * 4. El ACELERADOR (el de Guías): dos toques seguidos no abren dos sesiones.
 * 5. Lo que la ruta ya hacía sigue: higiene de sesión en el `finally` y el
 *    candado de una corrida a la vez (409).
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { REFERENCIA_ROLES } from "@/lib/ventas/referencia";
import { SYSTEM_ROLE_KEYS } from "@/lib/modules";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

const VISTA = leer("src/components/ventas/ReferenciaView.tsx");
const RUTA_POST = leer("src/app/api/ventas/referencia/actualizar/route.ts");
const RUTA_GET = leer("src/app/api/ventas/referencia/route.ts");
const PAGINA = leer("src/app/referencia/page.tsx");

// ─────────────────────────────────────────────────────────────────────────────
// Dobles: nada de esto toca Switch ni Supabase.
// ─────────────────────────────────────────────────────────────────────────────
const syncSpy = vi.fn(async () => ({
  tablaLista: true,
  articulosUnicos: 10,
  filasEscritas: 10,
  rechazadasPorMonto: 0,
  syncedAt: "2026-09-04T00:00:00.000Z",
}));
const logoutSpy = vi.fn(async () => {});
/** Filas que devuelve la consulta del cooldown. Vacío = no está fresca. */
let corridasRecientes: { id: string }[] = [];

vi.mock("@/lib/switch-api/sync-articulo-info", () => ({
  syncArticuloInfo: (...a: unknown[]) => syncSpy(...(a as [])),
}));
vi.mock("@/lib/switch-api/client", () => ({ logoutAllSwitchSessions: () => logoutSpy() }));
vi.mock("@/lib/supabase-server", () => {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    gte: () => consulta,
    limit: () => Promise.resolve({ data: corridasRecientes, error: null }),
  };
  return { supabaseServer: { from: () => consulta } };
});

import { POST } from "@/app/api/ventas/referencia/actualizar/route";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-referencia-boton"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

beforeEach(() => {
  syncSpy.mockClear();
  logoutSpy.mockClear();
  corridasRecientes = [];
});

function pedir(role: string, empresa = "vistana"): NextRequest {
  const cookie = signSession({ role, userId: "u1", userName: "quien", sessionToken: "t1", modules: ["referencia"] });
  return new NextRequest("https://fashiongr.com/api/ventas/referencia/actualizar", {
    method: "POST",
    headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
    body: JSON.stringify({ empresa }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el botón existe en /referencia", () => {
  it("la vista lo dibuja, con su estado mientras corre", () => {
    const src = sinComentarios(VISTA);
    expect(src).toContain("Actualizar datos de Switch");
    expect(src).toContain("Actualizando…");
    expect(src).toContain('fetch("/api/ventas/referencia/actualizar"');
    // Y no se puede tocar dos veces mientras trabaja.
    expect(src).toContain("disabled={actualizando || cargando}");
  });

  it("CONTROL: el resto de la pantalla sigue (buscador y Excel)", () => {
    const src = sinComentarios(VISTA);
    expect(src).toContain("Bajar a Excel");
    expect(src).toContain("aria-label=\"Buscar referencia\"");
  });

  it("🔴 SIN AVISO: no aparece ninguna advertencia sobre el panel de Switch", () => {
    // Daniel: «referencia lo puede ver todos, y sin aviso». Se mide sobre la
    // fuente SIN comentarios: el comentario que explica la regla cita justo lo
    // que la regla prohíbe decir en pantalla.
    const src = sinComentarios(VISTA);
    for (const frase of ["te saca", "sacará", "panel de Switch", "expulsa", "cierra tu sesión", "puede tardar"]) {
      expect(src, `la vista no puede decir «${frase}»`).not.toContain(frase);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 lo toca todo el que ve la pantalla, no solo admin", () => {
  it("la lista de roles es la MISMA en los tres lugares, y no está escrita a mano", () => {
    expect([...REFERENCIA_ROLES]).toEqual(["admin", "vendedor", "bodega"]);
    for (const [nombre, src] of [["la página", PAGINA], ["el GET", RUTA_GET], ["el POST", RUTA_POST]] as const) {
      const limpio = sinComentarios(src);
      expect(limpio, `${nombre} usa la lista única`).toContain("REFERENCIA_ROLES");
      expect(limpio, `${nombre} no escribe su propia copia`).not.toMatch(
        /\[\s*"admin",\s*"vendedor",\s*"bodega"\s*\]/,
      );
    }
    // Y el POST no puede volver a quedarse en solo-admin.
    expect(sinComentarios(RUTA_POST)).not.toMatch(/requireRole\(\s*req,\s*\[\s*"admin"\s*\]\s*\)/);
  });

  it("los tres roles entran (200), y ninguno de ellos recibe 403", async () => {
    for (const rol of REFERENCIA_ROLES) {
      const res = await POST(pedir(rol));
      expect(res.status, `${rol} rebotado`).toBe(200);
    }
    expect(syncSpy).toHaveBeenCalledTimes(REFERENCIA_ROLES.length);
  });

  it("CONTROL: a un rol de fuera del módulo sí se le contesta 403", async () => {
    const fuera = SYSTEM_ROLE_KEYS.filter(
      (r) => r !== "admin" && !(REFERENCIA_ROLES as readonly string[]).includes(r),
    );
    expect(fuera.length).toBeGreaterThan(0);
    for (const rol of fuera) {
      const res = await POST(pedir(rol));
      expect(res.status, `${rol} entró y no debía`).toBe(403);
    }
    expect(syncSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el acelerador: dos toques seguidos no abren dos sesiones", () => {
  it("con una corrida exitosa reciente NO se llama a Switch", async () => {
    corridasRecientes = [{ id: "corrida-de-hace-2-min" }];
    const res = await POST(pedir("admin"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, omitido: "fresca" });
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("sin corrida reciente sí se llama (el acelerador no apaga el botón para siempre)", async () => {
    corridasRecientes = [];
    const res = await POST(pedir("admin"));
    expect(res.status).toBe(200);
    expect(syncSpy).toHaveBeenCalledTimes(1);
  });

  it("el cooldown es el MISMO de Guías, no un número nuevo", () => {
    const src = sinComentarios(RUTA_POST);
    expect(src).toContain("SYNC_NOW_COOLDOWN_MIN");
    expect(src).toMatch(/sync_type[^\n]*articulo_info|eq\("sync_type", "articulo_info"\)/);
    // Fail-open: si la consulta del cooldown falla, se refresca igual.
    expect(src).toContain("if (error) return false;");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("lo que la ruta ya hacía sigue en pie", () => {
  it("cierra las sesiones de Switch en el finally, pase lo que pase", async () => {
    await POST(pedir("admin"));
    expect(logoutSpy).toHaveBeenCalledTimes(1);
    // También cuando se omite por el acelerador.
    corridasRecientes = [{ id: "x" }];
    await POST(pedir("admin"));
    expect(logoutSpy).toHaveBeenCalledTimes(2);
  });

  it("una empresa fuera de las 6 del grupo da 400 y no toca Switch", async () => {
    const res = await POST(pedir("admin", "confecciones_boston"));
    expect(res.status).toBe(400);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("el candado de una corrida a la vez sigue contestando 409", async () => {
    syncSpy.mockRejectedValueOnce(new Error("Ya hay una corrida en curso"));
    const res = await POST(pedir("admin"));
    expect(res.status).toBe(409);
  });
});
