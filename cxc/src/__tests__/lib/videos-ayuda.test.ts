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
import { VIDEOS_AYUDA, videosDelModulo, duracion, tituloEnLista, tieneVideos, VIDEOS_DEL_INICIO } from "@/lib/videos-ayuda/manifiesto";
import { ALL_MODULE_KEYS, ALL_MODULES } from "@/lib/modules";
import { videosDeLaRuta } from "@/components/estructura/BotonComoSeUsa";
import { nombreDelArchivo } from "@/components/VideosAyuda";

const req = (modulo: string) =>
  new NextRequest(`http://x/api/videos-ayuda?modulo=${modulo}`, { headers: { cookie: "cxc_session=x" } });
const reqCel = (modulo: string) =>
  new NextRequest(`http://x/api/videos-ayuda?modulo=${modulo}&formato=celular`, { headers: { cookie: "cxc_session=x" } });
const sinVertical = (r: { lista: { vertical?: boolean }[]; completo: { vertical?: boolean } | null }) =>
  !r.lista.some((v) => v.vertical) && !r.completo?.vertical;

describe("videos de ayuda — el manifiesto", () => {
  it("cada video es de un módulo que existe, con rutas únicas en su carpeta", () => {
    for (const m of new Set(VIDEOS_AYUDA.map((v) => v.modulo))) {
      // Por FORMATO: la versión de computadora y la de teléfono son dos listas.
      for (const f of ["computadora", "celular"] as const) {
        const rutas = VIDEOS_AYUDA.filter((v) => v.modulo === m && (!v.formato || v.formato === f)).flatMap((v) => [v.video, v.miniatura]);
        expect(new Set(rutas).size).toBe(rutas.length);
      }
    }
    for (const v of VIDEOS_AYUDA) {
      // El Inicio no es un módulo y reusa los archivos de la Vista general.
      // La versión 16:9 de una serie regrabada vive en `<key>-16x9/`.
      const base = v.modulo === VIDEOS_DEL_INICIO ? "vista-general" : v.modulo;
      const carpeta = v.formato === "computadora" ? `${base}-16x9` : base;
      if (v.modulo !== VIDEOS_DEL_INICIO) expect(ALL_MODULE_KEYS).toContain(v.modulo);
      expect(v.video.startsWith(`${carpeta}/`) && v.video.endsWith(".mp4")).toBe(true);
      expect(v.miniatura.startsWith(`${carpeta}/`) && v.miniatura.endsWith(".jpg")).toBe(true);
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
    expect(tieneVideos("no-existe")).toBe(false);
  });

  it("duración m:ss", () => {
    expect(duracion(57)).toBe("0:57");
    expect(duracion(568)).toBe("9:28");
  });

  it("el «?» del encabezado encuentra los videos de cada módulo desde su portada", () => {
    for (const modulo of new Set(VIDEOS_AYUDA.map((v) => v.modulo))) {
      if (modulo === VIDEOS_DEL_INICIO) continue;
      const m = ALL_MODULES.find((x) => x.key === modulo)!;
      expect(videosDeLaRuta(m.href), m.href).toBe(modulo);
      expect(videosDeLaRuta(`${m.href}/algo`), `${m.href}/algo`).toBe(modulo);
      // La portada dibuja el encabezado común, que es donde vive el «?».
      const dir = path.join(process.cwd(), `src/app${m.href}`);
      const pagina = fs.readFileSync(path.join(dir, "page.tsx"), "utf8");
      const propios = [...pagina.matchAll(/from "\.\/([\w-]+)"/g)]
        .map((x) => path.join(dir, `${x[1]}.tsx`))
        .filter((f) => fs.existsSync(f));
      const src = [pagina, ...propios.map((f) => fs.readFileSync(f, "utf8"))].join("\n");
      expect(src, `${m.href}/page.tsx`).toMatch(/<AppHeader\b/);
    }
    expect(videosDeLaRuta("/home")).toBe(VIDEOS_DEL_INICIO);
    expect(videosDeLaRuta("/no-existe")).toBeNull();
  });

  it("el «?» vive en el encabezado: computadora (AppHeader), celular (avatar flotante) e Inicio", () => {
    const leer = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
    expect(leer("src/components/AppHeader.tsx")).toMatch(/<BotonComoSeUsa \/>/);
    expect(leer("src/components/estructura/AvatarDelUsuario.tsx")).toMatch(/<BotonComoSeUsa flotante \/>/);
    expect(leer("src/app/home/page.tsx")).toMatch(/<BotonComoSeUsa \/>/);
    const boton = leer("src/components/estructura/BotonComoSeUsa.tsx");
    expect(boton).toMatch(/aria-label="Cómo se usa"/);
    expect(boton).toMatch(/h-11 w-11/); // 44 px para el dedo
  });

  it("ningún «···» lleva «Cómo se usa», y el panel solo lo abre el «?»", () => {
    const archivos = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? archivos(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : [],
      );
    for (const f of archivos(path.join(process.cwd(), "src")).filter((f) => !f.includes("__tests__"))) {
      const src = fs.readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/label: "Cómo se usa"/);
      // El título del propio panel («Cómo se usa») sí va.
      if (!f.endsWith("VideosAyuda.tsx")) expect(src, f).not.toMatch(/>\s*Cómo se usa\s*</);
      if (!f.endsWith("BotonComoSeUsa.tsx")) expect(src, f).not.toMatch(/<VideosAyuda\b/);
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

  it("🔴 abre en formato COMPUTADORA (16:9) en todo módulo; la de teléfono va a un toque donde quedó", async () => {
    sesion.mockReturnValue({ role: "admin" });
    const CON_CELULAR = ["catalogos", "proveedores", "ventas", "referencia", "usuarios", "asistencia"];
    for (const m of new Set(VIDEOS_AYUDA.map((v) => v.modulo))) {
      const r = await (await GET(req(m))).json();
      expect(sinVertical(r), m).toBe(true);
      expect(r.formato).toBe("computadora");
      expect(r.conFormatoCelular, m).toBe(CON_CELULAR.includes(m));
    }
    const caja = await (await GET(reqCel("caja"))).json();
    expect(caja.lista).toHaveLength(11); // sin versión de teléfono: la misma lista
  });

  it("la de teléfono es una LISTA aparte por módulo: Ventas 12 clips en 16:9 y 11 en celular", async () => {
    sesion.mockReturnValue({ role: "admin" });
    const pc = await (await GET(req("ventas"))).json();
    const cel = await (await GET(reqCel("ventas"))).json();
    expect(pc.lista).toHaveLength(12);
    expect(pc.lista[7].titulo).toBe("Utilidad por cliente");
    expect(pc.completo.url).toContain("ventas-16x9/00-completo.mp4");
    expect(cel.lista).toHaveLength(11);
    expect(cel.formato).toBe("celular");
    expect(cel.lista.every((v: { vertical?: boolean; url: string }) => v.vertical && !v.url.includes("-16x9/"))).toBe(true);
  });

  it("el liviano de Compartir sale del completo 16:9; el de teléfono conserva el suyo", async () => {
    sesion.mockReturnValue({ role: "admin" });
    for (const m of ["catalogos", "proveedores", "ventas", "referencia", "usuarios"]) {
      expect((await (await GET(req(m))).json()).completo.compartir).toBe(`https://firmada/${m}-16x9/00-completo-liviano.mp4`);
      expect((await (await GET(reqCel(m))).json()).completo.compartir).toBe(`https://firmada/${m}/00-completo-liviano.mp4`);
    }
  });

  it("un formato desconocido cae a computadora", async () => {
    sesion.mockReturnValue({ role: "admin" });
    const r = await (await GET(new NextRequest("http://x/api/videos-ayuda?modulo=ventas&formato=raro", { headers: { cookie: "cxc_session=x" } }))).json();
    expect(r.formato).toBe("computadora");
    expect(r.lista).toHaveLength(12);
  });

  it("Proveedores: contabilidad la abre; 6 clips en las dos versiones", async () => {
    sesion.mockReturnValue({ role: "contabilidad" });
    expect((await (await GET(req("proveedores"))).json()).lista).toHaveLength(6);
    expect((await (await GET(reqCel("proveedores"))).json()).lista).toHaveLength(6);
  });

  it("Ventas: solo admin la abre", async () => {
    sesion.mockReturnValue({ role: "secretaria" });
    expect((await GET(req("ventas"))).status).toBe(403);
    expect((await GET(reqCel("ventas"))).status).toBe(403);
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

  it("Consulta de artículos: bodega la abre, secretaria no", async () => {
    sesion.mockReturnValue({ role: "bodega" });
    expect((await (await GET(req("referencia"))).json()).lista).toHaveLength(8);
    sesion.mockReturnValue({ role: "secretaria" });
    expect((await GET(req("referencia"))).status).toBe(403);
  });

  it("Usuarios: solo admin, 10 clips", async () => {
    sesion.mockReturnValue({ role: "admin" });
    expect((await (await GET(req("usuarios"))).json()).lista).toHaveLength(10);
    sesion.mockReturnValue({ role: "secretaria" });
    expect((await GET(req("usuarios"))).status).toBe(403);
  });

  it("Inicio: toda sesión ve SOLO los clips del Inicio, sin el completo; la Vista general sigue de admin", async () => {
    sesion.mockReturnValue({ role: "bodega" });
    const r = await (await GET(req("inicio"))).json();
    expect(r.lista.map((v: { orden: number }) => v.orden)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(r.completo).toBeNull();
    expect((await GET(req("vista-general"))).status).toBe(403);
    sesion.mockReturnValue({ role: "admin" });
    const vg = await (await GET(req("vista-general"))).json();
    expect(vg.lista).toHaveLength(11);
    expect(vg.completo).not.toBeNull();
  });

  it("Plantilla Switch: la secretaria la abre, bodega no", async () => {
    sesion.mockReturnValue({ role: "secretaria" });
    const r = await (await GET(req("cargar"))).json();
    expect(r.lista).toHaveLength(11);
    expect(r.completo).not.toBeNull();
    sesion.mockReturnValue({ role: "bodega" });
    expect((await GET(req("cargar"))).status).toBe(403);
  });

  it("Gastos: contabilidad lo abre, secretaria no", async () => {
    sesion.mockReturnValue({ role: "contabilidad" });
    const r = await (await GET(req("gastos-contabilidad"))).json();
    expect(r.lista).toHaveLength(9);
    sesion.mockReturnValue({ role: "secretaria" });
    expect((await GET(req("gastos-contabilidad"))).status).toBe(403);
  });

  it("Asistencia: el 01 abre en 16:9; en formato celular vuelve el 01 de teléfono y el resto igual", async () => {
    sesion.mockReturnValue({ role: "contabilidad" });
    const a = await (await GET(req("asistencia"))).json();
    expect(a.lista[1].url).toBe("https://firmada/asistencia-16x9/01-marcar-desde-el-telefono.mp4");
    const c = await (await GET(reqCel("asistencia"))).json();
    expect(c.lista.filter((v: { vertical?: boolean }) => v.vertical).map((v: { titulo: string }) => v.titulo)).toEqual(["Marcar desde el teléfono"]);
    expect(c.lista).toHaveLength(a.lista.length);
    expect(c.completo.url).toBe(a.completo.url); // el completo de Asistencia es uno solo
  });

  it("un módulo sin videos: 404", async () => {
    sesion.mockReturnValue({ role: "admin" });
    expect((await GET(req("no-existe"))).status).toBe(404);
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

  it("Compartir: el clip viaja tal cual; el completo, en su versión liviana (< 28 MB)", async () => {
    sesion.mockReturnValue({ role: "secretaria" });
    const j = await (await GET(req("caja"))).json();
    expect(j.lista[0].compartir).toBe("https://firmada/caja/00-que-es-caja-menuda.mp4");
    expect(j.completo.compartir).toBe("https://firmada/caja/00-completo-liviano.mp4");
  });
});

describe("Compartir un video", () => {
  it("pasa por la única puerta (`compartir-archivo.ts`) y queda anotado", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/components/VideosAyuda.tsx"), "utf8");
    expect(src).toMatch(/from "@\/lib\/compartir-archivo"/);
    expect(src).toMatch(/aparatoDeQuienMira\(\)/);
    expect(src).not.toMatch(/navigator\.share|createObjectURL/);
    expect(src).toMatch(/logActivityClient\(\{ action: "compartir_video"/);
  });

  it("el archivo se llama «Módulo - título.mp4», sin signos que rompan el nombre", () => {
    expect(nombreDelArchivo("Caja menuda", "Registrar un gasto")).toBe("Caja menuda - Registrar un gasto.mp4");
    expect(nombreDelArchivo("Gastos", "¿Qué es Gastos?")).toBe("Gastos - Qué es Gastos.mp4");
    expect(nombreDelArchivo("Despachos", "Etiquetas / bultos")).toBe("Despachos - Etiquetas bultos.mp4");
  });
});
