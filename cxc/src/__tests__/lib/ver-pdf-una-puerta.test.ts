// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO: UN PDF O UN BLOB SE ABRE POR UNA SOLA PUERTA (27-nov-2026)
//
// 🩸 En la app INSTALADA en la pantalla de inicio del iPhone o el iPad no hay
// pestañas: `window.open`, `location.href =` o un enlace `target="_blank"` a un
// PDF de la casa o a un `blob:` mandan la MISMA ventana de la app al PDF, sin
// barra ni «volver». Daniel tenía que cerrar la app de fondo («Ver PDF» de la
// confirmación del pedido). La puerta es `compartir-archivo.ts` (`verPdf`):
// con el dedo, la hoja de compartir; en la computadora, pestaña nueva.
//
// Este barrido pone el build en ROJO si aparece un `window.open`, un
// `location.href =`/`assign`/`replace` o un enlace a un PDF fuera de la lista
// de abajo. Cada entrada de la lista dice POR QUÉ no es la trampa: una
// dirección de OTRO dominio (wa.me, el storage) sí se abre en el visor con
// «Listo», y navegar a una página de la app no es abrir un PDF.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

let aparato: "celular" | "computadora" = "computadora";
vi.mock("@/lib/aparato", () => ({ aparatoDeQuienMira: () => aparato }));
import { verPdf } from "@/lib/compartir-archivo";

const RAIZ = join(__dirname, "..", "..");

const PERMITIDOS: Record<string, string> = {
  "lib/compartir-archivo.ts": "la puerta: `abrirPestana`, solo en computadora",
  "lib/guias/pdf-en-pestana.ts": "Etiquetas en computadora; con el dedo sale antes por la hoja (abajo se comprueba)",
  "app/cxc/page.tsx": "wa.me, otro dominio",
  "app/clientes/[codigo]/CobrarEnFicha.tsx": "wa.me, otro dominio",
  "components/cxc/BostonHojaCobrar.tsx": "wa.me, otro dominio",
  "app/cxc/components/EstadosPorWhatsApp.tsx": "WhatsApp Web, otro dominio",
  "app/reclamos/components/celular/DetalleCelular.tsx": "URL firmada del storage, otro dominio",
  "app/reclamos/components/celular/ListaEmpresaCelular.tsx": "mailto:",
  "app/admin/usuarios/page.tsx": "sesión vencida: vuelve al inicio de sesión",
  "lib/sesion-semilla-provider.tsx": "otra sesión: vuelve al inicio de sesión",
  "components/catalogo/RevisarPedidoPublico.tsx": "navega a la página del pedido público",
  "app/marketing/tienda/[codigo]/FichaTienda.tsx": "URL firmada del storage, otro dominio",
  "app/marketing/components/ZipsBajados.tsx": "URL firmada del storage, otro dominio",
};

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "__tests__" ? [] : archivos(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

/** El código sin comentarios: un comentario que nombra `window.open` no cuenta. */
function sinComentarios(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const ABRE = /window\.open\(|location\.(href\s*=[^=]|assign\(|replace\()/;
// Un enlace a un PDF de la casa, al API o a un blob, con o sin `target`.
const ENLACE_A_PDF = /href=\{?[`"'][^`"'\n]*(?:\/pdf\b|\.pdf\b|blob:)/;

describe("🔴 un PDF o un blob se abre solo por compartir-archivo.ts", () => {
  const todos = archivos(RAIZ).map((p) => ({ rel: relative(RAIZ, p), src: sinComentarios(readFileSync(p, "utf8")) }));

  it("nadie fuera de la lista abre ventanas ni cambia la dirección", () => {
    const fuera = todos.filter((a) => ABRE.test(a.src) && !(a.rel in PERMITIDOS)).map((a) => a.rel);
    expect(fuera).toEqual([]);
  });

  it("nadie enlaza un PDF de la casa ni un blob (usa `verPdf`)", () => {
    expect(todos.filter((a) => ENLACE_A_PDF.test(a.src)).map((a) => a.rel)).toEqual([]);
  });

  it("la lista no guarda entradas muertas", () => {
    const vivos = new Set(todos.filter((a) => ABRE.test(a.src)).map((a) => a.rel));
    expect(Object.keys(PERMITIDOS).filter((k) => !vivos.has(k))).toEqual([]);
  });

  it("Etiquetas: con el dedo se va a la hoja ANTES de abrir la pestaña", () => {
    const s = todos.find((a) => a.rel === "lib/guias/pdf-en-pestana.ts")!.src;
    const cuerpo = s.slice(s.indexOf("export async function abrirPdfEnPestana"));
    const dedo = cuerpo.indexOf('aparatoDeQuienMira() === "celular"');
    expect(dedo).toBeGreaterThan(-1);
    expect(cuerpo.indexOf("abrir(")).toBeGreaterThan(dedo);
  });

  it("«Ver PDF» de la confirmación del pedido pasa por verPdf, sin enlace", () => {
    const s = todos.find((a) => a.rel === "components/catalogo/ConfirmacionClient.tsx")!.src;
    expect(s).toContain("verPdf(pdf)");
    expect(s).not.toMatch(/target="_blank"/);
  });
});

describe("verPdf: el dedo va a la hoja, la computadora a una pestaña", () => {
  const pdf = () => new File(["%PDF"], "Pedido-TOM-1.pdf", { type: "application/pdf" });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("con el dedo abre la hoja de compartir y NUNCA una ventana", async () => {
    aparato = "celular";
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    const open = vi.spyOn(window, "open");
    expect(await verPdf(pdf())).toBe("compartido");
    expect(share).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it("en la computadora, pestaña nueva; bloqueada, se descarga", async () => {
    aparato = "computadora";
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const open = vi.spyOn(window, "open").mockReturnValueOnce({ addEventListener: vi.fn() } as unknown as Window);
    expect(await verPdf(pdf())).toBe("pestana");
    open.mockReturnValueOnce(null);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    expect(await verPdf(pdf())).toBe("descargado");
    expect(click).toHaveBeenCalled();
  });
});
