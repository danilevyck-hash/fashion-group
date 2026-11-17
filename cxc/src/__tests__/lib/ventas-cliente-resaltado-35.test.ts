/**
 * Error n.º 35 de los videos (16-nov-2026) — búsqueda global → cliente de Ventas.
 *
 * `?tab=clientes&cliente=D-25` debe RESALTAR esa fila sin esconder las demás
 * (CLAUDE.md › El módulo Clientes). 🩸 El código de la URL se escribía también
 * en el BUSCADOR (`useState(() => codigoDeLaUrl())` para `search`), y el buscador
 * filtra: la lista quedaba con UNA sola fila.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VENTAS = readFileSync(
  join(__dirname, "..", "..", "..", "src/components/ventas/ClientesView.tsx"),
  "utf8",
);

describe("#35 — ?cliente= resalta, no filtra", () => {
  it("el código de la URL NO arranca el buscador", () => {
    expect(VENTAS).not.toMatch(/\[search,\s*setSearch\]\s*=\s*useState\(\(\)\s*=>\s*codigoDeLaUrl\(\)\)/);
  });
  it("sigue marcando la fila del código", () => {
    expect(VENTAS).toMatch(/\[resaltado\]\s*=\s*useState\(\(\)\s*=>\s*codigoDeLaUrl\(\)\)/);
    expect(VENTAS).toContain("resaltado={!!resaltado && c.id === resaltado}");
  });
  it("y la lleva a la vista (scrollIntoView), porque ya no es la única", () => {
    expect(VENTAS).toMatch(/scrollIntoView/);
  });
});
