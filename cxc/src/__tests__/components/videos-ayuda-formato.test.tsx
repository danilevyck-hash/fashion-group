// «Ver en formato celular» (15-nov-2026): abre en 16:9, el cambio pide la otra
// lista al servidor y queda recordado por quien mira (localStorage, con try/catch).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import VideosAyuda from "@/components/VideosAyuda";

const respuesta = (formato: string, conFormatoCelular: boolean) => ({
  modulo: "Ventas",
  formato,
  conFormatoCelular,
  lista: [{ orden: 0, titulo: formato === "celular" ? "Intro celular" : "Intro", segundos: 50, url: `https://f/${formato}.mp4`, miniatura: null, compartir: null }],
  completo: null,
});

let conCelular = true;
const fetchMock = vi.fn(async (u: string) => {
  if (!String(u).startsWith("/api/videos-ayuda")) return { ok: false, blob: async () => new Blob() };
  const f = new URL(String(u), "http://x").searchParams.get("formato") ?? "computadora";
  return { ok: true, json: async () => respuesta(f, conCelular) };
});

let guardado = new Map<string, string>();
const almacen = {
  getItem: (k: string) => guardado.get(k) ?? null,
  setItem: (k: string, v: string) => void guardado.set(k, v),
  removeItem: (k: string) => void guardado.delete(k),
};
beforeEach(() => {
  conCelular = true;
  guardado = new Map();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", almacen);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const pedidos = () => fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/videos-ayuda"));

describe("formato de los videos", () => {
  it("abre en computadora; cambiar pide la de teléfono y lo recuerda", async () => {
    render(<VideosAyuda modulo="ventas" open onClose={() => {}} />);
    const boton = await screen.findByRole("button", { name: "Ver en formato celular" });
    expect(pedidos()[0]).toContain("formato=computadora");
    fireEvent.click(boton);
    await screen.findByRole("button", { name: "Ver en formato computadora" });
    await waitFor(() => expect(pedidos().at(-1)).toContain("formato=celular"));
    expect(guardado.get("fg_videos_formato")).toBe("celular");
    cleanup();
    render(<VideosAyuda modulo="ventas" open onClose={() => {}} />);
    await screen.findByRole("button", { name: "Ver en formato computadora" });
    expect(pedidos().at(-1)).toContain("formato=celular");
  });

  it("sin versión de teléfono no se ofrece el cambio", async () => {
    conCelular = false;
    render(<VideosAyuda modulo="caja" open onClose={() => {}} />);
    await screen.findAllByText("Intro");
    expect(screen.queryByRole("button", { name: /Ver en formato/ })).toBeNull();
  });

  it("sin almacenamiento no se cae: abre en computadora", async () => {
    const roto = () => { throw new Error("bloqueado"); };
    vi.stubGlobal("localStorage", { getItem: roto, setItem: roto, removeItem: roto });
    render(<VideosAyuda modulo="ventas" open onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Ver en formato celular" }));
    await screen.findByRole("button", { name: "Ver en formato computadora" });
  });
});
