import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const signed = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { storage: { from: () => ({ createSignedUrls: signed }) } },
}));
const sesion = vi.fn();
vi.mock("@/lib/session-cookie", () => ({ verifySession: () => sesion() }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/videos-ayuda/route";
import { VIDEOS_AYUDA, videosDelModulo, duracion, tituloEnLista, tieneVideos } from "@/lib/videos-ayuda/manifiesto";
import { ALL_MODULE_KEYS, ALL_MODULES } from "@/lib/modules";

const req = (modulo: string) =>
  new NextRequest(`http://x/api/videos-ayuda?modulo=${modulo}`, { headers: { cookie: "cxc_session=x" } });

describe("videos de ayuda — el manifiesto", () => {
  it("cada video es de un módulo que existe, con rutas únicas en su carpeta", () => {
    const rutas = VIDEOS_AYUDA.flatMap((v) => [v.video, v.miniatura]);
    expect(new Set(rutas).size).toBe(rutas.length);
    for (const v of VIDEOS_AYUDA) {
      expect(ALL_MODULE_KEYS).toContain(v.modulo);
      expect(v.video.startsWith(`${v.modulo}/`) && v.video.endsWith(".mp4")).toBe(true);
      expect(v.miniatura.startsWith(`${v.modulo}/`) && v.miniatura.endsWith(".jpg")).toBe(true);
      expect(v.segundos).toBeGreaterThan(0);
    }
  });

  it("Caja menuda: 11 videos en orden y el completo aparte", () => {
    const { lista, completo } = videosDelModulo("caja");
    expect(lista.map((v) => v.orden)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(completo?.segundos).toBe(568);
    expect(tituloEnLista(lista[0])).toBe("Introducción");
    expect(tituloEnLista(lista[2])).toBe("2. Registrar un gasto");
    expect(tieneVideos("caja")).toBe(true);
    expect(tieneVideos("cargar")).toBe(false);
  });

  it("duración m:ss", () => {
    expect(duracion(57)).toBe("0:57");
    expect(duracion(568)).toBe("9:28");
  });

  it("la caja abre el panel solo detrás del interruptor y de que haya videos", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/app/caja/[periodoId]/page.tsx"), "utf8");
    expect(src).toMatch(/VIDEOS_AYUDA_2026_11 && tieneVideos\("caja"\)/);
  });

  it("«Cómo se usa» vive en la PORTADA de cada módulo con videos (la primera pantalla que abre)", () => {
    for (const modulo of new Set(VIDEOS_AYUDA.map((v) => v.modulo))) {
      const href = ALL_MODULES.find((m) => m.key === modulo)!.href;
      // La portada es `page.tsx` o el componente de su carpeta que dibuja
      // (`./ReclamosClient`, …): una página de servidor no puede tener el estado.
      const dir = path.join(process.cwd(), `src/app${href}`);
      const pagina = fs.readFileSync(path.join(dir, "page.tsx"), "utf8");
      const propios = [...pagina.matchAll(/from "\.\/([\w-]+)"/g)]
        .map((m) => path.join(dir, `${m[1]}.tsx`))
        .filter((f) => fs.existsSync(f));
      const src = [pagina, ...propios.map((f) => fs.readFileSync(f, "utf8"))].join("\n");
      expect(src, `${href}/page.tsx`).toMatch(new RegExp(`VIDEOS_AYUDA_2026_11 && tieneVideos\\("${modulo}"\\)`));
      expect(src, `${href}/page.tsx`).toMatch(new RegExp(`<VideosAyuda modulo="${modulo}"`));
    }
  });
});

describe("GET /api/videos-ayuda", () => {
  beforeEach(() => {
    signed.mockReset();
    signed.mockImplementation(async (rutas: string[]) => ({
      data: rutas.map((p) => ({ path: p, signedUrl: `https://firmada/${p}` })),
      error: null,
    }));
  });

  it("sin sesión: 401, y no firma nada", async () => {
    sesion.mockReturnValue(null);
    expect((await GET(req("caja"))).status).toBe(401);
    expect(signed).not.toHaveBeenCalled();
  });

  it("un rol que no abre el módulo: 403", async () => {
    sesion.mockReturnValue({ role: "bodega" });
    expect((await GET(req("caja"))).status).toBe(403);
    expect(signed).not.toHaveBeenCalled();
  });

  it("la MISMA regla de la pantalla: el módulo en la sesión abre (David y /cxc); otro módulo no", async () => {
    sesion.mockReturnValue({ role: "gerente_boston", modules: ["boston", "cxc"] });
    expect((await GET(req("cxc"))).status).toBe(200);
    expect((await GET(req("caja"))).status).toBe(403);
    sesion.mockReturnValue({ role: "vendedor" });
    expect((await GET(req("cxc"))).status).toBe(200);
    expect((await GET(req("prestamos"))).status).toBe(403);
  });

  it("la serie de teléfono (Catálogos) viaja marcada vertical; la de Caja no", async () => {
    sesion.mockReturnValue({ role: "bodega" });
    const cat = await (await GET(req("catalogos"))).json();
    expect(cat.lista.every((v: { vertical?: boolean }) => v.vertical === true)).toBe(true);
    sesion.mockReturnValue({ role: "secretaria" });
    const caja = await (await GET(req("caja"))).json();
    expect(caja.lista.some((v: { vertical?: boolean }) => v.vertical)).toBe(false);
  });

  it("Proveedores es serie de teléfono entera (lista y completo), y contabilidad la abre", async () => {
    sesion.mockReturnValue({ role: "contabilidad" });
    const r = await (await GET(req("proveedores"))).json();
    expect(r.lista).toHaveLength(6);
    expect(r.lista.every((v: { vertical?: boolean }) => v.vertical === true)).toBe(true);
    expect(r.completo.vertical).toBe(true);
  });

  it("Ventas es serie de teléfono y solo admin la abre", async () => {
    sesion.mockReturnValue({ role: "admin" });
    const r = await (await GET(req("ventas"))).json();
    expect(r.lista).toHaveLength(11);
    expect(r.lista.every((v: { vertical?: boolean }) => v.vertical === true)).toBe(true);
    sesion.mockReturnValue({ role: "secretaria" });
    expect((await GET(req("ventas"))).status).toBe(403);
  });

  it("Multifashion la abre gerente_acs (su único módulo)", async () => {
    sesion.mockReturnValue({ role: "gerente_acs", modules: ["multifashion"] });
    const r = await (await GET(req("multifashion"))).json();
    expect(r.lista).toHaveLength(10);
    expect(r.lista.some((v: { vertical?: boolean }) => v.vertical)).toBe(false);
  });

  it("Boston: la abre gerente_boston; vendedor no", async () => {
    sesion.mockReturnValue({ role: "gerente_boston" });
    const r = await (await GET(req("boston"))).json();
    expect(r.lista).toHaveLength(5);
    sesion.mockReturnValue({ role: "vendedor" });
    expect((await GET(req("boston"))).status).toBe(403);
  });

  it("Consulta de artículos: serie de teléfono; bodega la abre, secretaria no", async () => {
    sesion.mockReturnValue({ role: "bodega" });
    const r = await (await GET(req("referencia"))).json();
    expect(r.lista).toHaveLength(8);
    expect(r.lista.every((v: { vertical?: boolean }) => v.vertical === true)).toBe(true);
    sesion.mockReturnValue({ role: "secretaria" });
    expect((await GET(req("referencia"))).status).toBe(403);
  });

  it("Usuarios: serie de teléfono, solo admin", async () => {
    sesion.mockReturnValue({ role: "admin" });
    const r = await (await GET(req("usuarios"))).json();
    expect(r.lista).toHaveLength(10);
    expect(r.lista.every((v: { vertical?: boolean }) => v.vertical === true)).toBe(true);
    sesion.mockReturnValue({ role: "secretaria" });
    expect((await GET(req("usuarios"))).status).toBe(403);
  });

  it("Asistencia es mixta: solo el 01 (marcar desde el teléfono) va vertical", async () => {
    sesion.mockReturnValue({ role: "contabilidad" });
    const a = await (await GET(req("asistencia"))).json();
    expect(a.lista.filter((v: { vertical?: boolean }) => v.vertical).map((v: { titulo: string }) => v.titulo)).toEqual(["Marcar desde el teléfono"]);
  });

  it("un módulo sin videos: 404", async () => {
    sesion.mockReturnValue({ role: "admin" });
    expect((await GET(req("cargar"))).status).toBe(404);
  });

  it("la secretaria recibe la lista con URLs firmadas", async () => {
    sesion.mockReturnValue({ role: "secretaria" });
    const r = await GET(req("caja"));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.modulo).toBe("Caja menuda");
    expect(j.lista).toHaveLength(11);
    expect(j.lista[0].url).toBe("https://firmada/caja/00-que-es-caja-menuda.mp4");
    expect(j.completo.miniatura).toBe("https://firmada/caja/00-completo.jpg");
    expect(signed.mock.calls[0][1]).toBe(3600);
  });
});
