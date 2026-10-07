/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — NINGÚN TEXTO DE PANTALLA NUEVO HABLA COMO UNA CONVERSACIÓN
 * (6-oct-2026, `scripts/revisar-nombres.ts`).
 *
 * Daniel, 6-oct-2026: «¿cómo hago para que apliques nombres como ERP
 * profesional sin tener que decírtelo cada vez?». El candado de antes
 * (`nombres-erp-prohibidos`) solo conocía una LISTA de palabras, así que cada
 * coloquialismo NUEVO se colaba. Esta prueba no busca palabras: busca FORMAS
 * (pregunta · primera o segunda persona · verbo con pronombre pegado ·
 * imperativo · un rótulo que no es un sustantivo corto), y además hace cumplir
 * el glosario de `docs/nombres-erp.md` sin que nadie toque código.
 *
 * El número de cada archivo es su TECHO y SOLO BAJA, igual que `paleta-unica`:
 * los 112 textos del 6-oct-2026 no frenan el build, pero nada puede empeorar.
 * Fuera de esta lista: CERO.
 *
 * 🔑 Cuando un archivo se limpia, su número baja o la línea se borra. Nunca
 * sube: para eso está `no crece`.
 * ────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import { glosario, porArchivo, revisarTexto, revisarTodo, terminosAprobados, textosDe, TITULO_BLANDAS } from "../../../scripts/revisar-nombres";

/** archivo → cuántos textos fuera de la norma se toleran hoy. Solo baja. */
const TECHOS: Record<string, number> = {
  "src/lib/novedades/lista.ts": 10,
  "src/app/asistencia/ConfiguracionTab.tsx": 7,
  "src/components/catalogo/CatalogoStickyCartBar.tsx": 4,
  "src/components/CambiarContrasena.tsx": 4,
  "src/app/productos/cargar/MiExcelFotosClient.tsx": 4,
  "src/components/catalogo/RevisarPedidoPublico.tsx": 3,
  "src/app/despachos/components/GuiaForm.tsx": 3,
  "src/app/asistencia/ReporteTab.tsx": 3,
  "src/app/asistencia/AprobacionesTab.tsx": 3,
  "src/components/marketing/FacturaForm.tsx": 2,
  "src/components/comisiones/comisiones-config/ClientesQueNoComisionan.tsx": 2,
  "src/components/catalogo/PedidoPublicoClient.tsx": 2,
  "src/components/catalogo/ComprobantesPanel.tsx": 2,
  "src/app/reclamos/components/ReclamoDetail.tsx": 2,
  "src/app/page.tsx": 2,
  "src/app/marketing/components/RegistrarGastoModal.tsx": 2,
  "src/app/marketing/components/CerrarPeriodoModal.tsx": 2,
  "src/app/marcacion/PantallaDeAntes.tsx": 2,
  "src/app/asistencia/PlanillaTab.tsx": 2,
  "src/lib/novedades/dibujos.ts": 1,
  "src/lib/guias/etiquetas.ts": 1,
  "src/lib/exports/prestamos-excel.ts": 1,
  "src/lib/depurador/reebok-despacho.ts": 1,
  "src/lib/catalogos/pedidos-excel.ts": 1,
  "src/lib/asistencia/planilla-exportar.ts": 1,
  "src/components/ventas/celular/ClientesCelular.tsx": 1,
  "src/components/ui.tsx": 1,
  "src/components/referencia/ReferenciaView.tsx": 1,
  "src/components/productos/FiltrosProductos.tsx": 1,
  "src/components/multifashion/ProductosSubtab.tsx": 1,
  "src/components/marketing/PreciosProveedorAyuda.tsx": 1,
  "src/components/marketing/PdfUploader.tsx": 1,
  "src/components/marketing/FotoUploader.tsx": 1,
  "src/components/marketing/EntregaForm.tsx": 1,
  "src/components/estructura/AvatarDelUsuario.tsx": 1,
  "src/components/comisiones/comisiones-config/Descuentos.tsx": 1,
  "src/components/ClientePicker.tsx": 1,
  "src/components/catalogo/ClienteSwitchPicker.tsx": 1,
  "src/components/catalogo/CatalogoVendedorPage.tsx": 1,
  "src/components/catalogo/CatalogoPublicoPage.tsx": 1,
  "src/app/vista-general/RentabilidadPorEmpresa.tsx": 1,
  "src/app/recordatorios/RecordatoriosClient.tsx": 1,
  "src/app/reclamos/components/EnviarProveedorModal.tsx": 1,
  "src/app/productos/cargar/ReebokClient.tsx": 1,
  "src/app/productos/cargar/HistorialView.tsx": 1,
  "src/app/productos/cargar/DepuradorClient.tsx": 1,
  "src/app/productos/cargar/AlarmaDescripcionesNuevas.tsx": 1,
  "src/app/prestamos/[id]/page.tsx": 1,
  "src/app/marketing/components/PortadaTiendas.tsx": 1,
  "src/app/marketing/components/PortadaAbiertosCerrados.tsx": 1,
  "src/app/marketing/components/InicioMarketing.tsx": 1,
  "src/app/marketing/components/FacturasSection.tsx": 1,
  "src/app/marketing/components/DetallePeriodoView.tsx": 1,
  "src/app/marketing/components/celular/TiendasCelular.tsx": 1,
  "src/app/marketing/[marca]/page.tsx": 1,
  "src/app/marketing/[marca]/[periodo]/page.tsx": 1,
  "src/app/despachos/components/GuiasList.tsx": 1,
  "src/app/despachos/components/DespachoForm.tsx": 1,
  "src/app/despachos/components/AddNewInline.tsx": 1,
  "src/app/despachos/[id]/imprimir/page.tsx": 1,
  "src/app/gastos-contabilidad/components/DetalleEgresos.tsx": 1,
  "src/app/caja/components/GastoTable.tsx": 1,
  "src/app/caja/components/AvisoSaldoNegativo.tsx": 1,
  "src/app/caja/[periodoId]/page.tsx": 1,
  "src/app/caja/[periodoId]/imprimir/page.tsx": 1,
  "src/app/boston/tabs/PrestamosBoston.tsx": 1,
  "src/app/asistencia/PrestamosTab.tsx": 1,
  "src/app/asistencia/JustificacionesTab.tsx": 1,
  "src/app/admin/usuarios/VisitasTab.tsx": 1,
  "src/app/admin/usuarios/page.tsx": 1,
};

/**
 * Los diez coloquialismos que se colaron la semana del 6-oct-2026, dichos por
 * Daniel. Son la prueba de fuego: el revisor tiene que cazar los diez.
 */
const LOS_DIEZ: [string, "rotulo" | "texto"][] = [
  ["A quién se le pasa", "rotulo"],
  ["mi costo", "rotulo"],
  ["Terminado", "rotulo"],
  ["Avísale a Roxana", "rotulo"],
  ["Poner en bulto", "rotulo"],
  ["Foto o factura", "rotulo"],
  ["De una tienda", "rotulo"],
  ["¿Cómo calcular los precios?", "texto"],
  ["Borrarlos todos", "rotulo"],
  ["Revocar", "rotulo"],
];

/**
 * 7-oct-2026: «Mueble de la bodega» se coló en Marketing (uno de los tres
 * tipos de gasto) y Daniel lo vio antes que el revisor — es un rótulo corto
 * y bien formado, así que la vara de FORMA no lo caza; solo lo caza una fila
 * del glosario. Van con «Lo que va en el camión» y «El viaje», los dos
 * ejemplos que ya citaba la regla general de este documento (línea 5) sin
 * tener fila propia todavía.
 */
const NUEVOS_DEL_7_OCT: [string, string][] = [
  ["Mueble de la bodega", "Entrega de mobiliario"],
  ["Lo que va en el camión", "Detalle de envío"],
  ["El viaje", "Envío"],
];

/** Nombres de ERP de verdad: ninguno puede caer. Son los CONTROLES. */
const NOMBRES_BUENOS: [string, "rotulo" | "texto"][] = [
  ["Detalle de envío", "rotulo"],
  ["Observaciones", "rotulo"],
  ["Etiquetados, sin marcar", "rotulo"],
  ["Cuentas por cobrar", "rotulo"],
  ["Saldo a favor", "rotulo"],
  ["Cliente", "rotulo"],
  ["Estilo", "rotulo"],
  ["Tiquete", "rotulo"],
  ["Días", "rotulo"],
  ["Sin saldo", "rotulo"],
  ["Por empresa", "rotulo"],
  ["Desde", "rotulo"],
  ["Hasta", "rotulo"],
  ["Cómo se calcula el neto", "rotulo"],
  ["Seleccionar período", "rotulo"],
  ["Actualizado hace 5 min", "rotulo"],
  ["Eliminar", "rotulo"],
  ["Plantilla Switch", "rotulo"],
  ["Depósito", "rotulo"],
  ["Crédito", "rotulo"],
  ["Celular", "rotulo"],
  ["Titular", "rotulo"],
  ["Selecciona un cliente para continuar.", "texto"],
  ["Vuelve a intentarlo.", "texto"],
  ["La quincena está cerrada. Para corregir un monto hay que reabrirla.", "texto"],
  ["Sin resultados para «Boston».", "texto"],
  ["Entrega de mobiliario", "rotulo"],
  ["Envío", "rotulo"],
];

describe("🔴 revisar-nombres: ningún texto de pantalla habla como una conversación", () => {
  const hallazgos = revisarTodo();
  const cuenta = porArchivo(hallazgos);

  it("caza los DIEZ coloquialismos que se colaron (Daniel, 6-oct-2026)", () => {
    const sueltos = LOS_DIEZ.filter(([t, c]) => !revisarTexto(t, c));
    expect(sueltos, `se le escaparon: ${sueltos.map(([t]) => `«${t}»`).join(" · ")}`).toEqual([]);
    for (const [t, c] of LOS_DIEZ) console.log(`  ✓ «${t}» → ${revisarTexto(t, c)!.regla}`);
  });

  it("caza «Mueble de la bodega» y los otros dos que quedaron solo en la prosa (7-oct-2026)", () => {
    const sueltos = NUEVOS_DEL_7_OCT.filter(([t]) => !revisarTexto(t, "rotulo"));
    expect(sueltos, `se le escaparon: ${sueltos.map(([t]) => `«${t}»`).join(" · ")}`).toEqual([]);
    for (const [malo, bueno] of NUEVOS_DEL_7_OCT) expect(revisarTexto(malo, "rotulo")!.propuesta).toBe(bueno);
  });

  it("y NO caza los nombres de ERP de verdad (controles)", () => {
    const falsos = NOMBRES_BUENOS.map(([t, c]) => [t, revisarTexto(t, c)] as const).filter(([, m]) => m);
    expect(falsos.map(([t, m]) => `«${t}» → ${m!.regla}`)).toEqual([]);
  });

  it("barre todo el sistema, no un rincón", () => {
    expect(Object.keys(TECHOS).length).toBeGreaterThan(0);
    expect(hallazgos.length).toBeLessThanOrEqual(Object.values(TECHOS).reduce((a, b) => a + b, 0));
  });

  it("fuera de los techos no queda ni un texto fuera de la norma", () => {
    const nuevos = hallazgos.filter((h) => !(h.archivo in TECHOS));
    expect(nuevos.map((h) => `${h.archivo}:${h.linea} [${h.clase}] «${h.texto}» → ${h.regla}`)).toEqual([]);
  });

  it("ningún techo crece (cada número solo baja)", () => {
    const pasados = Object.entries(TECHOS)
      .filter(([f, techo]) => (cuenta[f] ?? 0) > techo)
      .map(([f, techo]) => `${f}: ${cuenta[f]} > ${techo}`);
    expect(pasados).toEqual([]);
  });

  it("un techo que ya no hace falta se borra (ninguno sobra por más de 1)", () => {
    const sobran = Object.entries(TECHOS)
      .filter(([f, techo]) => techo - (cuenta[f] ?? 0) > 1)
      .map(([f, techo]) => `${f}: techo ${techo}, hoy ${cuenta[f] ?? 0} — bájalo`);
    expect(sobran).toEqual([]);
  });

  // ── El glosario crece solo: una fila nueva en el documento, sin tocar código ──
  it("el glosario y los términos aprobados SALEN de docs/nombres-erp.md", () => {
    expect(glosario().length).toBeGreaterThan(20);
    expect(glosario(undefined, TITULO_BLANDAS).length).toBeGreaterThan(5);
    expect(terminosAprobados()).toContain("cuentas por cobrar");
    expect(terminosAprobados()).toContain("cómo se calcula");
  });

  it("una fila «mal → bien» agregada al documento se hace cumplir sola", () => {
    const md = `${"## Palabras prohibidas en textos visibles"}\n\n| Prohibido | Reemplazo |\n|---|---|\n| Lo que va en el camión | Detalle de envío |\n`;
    const reglas = glosario(md);
    expect(reglas).toHaveLength(1);
    expect(reglas[0][0].test("Lo que va en el camión")).toBe(true);
    expect(reglas[0][1]).toBe("Detalle de envío");
  });

  // ── De dónde saca los textos ──
  it("separa el rótulo del texto de ayuda, y deja el código afuera", () => {
    const src = `
      <Campo label="Observaciones" ayuda="Selecciona el motivo y guarda." />
      <th className="px-3 text-left">Comprobante</th>
      <button onClick={x} className="text-blue-600">Agregar factura</button>
      const COLS = ["bg-gray-50", "/api/guias", "ID_EMPRESA"];
      const ENCABEZADOS = ["Cliente", "Saldo"];
    `;
    const sacados = textosDe(src, true);
    expect(sacados.find((x) => x.texto === "Observaciones")?.clase).toBe("rotulo");
    expect(sacados.find((x) => x.texto === "Comprobante")?.clase).toBe("rotulo");
    expect(sacados.find((x) => x.texto === "Cliente")?.clase).toBe("rotulo");
    expect(sacados.find((x) => x.texto === "Selecciona el motivo y guarda.")?.clase).toBe("texto");
    // Un `label` con acción al lado es un BOTÓN: vara blanda, puede ser un verbo.
    expect(textosDe(`{ label: "Eliminar gasto", onClick: borrar }`, false)[0].clase).toBe("texto");
    for (const basura of ["bg-gray-50", "/api/guias", "ID_EMPRESA"]) expect(sacados.map((x) => x.texto)).not.toContain(basura);
  });

  it("la vara dura solo vale para los rótulos", () => {
    expect(revisarTexto("Buscar colaborador por nombre", "rotulo")).not.toBeNull();
    expect(revisarTexto("Buscar colaborador por nombre", "texto")).toBeNull();
  });
});
