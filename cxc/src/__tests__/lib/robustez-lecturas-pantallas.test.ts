/**
 * Robustez de lecturas — el lado de la PANTALLA (24-nov-2026). Las rutas se
 * prueban en `api/robustez-lecturas.test.ts`; aquí se candadea que cada
 * pantalla distinga «no se pudo leer» de «no hay nada».
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (r: string) => readFileSync(join(process.cwd(), "src", r), "utf8");

describe("1 · Comisiones: sin descuentos leídos, aviso y ni PDF ni Excel", () => {
  for (const f of ["components/comisiones/ComisionesPorEmpresaView.tsx", "components/comisiones/ComisionesConsolidadoView.tsx"]) {
    it(f, () => {
      const s = leer(f);
      expect(s).toContain("descuentos_no_leidos");
      expect(s).toContain("{AVISO_DESCUENTOS_NO_LEIDOS}");
      expect(s.match(/\|\| descuentosNoLeidos\) return;/g)).toHaveLength(2); // Excel y PDF
      expect(s.match(/disabled: [^}]*descuentosNoLeidos/g)).toHaveLength(2);
    });
  }
  it("el papel por vendedor y el detalle tampoco salen con los descuentos en 0", () => {
    expect(leer("components/comisiones/comisiones-detalle/useDescargaComision.tsx")).toContain("if (!resDesc.ok) throw new Error(AVISO_DESCUENTOS_NO_LEIDOS)");
    expect(leer("components/comisiones/ComisionesDetalleModal.tsx")).toContain("if (!resDesc.ok) throw new Error(AVISO_DESCUENTOS_NO_LEIDOS)");
  });
});

describe("2 · CXC: «no se pudo leer el último pago» ≠ «Sin pagos»", () => {
  it("la lectura caída es `null`, no `[]`, y se avisa", () => {
    const h = leer("app/cxc/hooks/useAdminData.ts");
    expect(h).toContain('fetch("/api/cxc/ultimo-pago", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)');
    expect(h).toContain("pagosNoLeidos: !Array.isArray(pagos)");
    const p = leer("app/cxc/page.tsx");
    expect(p).toContain("pagosNoLeidos ? AVISO_PAGOS_NO_LEIDOS : null");
    expect(p).toContain('if (!pago && pagosNoLeidos) return "No se pudo leer el último pago"');
  });
});

describe("3 · Vista general: CXC, CXP y Reclamos dicen «No se pudo medir»", () => {
  it("la ruta revisa los tres errores", () => {
    const r = leer("app/api/dashboard/vista-general/route.ts");
    expect(r).toContain("const cxc = agingRes.error ? null");
    expect(r).toContain("const cxp = cxpRes.error ? null");
    expect(r).toContain("const reclamos = reclamosRes.error ? null");
  });
  it("la pantalla lo dice en las dos tarjetas y en las tres alertas", () => {
    const p = leer("app/vista-general/page.tsx");
    expect(p).toContain('value={cxc ? moneyK(cxc.total) : "—"}');
    expect(p).toContain('value={cxp ? moneyK(cxp.total) : "—"}');
    expect(p.match(/<Empty>No se pudo medir<\/Empty>/g)).toHaveLength(3);
  });
});

describe("4 · Inicio de Boston: la tarjeta caída dice «No se pudo medir»", () => {
  it("las cuatro tarjetas", () => {
    const s = leer("app/boston/tabs/InicioBoston.tsx");
    expect(s.match(/NO_SE_PUDO_MEDIR/g)?.length).toBeGreaterThanOrEqual(5); // la constante + 4 tarjetas
    expect(s).not.toContain("?? 0)}");
  });
});

describe("5 · Clientes: el error se dice, no una lista vacía ni «Sin saldo»", () => {
  it("la página pasa el error a la lista", () => {
    const p = leer("app/clientes/page.tsx");
    expect(p).not.toContain('leerClientesDelGrupo("").catch(() => [])');
    expect(p).toContain("errorLectura={errorLectura}");
    expect(p).toMatch(/return null;\s*\}\s*const mapa/);
    const l = leer("app/clientes/ClientesListClient.tsx");
    expect(l).toContain('<Aviso tono="error" className="mb-3">{errorLectura}</Aviso>');
  });
});

describe("8 · El año de Comisiones es el de Panamá", () => {
  it("ni la página ni los años disponibles usan el reloj del servidor", () => {
    expect(leer("app/comisiones/page.tsx")).not.toContain("new Date().getFullYear()");
    const q = leer("lib/ventas/queries.ts");
    const f = q.slice(q.indexOf("export async function fetchAvailableYears"));
    expect(f.slice(0, f.indexOf("\n}\n"))).not.toContain("getFullYear()");
  });
});
