// ─────────────────────────────────────────────────────────────────────────────
// «QUIÉN USA QUÉ» — la PANTALLA (25-sep-2026).
//
// Vive dentro de Usuarios, que ya es la pantalla SOLO de admin donde se mira
// quién es quién. Lo que se fija acá:
//   · 🔴 la pestaña es SOLO de admin, en la pantalla y en la lista de `?tab=`;
//   · lo que se lee es lo que contesta el servidor: módulos, personas, aparato
//     y «hace cuánto» — sin gráficas y sin inventar un cero;
//   · con la migración pendiente la pantalla lo DICE, no muestra ceros;
//   · 🔴 el componente que anota no dibuja NADA.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen, waitFor } from "@testing-library/react";

const RAIZ = path.resolve(__dirname, "../../..");
const PAGINA = fs.readFileSync(path.join(RAIZ, "src/app/admin/usuarios/page.tsx"), "utf8");

vi.mock("next/navigation", () => ({ usePathname: () => "/cxc" }));

import VisitasTab from "@/app/admin/usuarios/VisitasTab";
import RegistroDeVisitas from "@/components/RegistroDeVisitas";

const RESPUESTA = {
  tablaLista: true,
  desde: "2026-08-26",
  dias: 30,
  diasQueSeGuardan: 180,
  personas: [
    { modulo: "cxc", moduloLabel: "Cuentas por Cobrar", userId: "u-1", nombre: "Angela", rol: "secretaria", visitas: 7, celular: 3, computadora: 4, ultimaEn: "2026-09-25T14:00:00Z" },
    { modulo: "comisiones", moduloLabel: "Comisiones", userId: "u-2", nombre: "yulissa", rol: "contabilidad", visitas: 2, celular: 0, computadora: 2, ultimaEn: "2026-09-25T16:00:00Z" },
  ],
  modulos: [
    { modulo: "cxc", moduloLabel: "Cuentas por Cobrar", personas: 2, visitas: 8 },
    { modulo: "comisiones", moduloLabel: "Comisiones", personas: 1, visitas: 2 },
  ],
  sinVisitas: [{ modulo: "referencia", moduloLabel: "Referencia", personas: 0, visitas: 0 }],
};

function responderCon(cuerpo: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok, json: async () => cuerpo })));
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("La pestaña «Quién usa qué»", () => {
  it("🔴 es SOLO de admin: la pestaña y su contenido cuelgan de `esAdmin`", () => {
    expect(PAGINA).toMatch(/SOLO_ADMIN: readonly string\[\] = \["novedades", "visitas"\]/);
    // El disparador y el contenido, los dos adentro de un `esAdmin &&`.
    const trigger = PAGINA.indexOf('<TabsTrigger value="visitas"');
    const contenido = PAGINA.indexOf('<TabsContent value="visitas"');
    expect(trigger).toBeGreaterThan(0);
    expect(contenido).toBeGreaterThan(0);
    expect(PAGINA.slice(Math.max(0, trigger - 220), trigger)).toContain("esAdmin &&");
    expect(PAGINA.slice(Math.max(0, contenido - 220), contenido)).toContain("esAdmin &&");
  });

  it("dice quién entra a cada módulo, con su rol y desde dónde", async () => {
    responderCon(RESPUESTA);
    render(<VisitasTab />);
    await waitFor(() => expect(screen.getByText("Angela")).toBeTruthy());

    // El resumen por módulo, en plata de conteos: personas y visitas.
    expect(screen.getByText("2 personas · 8 visitas")).toBeTruthy();
    expect(screen.getByText("1 persona · 2 visitas")).toBeTruthy();
    // La persona, su rol y el aparato.
    expect(screen.getByText("secretaria")).toBeTruthy();
    expect(screen.getByText("3 en el teléfono")).toBeTruthy();
    expect(screen.getByText("computadora")).toBeTruthy();
    // 🔴 El módulo que nadie abrió también se dice.
    expect(screen.getByText(/Nadie los abrió en 30 días/)).toBeTruthy();
    expect(screen.getByText("Referencia")).toBeTruthy();
  });

  it("🔴 con la migración pendiente lo DICE; no dibuja ceros como si midiera", async () => {
    responderCon({ ...RESPUESTA, tablaLista: false, personas: [], modulos: [], sinVisitas: [] });
    render(<VisitasTab />);
    await waitFor(() =>
      expect(screen.getByText(/falta correr el cambio de base/i)).toBeTruthy(),
    );
    expect(screen.queryByText("0 personas · 0 visitas")).toBeNull();
  });

  it("todavía sin visitas: lo dice con palabras, no con una tabla vacía", async () => {
    responderCon({ ...RESPUESTA, personas: [], modulos: [], sinVisitas: [] });
    render(<VisitasTab />);
    await waitFor(() =>
      expect(screen.getByText(/Todavía no hay visitas anotadas/i)).toBeTruthy(),
    );
  });
});

describe("El componente que anota", () => {
  it("🔴 no dibuja NADA: ni un nodo en la pantalla", () => {
    vi.stubGlobal("navigator", { sendBeacon: () => true });
    const { container } = render(<RegistroDeVisitas />);
    expect(container.innerHTML).toBe("");
  });
});
