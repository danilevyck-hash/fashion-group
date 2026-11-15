// ─────────────────────────────────────────────────────────────────────────────
// Revisión 110 · ajustes (3): /clientes hidrata sin diferencias.
//
// 🩸 En producción la lista tiraba los errores #418/#422 de React: la hoja de
// «Todos ▾» (`HojaMenu`) devolvía `null` en el servidor y un portal en la
// primera pasada del navegador, y el «Ordenar» de al lado ya no cuadraba.
// Aquí se dibuja como el servidor (sin `document` ni `window`) y se hidrata.
// ─────────────────────────────────────────────────────────────────────────────

import { it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act } from "@testing-library/react";
import ClientesListClient from "@/app/clientes/ClientesListClient";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/clientes",
}));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true, role: "admin" }) }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));

/** Lo que manda el servidor: sin `document` ni `window`. */
function comoElServidor(el: React.ReactElement): string {
  const g = globalThis as Record<string, unknown>;
  const d = g.document;
  const w = g.window;
  delete g.document;
  delete g.window;
  try {
    return renderToString(el);
  } finally {
    g.document = d;
    g.window = w;
  }
}

it("la lista de clientes hidrata sin diferencias (sin #418/#422)", async () => {
  const clientes = [{ id: "1", codigo: "D-25", nombre: "City Mall", razon_social: null, telefono: "727-7247", celular: null, email: "a@b.com", debe: 300 }];
  const el = <ClientesListClient initialClientes={clientes} actualizado="2026-11-14T07:00:00Z" />;
  const div = document.createElement("div");
  div.innerHTML = comoElServidor(el);
  document.body.appendChild(div);
  const errores: string[] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => { errores.push(a.map(String).join(" ")); };
  try {
    await act(async () => {
      hydrateRoot(div, el, { onRecoverableError: (e) => errores.push(`recuperable: ${String((e as Error)?.message ?? e)}`) });
    });
  } finally {
    console.error = original;
  }
  expect(errores.filter((e) => /hydrat|did not match|did not expect|recuperable/i.test(e))).toEqual([]);
});
