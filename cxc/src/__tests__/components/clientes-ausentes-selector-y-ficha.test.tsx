/**
 * CANDADO (pantallas) — el cliente que Switch dejó de mandar:
 *
 *   · el SELECTOR no lo ofrece (ni buscando ni en el fallback),
 *   · la FICHA sí lo muestra, con «Ya no está en Switch» y desde cuándo,
 *   · y el nombre SIGUE saliendo en una guía vieja (el mapa código→nombre
 *     no filtra — quitar el ausente de ahí dejaría el chip en "D-30" pelado).
 *
 * Aprobado por Daniel el 4-sep-2026 («APROBADO»). La regla de quién se marca
 * vive en `lib/clientes/ausentes` y se prueba en
 * `src/__tests__/lib/clientes-ausentes-de-switch.test.ts`; acá va lo que solo
 * se ve renderizando: ofrecer, rotular, nombrar.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import ClientePicker from "@/components/ClientePicker";
import {
  invalidarDirectorioClientes,
  useNombresDeClientes,
} from "@/lib/hooks/useBusquedaClientes";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/clientes/D-30",
}));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: "admin" }),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));

import ClienteDetail, { type ClienteDetailData } from "@/app/clientes/[codigo]/ClienteDetail";

// El directorio como lo devuelve /api/clientes: CON el ausente y su marca.
const DIRECTORIO = [
  { codigo: "D-24", nombre: "City Mall David", ausente_desde: null },
  { codigo: "D-26", nombre: "City Moda Chorrera", ausente_desde: null },
  // El duplicado que Switch ya no manda (borrado en las 6 el 13-ago-2026).
  { codigo: "D-30", nombre: "City Moda Chorrera", ausente_desde: "2026-08-13T05:41:34Z" },
];

beforeEach(() => {
  invalidarDirectorioClientes();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ clientes: DIRECTORIO, total: DIRECTORIO.length }),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  invalidarDirectorioClientes();
});

function Selector() {
  const [cliente, setCliente] = useState("");
  const [codigo, setCodigo] = useState("");
  return (
    <ClientePicker
      value={cliente}
      codigo={codigo}
      clientesDelGrupo={[]}
      onChange={(n, c) => {
        setCliente(n);
        setCodigo(c);
      }}
    />
  );
}

describe("🔴 el selector no ofrece al ausente", () => {
  it('buscar "city" ofrece D-24 y D-26, y NUNCA D-30', async () => {
    render(<Selector />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "city" } });

    await waitFor(() => {
      expect(screen.getByText("D-24")).toBeTruthy();
    });
    expect(screen.getByText("D-26")).toBeTruthy();
    // El vivo homónimo se ofrece; el duplicado ausente no aparece por ningún lado.
    expect(screen.queryByText("D-30")).toBeNull();
  });

  it("ni buscando su código exacto", async () => {
    render(<Selector />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "D-30" } });

    await waitFor(() => {
      expect(screen.getByText(/No está en el directorio/)).toBeTruthy();
    });
    expect(screen.queryByText("D-30")).toBeNull();
  });
});

describe("🔴 el nombre sigue saliendo en una guía vieja", () => {
  function ChipDeGuiaVieja({ codigo }: { codigo: string }) {
    // Lo mismo que hace la lista de guías con `guia_items.cliente_codigo`.
    const nombres = useNombresDeClientes(true);
    return <span>{nombres.get(codigo.toUpperCase()) ?? codigo}</span>;
  }

  it("una línea atada a D-30 muestra el nombre, no el código pelado", async () => {
    render(<ChipDeGuiaVieja codigo="D-30" />);
    await waitFor(() => {
      expect(screen.getByText("City Moda Chorrera")).toBeTruthy();
    });
    expect(screen.queryByText("D-30")).toBeNull();
  });
});

describe("la ficha lo dice, con fecha", () => {
  const base: ClienteDetailData = {
    cliente: {
      id: "x",
      codigo: "D-30",
      nombre: "City Moda Chorrera",
      razon_social: null,
      identificacion: null,
      dv: null,
      provincia: null,
      telefono: null,
      celular: null,
      email: null,
      notas: null,
      last_synced_at: null,
      updated_at: null,
      created_at: null,
      ausente_desde: "2026-08-13T05:41:34Z",
    },
    empresas: [],
    total_grupo: { ventas_ytd: 0, cobrado_ytd: 0, cxc: 0, ultima_factura: null },
    ultimas_guias: [],
  };

  it("con la marca: «Ya no está en Switch» + desde cuándo", () => {
    render(<ClienteDetail initialData={base} />);
    expect(screen.getByText(/Ya no está en Switch desde el 13 ago 2026/)).toBeTruthy();
    // y el cliente se sigue viendo normal — no se borró
    expect(screen.getByText("City Moda Chorrera")).toBeTruthy();
  });

  it("sin la marca (o con la migración pendiente): ni rastro del rótulo", () => {
    render(
      <ClienteDetail
        initialData={{ ...base, cliente: { ...base.cliente, ausente_desde: undefined } }}
      />,
    );
    expect(screen.queryByText(/Ya no está en Switch/)).toBeNull();
  });
});
