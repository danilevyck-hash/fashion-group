/**
 * 🔴 CANDADO — UNA SOLA LÍNEA DE FRESCURA EN TODO EL SISTEMA (4-oct-2026).
 *
 * Daniel aprobó «Actualizado 4:00 pm ↻» (celular) y «Actualizado hace 5 min ·
 * Actualizar» (computadora) y pidió: *«tiene que estar así en TODO el sistema.
 * No en uno sí y otro diferente»*.
 *
 * Toda pantalla que trae datos de Switch o del reloj dice de cuándo es el dato
 * y lo actualiza con `LineaDeFrescura` (`components/shared/LineaDeFrescura.tsx`)
 * y con nada más. Este barrido pone el build ROJO si vuelve otra forma:
 *   · un `<SyncNowButton>` suelto (el botón con borde «Actualizar ahora»);
 *   · los textos de antes: «Actualizar ahora», «Actualizar datos de Switch»,
 *     «Actualizado:», «Actualizado el», «Actualizado hace», «Sincronizado»;
 *   · un ↻ o un ícono `RefreshCw` dibujado a mano;
 *   · un botón «Actualizar» propio.
 * Y ninguna pantalla deja «Actualizar» escondido en un «···» o en «Más».
 *
 * Las excepciones van con su porqué y un tope que solo baja.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.join(process.cwd(), "src");
const LINEA = "components/shared/LineaDeFrescura.tsx";

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : archivos(p);
    return /\.(tsx?|jsx?)$/.test(e.name) ? [p] : [];
  });
}

/** Sin comentarios: los comentarios citan los textos de antes. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const FUENTES = archivos(SRC).map((f) => ({
  rel: path.relative(SRC, f),
  codigo: sinComentarios(fs.readFileSync(f, "utf8")),
}));

function contar(re: RegExp): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { rel, codigo } of FUENTES) {
    if (rel === LINEA) continue;
    const n = (codigo.match(new RegExp(re.source, "g")) ?? []).length;
    if (n > 0) out[rel] = n;
  }
  return out;
}

/** Que no aparezca nada fuera de las excepciones, y cada una con su tope. */
function soloLasExcepciones(re: RegExp, excepciones: Record<string, { tope: number; porque: string }>) {
  const hallados = contar(re);
  const fuera = Object.keys(hallados).filter((f) => !(f in excepciones));
  expect(fuera, `fuera de LineaDeFrescura: ${fuera.join(", ")}`).toEqual([]);
  for (const [f, { tope }] of Object.entries(excepciones)) {
    expect(hallados[f] ?? 0, `${f} pasó su tope`).toBeLessThanOrEqual(tope);
  }
}

/** La rama APAGADA de `FRESCURA_VISIBLE_2026_10`: el rollback de las tres
 *  primeras pantallas del mockup. Con el interruptor prendido no se dibuja. */
const RAMA_APAGADA = "rama `!FRESCURA_VISIBLE_2026_10` (rollback del 4-oct-2026); prendido no se dibuja";

describe("frescura única — LineaDeFrescura en todo el sistema", () => {
  it("ningún `<SyncNowButton>` suelto: el botón vive dentro de la línea", () => {
    soloLasExcepciones(/<SyncNowButton\b/, {
      "components/ventas/celular/MenuVentasCelular.tsx": { tope: 1, porque: RAMA_APAGADA },
      "components/comisiones/celular/PortadaComisionesCelular.tsx": { tope: 1, porque: RAMA_APAGADA },
      "components/comisiones/ComisionesView.tsx": { tope: 1, porque: RAMA_APAGADA },
      "app/multifashion/MultifashionShell.tsx": { tope: 1, porque: RAMA_APAGADA },
    });
  });

  it("ningún texto de las variantes de antes", () => {
    soloLasExcepciones(
      /\b(Actualizar ahora|Actualizar datos de Switch|Actualizado:|Actualizado el |Actualizado hace|Sincronizado\b|Traer ahora)/,
      {
        "lib/ui/actualizar-ahora.ts": { tope: 1, porque: "la constante del botón con borde de la rama apagada y del aria-label" },
        "lib/proveedores/actualizado.ts": { tope: 1, porque: "`textoActualizado` quedó sin lectores en pantalla; lo conserva su candado" },
        "components/shared/SyncStatus.tsx": { tope: 1, porque: "«Actualizado: …» solo con `FRESCURA_VISIBLE_2026_10` apagado; prendido dibuja solo el aviso" },
        "lib/novedades/lista.ts": { tope: 1, porque: "una novedad vieja (4-sep-2026): es historia, no un botón" },
      },
    );
  });

  it("ni ↻ ni `RefreshCw` dibujados a mano", () => {
    soloLasExcepciones(/↻/, {});
    soloLasExcepciones(/<RefreshCw\b/, {
      "components/shared/SyncNowButton.tsx": { tope: 1, porque: "el botón con borde de la rama apagada" },
      "app/asistencia/EstadoReloj.tsx": {
        tope: 2,
        porque: "la pastilla con `FRESCURA_VISIBLE_2026_10` apagado y la tarjeta por reloj de `ASISTENCIA_PANTALLA_2026_09 = false`",
      },
    });
  });

  it("ningún botón «Actualizar» propio fuera de la línea", () => {
    soloLasExcepciones(/>\s*Actualizar\s*<|"Actualizar"|\? "Actualizando…" : "Actualizar/, {
      "app/admin/usuarios/page.tsx": { tope: 1, porque: "recarga la lista de sesiones del propio sistema, no datos de Switch ni del reloj" },
    });
  });

  it("«Actualizar» nunca se esconde en el «···» ni en la hoja «Más»", () => {
    // Las hojas y menús de acciones del celular no llevan el toque de actualizar.
    const hojas = [
      "app/cxc/components/HojasCxcCelular.tsx",
      "components/referencia/ReferenciaView.tsx",
    ];
    for (const h of hojas) {
      const codigo = FUENTES.find((f) => f.rel === h)!.codigo;
      expect(codigo, h).not.toMatch(/<SyncNowButton\b|onClick: \(\) => void actualizar\(\)/);
    }
    // En Catálogos el «···» del celular ya no monta la línea: va arriba del buscador.
    const cat = FUENTES.find((f) => f.rel === "components/catalogo/CatalogoVendedorPage.tsx")!.codigo;
    const panel = cat.slice(cat.indexOf("CLASES_MENU_MAS.panel"), cat.indexOf("CLASES_MENU_MAS.panel") + 600);
    expect(panel).not.toContain("CatalogoSyncNow");
  });

  it("CxC: con «Todas» actualiza las 6 una tras otra; con una empresa, esa", async () => {
    const { opcionesActualizarCxc } = await import("@/lib/cxc/apple-2026-10");
    expect(opcionesActualizarCxc("all").map((o) => o.empresa)).toEqual([
      "vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep",
    ]);
    expect(opcionesActualizarCxc("vistana")).toEqual([{ modulo: "estadocuenta", empresa: "vistana" }]);
    for (const f of [
      "app/cxc/page.tsx",
      "app/cxc/components/CabeceraCxcApple.tsx",
      "app/cxc/components/PanelCxcCelular.tsx",
      "app/cxc/components/PanelCxcMobile.tsx",
    ]) {
      const c = FUENTES.find((x) => x.rel === f)!.codigo;
      expect(c, f).toMatch(/opciones=\{opcionesActualizarCxc\(companyFilter\)\}\s*secuencial=\{companyFilter === "all"\}/);
    }
  });

  it("Consulta de artículos: la línea solo con una búsqueda", () => {
    const c = FUENTES.find((f) => f.rel === "components/referencia/ReferenciaView.tsx")!.codigo;
    expect(c).toMatch(/const frescura = hayResultados \? \(\s*<LineaDeFrescura/);
  });
});
