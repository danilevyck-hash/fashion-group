// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CONDUCTA — EL GUARD DEL CATÁLOGO Y EL MÓDULO PRESTADO (27-ago-2026)
//
// `CatalogoAuthGuard` es lo único que separa a alguien de `/catalogo/<marca>`,
// y **mira `fg_modules`, no el rol**. Eso tenía una consecuencia que solo se ve
// montando el componente: un módulo PRESTADO (`MODULO_HEREDA_PERMISO_DE`) se
// pinta en el menú y esta pantalla lo rebotaba a `/`.
//
// Le pasa a David HOY: su fila de `role_permissions` dice `["boston"]` y va a
// seguir diciendo eso hasta que corra la DDL `20260902130000`. La ficha se le
// enciende por la herencia; si el guard no la mirara, tocarla lo sacaría de la
// app — el peor final posible, porque «se ve el botón y no hace nada» se lee
// como que la app está rota.
//
// 🩸 ESTO NO LO PUEDE VER UN BARRIDO DE TEXTO: que el archivo importe
// `fgModulesDaAcceso` no prueba que lo llame, y que un comentario diga
// «funciona antes de la DDL» no prueba que funcione. Acá se monta el guard de
// verdad y se mira si el hijo llegó a la pantalla o si el router se lo llevó.
//
// Las dos mitades importan igual:
//   1. 🔴 ENTRA quien tiene el módulo prestado (David con ["boston"]).
//   2. 🔴 NO ENTRA quien no lo tiene por ningún lado — y el guard sigue
//      rebotando a `/`, que es lo que impide que esto se convierta en «pasan
//      todos».
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const ROUTER = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  useParams: () => ({}),
  usePathname: () => "/catalogo/tommy",
  useSearchParams: () => new URLSearchParams(),
}));

import CatalogoAuthGuard from "@/components/catalogo/CatalogoAuthGuard";
import { ROL_BOSTON, MODULO_BOSTON } from "@/lib/boston/rol";

const ADENTRO = "el-catalogo-se-dibujo";

function montar(role: string, modulos: string[] | null) {
  sessionStorage.clear();
  sessionStorage.setItem("cxc_role", role);
  if (modulos) sessionStorage.setItem("fg_modules", JSON.stringify(modulos));
  render(
    <CatalogoAuthGuard>
      <div>{ADENTRO}</div>
    </CatalogoAuthGuard>,
  );
}

const entro = () => screen.queryByText(ADENTRO) !== null;

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("🔴 el guard deja entrar al módulo PRESTADO", () => {
  it("David con fg_modules = ['boston'] (la DDL todavía no corrió) ENTRA", () => {
    montar(ROL_BOSTON, [MODULO_BOSTON]);
    expect(entro(), "el guard lo rebotó: la ficha del menú lo sacaría de la app").toBe(true);
    expect(ROUTER.push).not.toHaveBeenCalled();
  });

  it("y con la DDL ya corrida (['boston','catalogos']) también", () => {
    montar(ROL_BOSTON, [MODULO_BOSTON, "catalogos"]);
    expect(entro()).toBe(true);
    expect(ROUTER.push).not.toHaveBeenCalled();
  });
});

describe("🔴 y NO se volvió «pasan todos»", () => {
  it("un rol SIN el módulo, ni directo ni prestado, se va a /", () => {
    montar("contabilidad", ["prestamos", "proveedores", "gastos-contabilidad"]);
    expect(entro(), "contabilidad entró al catálogo").toBe(false);
    expect(ROUTER.push).toHaveBeenCalledWith("/");
  });

  it("gerente_acs con su único módulo tampoco entra", () => {
    montar("gerente_acs", ["multifashion"]);
    expect(entro()).toBe(false);
    expect(ROUTER.push).toHaveBeenCalledWith("/");
  });

  it("🩸 y `boston` NO es una llave maestra: solo presta `catalogos`", () => {
    // La herencia se recorta por el `roles[]` del hijo. Un rol que no está en
    // la lista de Catálogos no entra aunque le pongan `boston` a mano.
    montar("contabilidad", [MODULO_BOSTON]);
    expect(entro(), "contabilidad heredó el catálogo").toBe(false);
    expect(ROUTER.push).toHaveBeenCalledWith("/");
  });

  it("sin fg_modules guardado, se va a / (fail-closed)", () => {
    montar(ROL_BOSTON, null);
    expect(entro()).toBe(false);
    expect(ROUTER.push).toHaveBeenCalledWith("/");
  });

  it("los cuatro roles de siempre entran con su módulo DIRECTO (no se les tocó nada)", () => {
    for (const rol of ["admin", "secretaria", "vendedor", "bodega"]) {
      cleanup();
      vi.clearAllMocks();
      montar(rol, ["catalogos", "guias"]);
      expect(entro(), `${rol} perdió el catálogo`).toBe(true);
      expect(ROUTER.push, `${rol} fue rebotado`).not.toHaveBeenCalled();
    }
  });
});
