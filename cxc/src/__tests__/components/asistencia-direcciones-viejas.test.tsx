/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 LAS DIRECCIONES VIEJAS DE LAS PESTAÑAS DEJAN DE EXISTIR (19-sep-2026).
 *
 * Daniel, mirando `?tab=justificaciones`: *«no creo que debería de existir,
 * ¿no?»*.
 *
 * 🩸 Hasta hoy esas direcciones **se aceptaban y abrían otra pantalla EN
 * SILENCIO**: `?tab=justificaciones` mostraba Asistencia con la URL diciendo
 * «justificaciones». Son CUATRO —`justificaciones`, `vacaciones`,
 * `configuracion` y `reporte`—, más `personas`, que es la misma mudanza de
 * antes. La dirección quedaba viva: se podía volver a compartir, y el Atrás del
 * navegador la devolvía.
 *
 * Lo que este candado exige:
 *   A. La regla pura: cuándo se reescribe y cuándo NO se toca nada.
 *   B. La mudanza NO cambió: cada una sigue cayendo donde vive eso.
 *   C. En la pantalla: la URL se corrige sola, con `replace`.
 *   D. 🔴 Nunca se rompe un enlace bueno ni se escribe una URL vacía.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import {
  CLAVES_MUDADAS, PESTANAS_HOY, PESTANAS_PERSONA_EN_EL_CENTRO,
  claveQueSeReescribe, pestanaMudada, pestanaQueSeAbre,
  type ClavePestana, type Pestana,
} from "@/lib/asistencia/persona-en-el-centro";

const RAIZ = process.cwd();
const puro = (f: string) =>
  fs.readFileSync(path.join(RAIZ, "src", f), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

/** Las cuatro direcciones que Daniel nombró. */
const LAS_CUATRO = ["justificaciones", "vacaciones", "configuracion", "reporte"] as const;

/** Las pestañas del acomodo nuevo, que es el que corre en producción. */
const VISIBLES = PESTANAS_PERSONA_EN_EL_CENTRO;

// ─────────────────────────────────────────────────────────────────────────────
// A. LA REGLA PURA
// ─────────────────────────────────────────────────────────────────────────────

describe("A · cuándo se reescribe la URL", () => {
  it("🔴 las CUATRO direcciones viejas se reescriben a la pestaña que corresponde", () => {
    for (const vieja of LAS_CUATRO) {
      const mostrada = pestanaQueSeAbre(vieja, VISIBLES);
      const aEscribir = claveQueSeReescribe(vieja, mostrada, VISIBLES);
      expect(aEscribir, vieja).not.toBeNull();
      expect(aEscribir, vieja).toBe(mostrada);
      // Y nunca se queda en la clave vieja.
      expect(aEscribir, vieja).not.toBe(vieja);
    }
  });

  it("🔴 una pestaña que SÍ existe no se toca", () => {
    for (const [clave] of VISIBLES) {
      expect(claveQueSeReescribe(clave, clave, VISIBLES)).toBeNull();
    }
  });

  it("🔴 sin `?tab=` no se escribe NADA en la URL", () => {
    // 🩸 Entrar a `/asistencia` a secas no puede empezar a escribir `?tab=` en
    // el historial de todo el mundo.
    expect(claveQueSeReescribe("", "colaboradores", VISIBLES)).toBeNull();
    expect(claveQueSeReescribe(null, "colaboradores", VISIBLES)).toBeNull();
    expect(claveQueSeReescribe(undefined, "colaboradores", VISIBLES)).toBeNull();
    expect(claveQueSeReescribe("   ", "colaboradores", VISIBLES)).toBeNull();
  });

  it("🔴 mientras no se sepa qué ve esta persona, no se toca nada", () => {
    // El rol sale de `sessionStorage` en un efecto: en el PRIMER render no hay
    // ninguna pestaña visible, y reescribir ahí rompería un enlace bueno.
    expect(claveQueSeReescribe("planilla", "reporte", [])).toBeNull();
    expect(claveQueSeReescribe("justificaciones", "reporte", [])).toBeNull();
  });

  it("una dirección que no existe también se corrige, en vez de mentir", () => {
    const mostrada = pestanaQueSeAbre("zzz-no-existe", VISIBLES);
    expect(claveQueSeReescribe("zzz-no-existe", mostrada, VISIBLES)).toBe(mostrada);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. LA MUDANZA NO CAMBIÓ
// ─────────────────────────────────────────────────────────────────────────────

describe("B · cada una sigue cayendo donde vive eso", () => {
  it("🔴 justificaciones → Asistencia · vacaciones y configuracion → Colaboradores", () => {
    const esperado: Record<string, ClavePestana> = {
      justificaciones: "asistencia",
      reporte: "asistencia",
      vacaciones: "colaboradores",
      configuracion: "colaboradores",
      personas: "colaboradores",
    };
    for (const [vieja, destino] of Object.entries(esperado)) {
      expect(pestanaMudada(vieja), vieja).toBe(destino);
      expect(pestanaQueSeAbre(vieja, VISIBLES), vieja).toBe(destino);
    }
  });

  it("las cuatro que nombró Daniel están todas en la lista de mudadas", () => {
    for (const vieja of LAS_CUATRO) expect(CLAVES_MUDADAS).toContain(vieja);
  });

  it("⚠️ CON EL ACOMODO APAGADO, «reporte» es una pestaña de verdad y no se toca", () => {
    const viejas: readonly Pestana[] = PESTANAS_HOY;
    expect(pestanaQueSeAbre("reporte", viejas)).toBe("reporte");
    expect(claveQueSeReescribe("reporte", "reporte", viejas)).toBeNull();
    // Y lo mismo con las otras tres, que ahí siguen existiendo.
    for (const vieja of ["justificaciones", "vacaciones", "configuracion"] as const) {
      expect(claveQueSeReescribe(vieja, pestanaQueSeAbre(vieja, viejas), viejas)).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C y D. EN LA PANTALLA
// ─────────────────────────────────────────────────────────────────────────────

const reemplazos: string[] = [];
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: (u: string) => { reemplazos.push(u); },
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(urlActual),
}));

let urlActual = "";

import AsistenciaClient from "@/app/asistencia/AsistenciaClient";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); reemplazos.length = 0; });

function montar(query: string, rol = "admin") {
  urlActual = query;
  sessionStorage.setItem("cxc_role", rol);
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({ empresas: null }),
  } as Response)));
  return render(<ToastProvider><AsistenciaClient /></ToastProvider>);
}

/** El `tab` de cada URL que el router recibió, en orden (`null` = sin `tab`). */
const tabsEscritos = () =>
  reemplazos.map((u) => new URLSearchParams(u.split("?")[1] ?? "").get("tab"));

/**
 * ¿Alguna de las URL escritas SACÓ el `tab`?
 *
 * 🔑 `useUrlState` borra el parámetro cuando el valor es el de por defecto
 * («la URL queda limpia»), así que corregir a la pestaña por defecto se ve como
 * un `tab` que desaparece. En este arnés `useSearchParams` está congelado, así
 * que el resto de los `replace` —el período del Reporte— arrastran el `tab`
 * viejo: una URL sin `tab` solo puede venir de la corrección.
 */
const seSacoElTab = () => tabsEscritos().some((t) => t === null);

describe("C · la URL se corrige sola", () => {
  // ⚠️ EN LOS TESTS EL ACOMODO NUEVO ESTÁ APAGADO (`NEXT_PUBLIC_PERSONA_EN_EL_CENTRO`
  // no se define en `vitest.config.ts`), y con él apagado las cuatro direcciones
  // de Daniel SON pestañas de verdad: ahí no hay nada que corregir, y el bloque
  // B lo exige. Lo que sí se puede mirar en la pantalla real es la MECÁNICA: una
  // dirección que esta persona no puede abrir se corrige sola en la URL. Las
  // cuatro con el acomodo prendido están cubiertas, una por una, en el bloque A.
  it("🔴 una dirección que no existe deja de existir: la URL se corrige sola", async () => {
    montar("tab=zzz-no-existe");
    await waitFor(() => expect(seSacoElTab()).toBe(true));
  });

  it("🔴 `?tab=personas` —la clave de una tarde de septiembre— también se corrige", async () => {
    montar("tab=personas");
    await waitFor(() => expect(seSacoElTab()).toBe(true));
  });

  it("🔴 una pestaña que esta persona NO ve se corrige a la suya", async () => {
    // `bodega` entra a Asistencia solo para aprobar: la Planilla trae el sueldo
    // de las 38 y su rol no la ve.
    montar("tab=planilla", "bodega");
    await waitFor(() => expect(tabsEscritos().some((t) => t !== "planilla")).toBe(true));
  });

  it("🔴 una pestaña buena NO se reescribe: nadie le cambia el `tab`", async () => {
    montar("tab=planilla");
    await screen.findByRole("heading", { name: "Asistencia" });
    // Se vacía la cola de microtareas —por ahí saldría un `replace` tardío—
    // en vez de contar 60 ms.
    await act(async () => { await Promise.resolve(); });
    for (const t of tabsEscritos()) expect(t).toBe("planilla");
    expect(seSacoElTab()).toBe(false);
  });

  it("🔴 sin `?tab=` no se escribe ninguna pestaña en la URL", async () => {
    montar("");
    await screen.findByRole("heading", { name: "Asistencia" });
    await act(async () => { await Promise.resolve(); });
    // Ni uno de los `replace` lleva `tab`: la entrada normal al módulo no
    // escribe una pestaña en el historial de nadie.
    expect(tabsEscritos().filter((t) => t !== null)).toEqual([]);
  });
});

describe("D · control", () => {
  it("🔴 la regla vive en el módulo PURO, no escrita a mano en la pantalla", () => {
    const cliente = puro("app/asistencia/AsistenciaClient.tsx");
    expect(cliente).toContain("claveQueSeReescribe(tabRaw, tab, visibles)");
    // La pantalla no tiene su propia tabla de mudanzas: la única lista vive en
    // `persona-en-el-centro.ts` (`MUDANZA`).
    expect(cliente).not.toContain("MUDANZA");
    expect(cliente).not.toMatch(/tabRaw === "/);
  });

  it("🔴 es `replace`, no `push`: el Atrás no cicla por la dirección corregida", () => {
    const cliente = puro("app/asistencia/AsistenciaClient.tsx");
    expect(cliente).toMatch(/useUrlState<Tab>\("tab", pestanaPorDefecto\(PERSONA_EN_EL_CENTRO\)\)/);
    expect(cliente).not.toMatch(/useUrlState<Tab>\("tab"[^)]*history: "push"/);
  });
});
