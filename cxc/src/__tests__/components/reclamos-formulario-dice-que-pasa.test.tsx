/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL FORMULARIO NUEVO DICE QUÉ VA A PASAR, Y LO QUE FALTA SE DICE
 * DONDE FALTA (20-sep-2026, aprobado por Daniel).
 *
 * DOS textos que estaban en el lugar equivocado:
 *
 *  1. 🩸 «Sube el PDF y se llenan solos el proveedor, la marca, la factura, la
 *     fecha y el pedido» vivía DENTRO del ⓘ. El ⓘ de esta casa es *«solo para
 *     lo que se aprende una vez»* —metodología, no avisos—, y esto no se
 *     aprende una vez: es lo que hace la pantalla cada vez que se abre, y hay
 *     que saberlo ANTES de subir el archivo, no después. Ahora va bajo el
 *     título. 🔴 El texto NO se borró: se movió.
 *
 *  2. 🩸 «Falta el PDF de la factura» salía al pie, al lado de «Cancelar»,
 *     donde se lee como un pie de foto de los botones y no como lo que le
 *     falta a ESE campo. Ahora va pegado a la caja del archivo.
 *
 * ⚠️ LO QUE FRENA EL GUARDADO NO CAMBIÓ: es el mismo `faltaPdf` y el botón
 * sigue apagado. Este cambio es de dónde se lee, no de qué se exige.
 * ────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/navigation", () => ({
  usePathname: () => "/reclamos",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));

import { ToastProvider } from "@/components/ToastSystem";
import ReclamoForm from "@/app/reclamos/components/ReclamoForm";
import { emptyItem } from "@/app/reclamos/components/constants";
import { FALTA_PDF } from "@/lib/reclamos/validate";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const FORM = "src/app/reclamos/components/ReclamoForm.tsx";

const almacen = () => {
  const datos = new Map<string, string>();
  return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, String(v)); }, removeItem: (k: string) => { datos.delete(k); }, clear: () => datos.clear(), key: (i: number) => [...datos.keys()][i] ?? null, get length() { return datos.size; } } as unknown as Storage;
};
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: almacen(), configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: almacen(), configurable: true, writable: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const noop = () => {};
function pintar(facturaPdfPath: string | null = null) {
  render(
    <ToastProvider>
    <ReclamoForm
      fEmpresa="" setFEmpresa={noop} fFacturas={[]} setFFacturas={noop}
      fFechaFactura="" setFFechaFactura={noop} fPedido="" setFPedido={noop} fNotas="" setFNotas={noop}
      fItems={[emptyItem()]} setFItems={noop as never} fLineas={[]} setFLineas={noop}
      fSeleccion={{}} setFSeleccion={noop as never}
      facturaPdfPath={facturaPdfPath} setFacturaPdfPath={noop}
      savedReclamoId={null} savedNroReclamo="" pendingFotos={[]}
      onAddFoto={noop} onRemoveFoto={noop} onRetryFotos={noop}
      saving={false} error={null} onSave={noop} onCancel={noop}
      onViewSaved={noop} onResetAndCreateAnother={noop}
    />
    </ToastProvider>,
  );
}

describe("🔴 lo que hace la pantalla se dice bajo el título, no dentro del ⓘ", () => {
  it("la frase se ve sin tocar nada", () => {
    pintar();
    expect(document.body.textContent).toContain(
      "Sube el PDF o una foto y se llenan solos el proveedor, la marca, la factura, la fecha y el pedido",
    );
  });

  it("y nombra lo demás que hace: los renglones para marcar", () => {
    pintar();
    expect(document.body.textContent).toContain("los renglones para que marques cuáles reclamas");
    expect(document.body.textContent).toContain("Revisa y corrige");
  });

  it("🔴 el ⓘ de «Qué hace la IA» ya no existe: el texto salió, no se duplicó", () => {
    const src = leer(FORM);
    expect(src).not.toContain('titulo="Qué hace la IA"');
    // La frase aparece UNA sola vez en el archivo.
    expect(src.split("se llenan solos el proveedor").length - 1).toBe(1);
  });

  it("⚠️ CONTROL: el otro ⓘ del formulario (el de las fotos) no se tocó", () => {
    const src = leer(FORM);
    expect(src).toContain('titulo="Cuándo se guardan"');
  });
});

describe("🔴 «Falta el PDF de la factura» va pegado a la caja del archivo", () => {
  it("se ve cuando no hay PDF", () => {
    pintar(null);
    expect(screen.getByText(FALTA_PDF)).toBeTruthy();
  });

  it("y desaparece en cuanto hay PDF", () => {
    pintar("reclamos/algo.pdf");
    expect(screen.queryByText(FALTA_PDF)).toBeNull();
  });

  it("🔴 está ARRIBA, no al pie junto a «Cancelar»", () => {
    pintar(null);
    const aviso = screen.getByText(FALTA_PDF);
    const cancelar = screen.getByRole("button", { name: "Cancelar" });
    expect(aviso.parentElement).not.toBe(cancelar.parentElement);
    // Y viene ANTES que el botón de guardar en el documento.
    const guardar = screen.getByRole("button", { name: /Guardar reclamo/ });
    expect(aviso.compareDocumentPosition(guardar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("se lee como un aviso (rojo), no como un pie de foto gris", () => {
    pintar(null);
    expect(screen.getByText(FALTA_PDF).className).toContain("text-red-600");
  });

  it("⚠️ LO QUE FRENA NO CAMBIÓ: el botón de guardar sigue apagado sin PDF", () => {
    pintar(null);
    expect((screen.getByRole("button", { name: /Guardar reclamo/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    pintar("reclamos/algo.pdf");
    expect((screen.getByRole("button", { name: /Guardar reclamo/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("⚠️ y la frase sigue saliendo de `validate.ts`, no escrita a mano", () => {
    const src = leer(FORM).replace(/\/\*[\s\S]*?\*\//g, " ");
    expect(src).toContain("{FALTA_PDF}");
    expect(src).not.toContain('"Falta el PDF de la factura."');
  });
});
