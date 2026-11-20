// Las miniaturas guardadas (19-nov-2026): 600 y 160 px de ancho, WebP, sin
// agrandar una foto chica, y `supabaseThumb` apunta a ellas, nunca al render.
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { generarMiniaturas } from "@/lib/catalogo/miniaturas";
import { supabaseThumb, rutaMiniatura, esMiniatura } from "@/lib/image-thumb";

const foto = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#c00" } }).jpeg().toBuffer();

describe("generarMiniaturas", () => {
  it("genera 600 y 160 en WebP", async () => {
    const out = await generarMiniaturas(await foto(1200, 1500));
    const metas = await Promise.all(out.map((m) => sharp(m.bytes).metadata()));
    expect(out.map((m) => m.ancho)).toEqual([600, 160]);
    expect(metas.map((m) => m.format)).toEqual(["webp", "webp"]);
    // Caja cuadrada «contain», como el render de antes: la foto entera.
    expect(metas.map((m) => [m.width, m.height])).toEqual([[480, 600], [128, 160]]);
  });

  it("no agranda una foto chica", async () => {
    const out = await generarMiniaturas(await foto(300, 200));
    const metas = await Promise.all(out.map((m) => sharp(m.bytes).metadata()));
    expect([metas[0].width, metas[0].height]).toEqual([300, 200]);
    expect(metas[1].width).toBe(160);
  });
});

describe("supabaseThumb", () => {
  const url = "https://x.supabase.co/storage/v1/object/public/product-images/tommy/_v/abc/1.jpg?v=123";
  it("apunta al archivo guardado y conserva el ?v=", () => {
    expect(supabaseThumb(url, 600)).toBe(
      "https://x.supabase.co/storage/v1/object/public/product-images/tommy/_v/abc/1.jpg__600.webp?v=123",
    );
    expect(supabaseThumb(url, 160)).toContain("1.jpg__160.webp?v=123");
  });
  it("lo que no es del bucket de fotos va tal cual", () => {
    expect(supabaseThumb("https://otra.com/a.jpg")).toBe("https://otra.com/a.jpg");
    expect(supabaseThumb(null)).toBeNull();
  });
  it("reconoce sus miniaturas", () => {
    expect(esMiniatura(rutaMiniatura("tommy/abc", 600))).toBe(true);
    expect(esMiniatura("tommy/abc.jpg")).toBe(false);
  });
});
