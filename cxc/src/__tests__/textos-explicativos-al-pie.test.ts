// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO · NADA DE PÁRRAFOS EXPLICATIVOS ARRIBA DEL CONTENIDO (4-oct-2026)
//
// Daniel, desde su iPhone en Comisiones › Multifashion: *«Quítame estos mensajes
// que no son necesarios. No solo aquí sino en todo el sistema. O bien resumido
// abajo en una línea.»* Arriba de la lista había tres: «4 vendedoras · $16,795.58
// ventas · 270 tickets», «La Δ compara contra octubre 2025, los mismos días (del
// 1 al 4).» y la regla del bono entera.
//
// La regla (docs/diseno.md › «Detalles aprendidos»):
//   · Arriba de una lista o tabla no va ninguna aclaración (cómo se calcula,
//     contra qué compara, reglas, «Toca … para …»).
//   · Si el dato aporta, va UNA línea gris chica AL FINAL, resumida. El detalle
//     largo, solo detrás del ⓘ.
//   · Los avisos que piden actuar, los estados vacíos y las etiquetas de campo
//     se quedan.
//
// Dos partes: (1) un barrido de los archivos tocados ese día, para que la
// frase no vuelva por otra puerta; (2) los casos puntuales, con la línea DESPUÉS
// de la lista en el código.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/** Fuera comentarios (los de la historia citan las frases viejas a propósito). */
const sinComentarios = (fuente: string) =>
  fuente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/([^\n:"'`])\/\/[^\n]*$/gm, "$1");

const SRC = join(__dirname, "..");
const leer = (rel: string) => sinComentarios(readFileSync(join(SRC, rel), "utf8"));

/** Los archivos que se limpiaron el 4-oct-2026. */
const TOCADOS = [
  "components/multifashion/VendedorasSubtab.tsx",
  "components/multifashion/BonosSection.tsx",
  "components/multifashion/celular/VendedorasCelular.tsx",
  "components/multifashion/ListaSeguimientoClientes.tsx",
  "components/multifashion/ProductosSubtab.tsx",
  "components/ventas/ClientesView.tsx",
  "components/ventas/UtilidadView.tsx",
  "components/ventas/celular/ResumenCelular.tsx",
  "components/ventas/celular/HojaClienteCelular.tsx",
  "app/boston/tabs/PrestamosBoston.tsx",
  "app/boston/tabs/PlanillaBoston.tsx",
  "app/boston/tabs/VentasBoston.tsx",
  "app/boston/tabs/ClientesBoston.tsx",
  "app/asistencia/PrestamosTab.tsx",
  "app/asistencia/MovimientosQuincenaTab.tsx",
  "app/asistencia/marcaciones/PantallaDeAntes.tsx",
  "app/admin/usuarios/NovedadesTab.tsx",
  "app/admin/usuarios/VisitasTab.tsx",
  "app/clientes/[codigo]/ClienteDetail.tsx",
  "app/guias/components/DespachadoresConfig.tsx",
  "app/guias/components/TransportistasConfig.tsx",
  "app/catalogos/admin/[marca]/categorias/CategoriasRubroClient.tsx",
  "app/vista-general/GastosPorEmpresa.tsx",
  "app/vista-general/RentabilidadPorEmpresa.tsx",
  "app/gastos-contabilidad/components/DetalleEgresos.tsx",
  "app/marketing/galeria/[cliente]/GaleriaView.tsx",
];

/** Las frases de párrafo explicativo. Ninguna puede volver a pintarse en esos archivos. */
const FRASES_EXPLICATIVAS: RegExp[] = [
  /compara contra/i,
  /Se compara/,
  /se define al cerrar/,
  /Toca (una|un|el|la|para|su)\b[^"`]*para/,
  /Toca un dato/,
  /Los montos/,
  /Nota:/,
  /Se calcula\b/,
  /incluye mayoreo/i,
  /Aquí (se ven|verás|van|solo se mira)/,
  /para que sea comparable/,
  /busca por nombre para ver/,
  /toca el nombre para ver/,
  /solo para ver/,
  /Lo que cada persona ve al entrar/,
  /Quién abrió cada módulo/,
  /El rubro lo manda Switch/,
];

describe("🔴 1 · barrido: ningún párrafo explicativo vuelve a los archivos limpiados", () => {
  for (const archivo of TOCADOS) {
    it(archivo, () => {
      const codigo = leer(archivo);
      for (const frase of FRASES_EXPLICATIVAS) {
        expect(codigo, `${archivo} volvió a pintar «${frase.source}»`).not.toMatch(frase);
      }
    });
  }
});

/** Lo que va DESPUÉS en el código: `despues` aparece más abajo que `antes`. */
function vaDespues(archivo: string, antes: string, despues: string) {
  const codigo = leer(archivo);
  const a = codigo.lastIndexOf(antes);
  const d = codigo.indexOf(despues);
  expect(a, `${archivo}: no está «${antes}»`).toBeGreaterThan(-1);
  expect(d, `${archivo}: no está «${despues}»`).toBeGreaterThan(-1);
  expect(d, `${archivo}: «${despues}» tiene que ir DEBAJO de «${antes}»`).toBeGreaterThan(a);
}

describe("🔴 2 · casos puntuales: la línea va al final de la lista", () => {
  it("Comisiones › Multifashion: resumen, Δ y bono en UNA línea debajo de la tabla, con su ⓘ", () => {
    vaDespues("components/multifashion/VendedorasSubtab.tsx", 'data-elemento="tabla"', "data-pie-vendedoras");
    const codigo = leer("components/multifashion/VendedorasSubtab.tsx");
    // El número de vendedoras no va: son las filas que se ven.
    expect(codigo).not.toMatch(/total_vendedoras_periodo\}<\/span> vendedoras/);
    // Montos sin centavos.
    expect(codigo).toMatch(/montoCorto\(resp\.ventas_total\)/);
    // La regla entera, solo detrás del ⓘ.
    expect(codigo).toMatch(/aria-label="Regla del bono"/);
    // `BonosSection` ya no pinta la línea de arriba.
    expect(leer("components/multifashion/BonosSection.tsx")).toMatch(/if \(RETAIL_AL_FRENTE\) return null;/);
  });

  it("Multifashion en el celular: el resumen debajo de la lista", () => {
    vaDespues("components/multifashion/celular/VendedorasCelular.tsx", 'data-celular="vendedoras-lista"', 'data-celular="vendedoras-subtitulo"');
  });

  it("Ventas › Clientes (celular): conteo y contra qué compara, al final de las tarjetas", () => {
    vaDespues("components/ventas/ClientesView.tsx", "No se encontraron clientes con esos filtros.", "data-comparativo-clientes");
  });

  it("Utilidad: totales y alcance en una línea al final, sin centavos", () => {
    vaDespues("components/ventas/UtilidadView.tsx", "</table>", "data-totales-utilidad");
    expect(leer("components/ventas/UtilidadView.tsx")).toMatch(/montoDeLaTabla\(data\.totales\.ventas\)/);
  });

  it("Ficha del cliente (Ventas, celular): «mismos días» al pie de la lista de empresas", () => {
    vaDespues("components/ventas/celular/HojaClienteCelular.tsx", "data-empresa-del-cliente", "data-pie-cliente");
  });

  it("Mayores variaciones: contra qué fechas, al pie", () => {
    vaDespues("components/multifashion/ProductosSubtab.tsx", 'titulo="Bajó"', "data-pie-movimientos");
  });

  it("Vista general: rentabilidad y gastos dicen de dónde sale el número AL FINAL", () => {
    vaDespues("app/vista-general/RentabilidadPorEmpresa.tsx", "</table>", "data-pie-rentabilidad");
    vaDespues("app/vista-general/GastosPorEmpresa.tsx", "data-fila-gasto", "data-pie-gastos");
  });

  it("Admin, Boston y Asistencia: la línea va debajo de su lista", () => {
    vaDespues("app/admin/usuarios/NovedadesTab.tsx", "Leída por", "data-pie-novedades");
    vaDespues("app/admin/usuarios/VisitasTab.tsx", "</table>", "data-pie-visitas");
    vaDespues("app/boston/tabs/PrestamosBoston.tsx", 'data-testid="prestamo-boston"', "data-pie-prestamos-boston");
    vaDespues("app/boston/tabs/VentasBoston.tsx", "años.map", "data-pie-ventas-boston");
    vaDespues("app/asistencia/PrestamosTab.tsx", "setAbonando(f)", "data-pie-prestamos");
  });

  it("lo que NO se quita: los avisos que piden actuar y los estados vacíos", () => {
    expect(leer("components/multifashion/VendedorasSubtab.tsx")).toContain("No se pudo cargar el ranking");
    expect(leer("components/multifashion/BonosSection.tsx")).toContain("No se pudieron cargar los bonos");
    expect(leer("app/catalogos/admin/[marca]/categorias/CategoriasRubroClient.tsx")).toContain("Selecciona la categoría de cada uno");
    expect(leer("app/boston/tabs/PlanillaBoston.tsx")).toContain("Selecciona el período");
  });
});
