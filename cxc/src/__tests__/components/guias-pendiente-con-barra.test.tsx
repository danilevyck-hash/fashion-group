/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EL «PENDIENTE» SE VE TAMBIÉN CON LA BARRA DEL CELULAR (7-oct-2026)
 *
 * Daniel: *«¿Cómo hago para ver qué se despachó y qué no? Antes había un
 * tag.»*
 *
 * El chip «Pendiente» de la tarjeta vivía junto al nombre del cliente, y la
 * barra v3.1 (2-oct-2026) lo escondió ahí con `!barra`: *«el chip tapaba el
 * nombre del cliente»*. El problema es que `BARRA_CELULAR_2026_10` está
 * PRENDIDO en producción, así que en el celular `barra` es SIEMPRE `true` —
 * el chip no se veía NUNCA ahí y quedaba solo el borde ámbar de 4 px como
 * única señal, demasiado sutil para notarlo de un vistazo.
 *
 * Ahora el chip se movió a la línea de abajo (destino · bultos ·
 * transportista), donde no compite con nada, y se ve CON y SIN la barra.
 * Una despachada sigue sin ningún chip a propósito: el verde que decía lo
 * mismo en 221 de 222 guías no vuelve (candado `guias-lista-que-se-lee-sola`,
 * sección 4).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import GuiasList from "@/app/despachos/components/GuiasList";
import { ProveedorBarraCelular } from "@/components/celular/BarraDeControles";
// 🔴 PRECARGA A TIEMPO: la pantalla pide el papel de la guía sin esperarlo.
import "@/lib/guias/papel-de-la-guia";
import type { Guia, GuiaItem } from "@/app/despachos/components/types";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  vi.setSystemTime(new Date("2026-09-05T15:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ITEMS: GuiaItem[] = [
  { id: "i1", orden: 1, cliente: "City Mall Paso Canoa", cliente_codigo: "D-25", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "2520", bultos: 7, numero_guia_transp: "725" },
];

function guia(over: Partial<Guia> = {}): Guia {
  return {
    id: "g240", numero: 240, fecha: "2026-09-04", transportista: "RedNblue",
    modo_entrega: "transportista", transportista_id: "t1", placa: "EK0700",
    observaciones: "", total_bultos: 7, item_count: 1, estado: "Completada",
    entregado_por: "Julio", receptor_nombre: "Eric", cedula: "8-930-2142",
    numero_guia_transp: "725", guia_items: ITEMS,
    ...over,
  } as Guia;
}

/** Pinta la lista DENTRO de la barra del celular (`activo: true`, como en producción). */
function pintarConBarra(guias: Guia[]) {
  return render(
    <ProveedorBarraCelular activo={true}>
      <GuiasList
        guias={guias} loading={false} error={null} search="" setSearch={() => {}}
        showPending={false} setShowPending={() => {}} role="admin" onNewGuia={() => {}}
        expandedId={null} expandedGuia={null} expandedLoading={false} onToggleExpand={() => {}}
        onEditar={() => {}} onDespachar={() => {}} onDelete={() => {}}
        onAtarCliente={() => {}}
      />
    </ProveedorBarraCelular>,
  );
}

/** La tarjeta del teléfono de la PRIMERA guía. */
const tarjeta = (c: HTMLElement) => c.querySelector<HTMLElement>(".lg\\:hidden.px-4")!;

describe("🔴 el chip «Pendiente» se ve CON la barra del celular prendida", () => {
  it("una guía pendiente dice «Pendiente» en la tarjeta, aunque haya barra", () => {
    const { container } = pintarConBarra([guia({ estado: "Pendiente Bodega" })]);
    expect(tarjeta(container).textContent).toContain("Pendiente");
  });

  it("una despachada sigue sin ningún chip: el verde que sobraba no vuelve", () => {
    const { container } = pintarConBarra([guia({ estado: "Completada" })]);
    expect(tarjeta(container).textContent).not.toContain("Pendiente");
  });

  it("el chip no vive junto al nombre del cliente: ahí fue donde lo tapaba", () => {
    const { container } = pintarConBarra([guia({ estado: "Pendiente Bodega" })]);
    const filaDelNombre = tarjeta(container).querySelector<HTMLElement>(".flex.items-center.justify-between.gap-2")!;
    expect(filaDelNombre.textContent).not.toContain("Pendiente");
  });
});
