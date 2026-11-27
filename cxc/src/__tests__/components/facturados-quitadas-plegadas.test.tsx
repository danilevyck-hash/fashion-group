// 🔴 Candado (Daniel, 27-nov-2026: «siempre en plegable las ocultas, al menos
// que apriete el botón»): «Ver quitadas (N)» arranca plegado, solo el botón lo
// abre, cada lectura de la lista lo vuelve a plegar y no se guarda en ningún lado.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import FacturadosLista, { type FacturadoQuitado } from "@/app/despachos/components/FacturadosLista";

vi.mock("@/components/ui/OverflowMenu", () => ({ default: () => null }));

const quitada: FacturadoQuitado = {
  empresa_key: "active_shoes", secuencial: "11-000001404", fecha: "2026-11-25T05:00:00+00:00",
  cliente_codigo: "D-12", cliente_nombre: "Boutique Demo", bultos: null,
  quitada_id: 1, quitada_por: "andrea", quitada_en: "2026-11-27T13:59:00Z",
};
const lista = (clave: number, celular = false) => (
  <FacturadosLista filas={[]} hoy="2026-11-27" celular={celular} quitadas={[quitada]} onDevolver={() => {}} plegarClave={clave} />
);

describe("«Ver quitadas» siempre plegado", () => {
  for (const celular of [false, true]) {
    it(`arranca plegado y solo el botón lo abre (${celular ? "teléfono" : "computadora"})`, () => {
      const { rerender } = render(lista(1, celular));
      expect(screen.queryByText("Boutique Demo")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Ver quitadas (1)" }));
      expect(screen.getByText("Boutique Demo")).toBeTruthy();
      // Mismo render sin releer: se queda como lo dejó la persona.
      rerender(lista(1, celular));
      expect(screen.getByText("Boutique Demo")).toBeTruthy();
      // Releer la lista (entrar, cambiar de paso, volver, actualizar, deslizar): plegado.
      rerender(lista(2, celular));
      expect(screen.queryByText("Boutique Demo")).toBeNull();
      expect(screen.getByRole("button", { name: "Ver quitadas (1)" })).toBeTruthy();
    });
  }

  it("no se recuerda: ni almacenamiento ni URL", () => {
    const src = readFileSync(join(process.cwd(), "src/app/despachos/components/FacturadosLista.tsx"), "utf8");
    expect(src).not.toMatch(/localStorage|sessionStorage|useUrlState|usePersistedState|searchParams/);
  });

  it("toda lectura pliega, salvo el relevo de cada 5 min", () => {
    const src = readFileSync(join(process.cwd(), "src/app/despachos/components/PedidosView.tsx"), "utf8");
    expect(src).toMatch(/if \(!sinPlegar\) setPlegarQuitadas/);
    expect(src).toMatch(/plegarClave=\{plegarQuitadas\}/);
    expect(src.match(/cargar\(true, true\)/g)).toHaveLength(1);
  });
});
