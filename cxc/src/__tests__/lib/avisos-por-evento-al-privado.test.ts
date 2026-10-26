/**
 * 🔴 CANDADO (25-oct-2026, Daniel): cuatro avisos POR EVENTO van al chat
 * PRIVADO de Daniel con trato de negocio (`enviarNegocioPrivado`), no al grupo
 * 📊 NEGOCIO: pedido nuevo del vendedor · pedido enviado a Switch · pedido del
 * link confirmado · guía despachada. «Menos piezas de las pedidas» SIGUE en
 * `enviarNegocio`. El texto de cada aviso no cambió.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const src = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");

/** El canal que antecede a la llamada del armador del aviso. */
const canalDe = (s: string, armador: string) =>
  s.match(new RegExp(`await (enviar\\w+)\\(\\s*(?:\`[^\`]*?)?${armador}`))?.[1];

describe("avisos por evento → chat privado de Daniel", () => {
  it("pedido nuevo del vendedor", () => {
    expect(canalDe(src("app/api/catalogo/[marca]/orders/route.ts"), "avisoPedidoDeVendedor\\(")).toBe("enviarNegocioPrivado");
  });
  it("pedido enviado a Switch", () => {
    expect(canalDe(src("lib/catalogo/switch-envio.ts"), "avisoPedidoEnviado\\(")).toBe("enviarNegocioPrivado");
  });
  it("pedido del link confirmado", () => {
    expect(canalDe(src("app/api/catalogo/[marca]/pedido-publico/[id]/confirmar/route.ts"), "avisoPedidoDelLink\\(")).toBe("enviarNegocioPrivado");
  });
  it("guía despachada: el único aviso de la ruta va al privado", () => {
    const s = src("app/api/guias/[id]/route.ts");
    expect(s).toMatch(/await enviarNegocioPrivado\(`<pre>/);
    expect(s).not.toMatch(/enviarNegocio\(/);
  });
  it("«menos piezas de las pedidas» sigue en el grupo NEGOCIO", () => {
    const s = src("app/api/catalogo/[marca]/pedido-publico/[id]/confirmar/route.ts");
    expect(s).toMatch(/await enviarNegocio\(\s*`⚠️[^`]*menos piezas de las pedidas/);
  });
});
