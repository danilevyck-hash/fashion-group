/**
 * Poda de textos — CXC · Multifashion · Clientes · Proveedores · Catálogos.
 *
 * Daniel vio pantallas llenas de prosa y pidió podarla. La regla es una sola:
 * **un texto se queda si cambia lo que HACE; se va si solo describe lo que ya
 * está viendo.** En el medio queda la METODOLOGÍA (fórmulas, definición de
 * buckets, cada cuánto se refresca algo), que no se borra pero tampoco tiene que
 * gritar en cada carga: va adentro de `<Ayuda>`, el ⓘ que se toca.
 *
 * 🔴 EL RIESGO QUE ESTE ARCHIVO EXISTE PARA CAZAR: que "pasarlo a un ⓘ" termine
 * siendo lo mismo que borrarlo. Que el ⓘ se ABRE y muestra lo que tiene adentro
 * ya lo prueba `components/ayuda-info.test.tsx` renderizando el componente; lo
 * que falta —y es lo que se verifica acá— es que cada texto movido SIGA EN SU
 * ARCHIVO y siga estando DENTRO de un `<Ayuda>`. Un `git rm` de la línea, o
 * sacarla del ⓘ y dejarla suelta en un `<p>` de nuevo, ponen esto rojo.
 *
 * Y el lado simétrico, que importa igual: los AVISOS no pueden mudarse al ⓘ.
 * Nadie abre un ⓘ que no sabe que tiene algo adentro, así que esconder ahí "se
 * agotó", "el dato está viejo" o "las devoluciones ya están restadas" es
 * exactamente igual de malo que borrarlos. El último bloque los fija AFUERA.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const raiz = join(__dirname, "..", "..");

/**
 * Se lee el archivo SIN comentarios, y no es un detalle: cada poda deja escrito
 * en un comentario QUÉ se sacó y por qué (para que dentro de seis meses nadie lo
 * "arregle" volviéndolo a poner). Si el barrido mirara el archivo crudo, esa
 * explicación haría fallar al propio candado que dice "esto ya no está".
 */
function leer(rel: string): string {
  return readFileSync(join(raiz, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ") // /* … */ y {/* … */}
    .replace(/^[ \t]*\/\/.*$/gm, " "); // // … al principio de la línea
}

/** El JSX parte las frases en varias líneas; se compara sin importar el corte. */
const plano = (s: string) => s.replace(/\s+/g, " ");

/** Los bloques `<Ayuda …>…</Ayuda>` del archivo, ya aplanados. */
function bloquesAyuda(fuente: string): string[] {
  return [...fuente.matchAll(/<Ayuda\b[\s\S]*?<\/Ayuda>/g)].map((m) => plano(m[0]));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Lo que PASÓ AL ⓘ — sigue en el archivo y sigue adentro de un <Ayuda>
// ─────────────────────────────────────────────────────────────────────────────

const A_LA_AYUDA: { archivo: string; que: string; texto: string }[] = [
  {
    archivo: "app/admin/components/EnviarEmailModal.tsx",
    que: "CXC · qué se adjunta al correo de estado de cuenta",
    texto: "La tabla de saldos se arma automáticamente y no se edita. Se adjunta un PDF por empresa.",
  },
  {
    archivo: "components/multifashion/ProductosSubtab.tsx",
    que: "Productos · la fórmula del margen",
    texto: "El margen es la utilidad dividida entre la venta.",
  },
  {
    archivo: "components/multifashion/ProductosSubtab.tsx",
    que: "Productos · con qué vara se arma cada top-5",
    texto: "<Ayuda titulo=\"Cómo se arma esta lista\">{ayuda}</Ayuda>",
  },
  {
    archivo: "components/multifashion/ProductosSubtab.tsx",
    que: "Productos · qué entra en la alerta ámbar de margen flojo",
    texto: "con margen por debajo del margen general",
  },
  {
    archivo: "components/multifashion/ProductosSubtab.tsx",
    que: "Productos · por qué 'lo que más cambió' se rankea en dólares",
    texto: "no en porcentaje: lo que sube 400% desde $40 no mueve el mes.",
  },
  {
    archivo: "components/multifashion/ProductosSubtab.tsx",
    que: "Productos · qué significa el ámbar en el selector de marcas",
    texto: "el margen por debajo del general del período",
  },
  {
    archivo: "components/multifashion/CajaSubtab.tsx",
    que: "Caja · cada cuánto se refresca el día en curso",
    texto: "El día en curso se refresca cada 10 minutos.",
  },
  {
    archivo: "components/multifashion/ClientesMultifashionSubtab.tsx",
    que: "Clientes · qué cae en el bucket de mostrador",
    texto: "Ventas de CONTADO / CONSUMIDOR FINAL, sin cliente identificado.",
  },
  {
    archivo: "components/multifashion/ClientesMultifashionSubtab.tsx",
    que: "Clientes · por qué las barras de los meses son comparables",
    texto: "{ESCALA_COMPARTIDA}",
  },
  {
    archivo: "app/clientes/[codigo]/ClienteDetail.tsx",
    que: "Ficha de cliente · por qué Ventas y CXC no cuadran (ITBMS)",
    texto: "va sin ITBMS",
  },
  {
    archivo: "app/catalogos/admin/[marca]/ZipB2BUpload.tsx",
    que: "Catálogos · cómo se trata el ZIP del B2B",
    texto: "Arrastra el ZIP tal como lo bajas del portal, sin descomprimirlo.",
  },
  {
    archivo: "app/catalogos/admin/[marca]/ZipB2BUpload.tsx",
    que: "Catálogos · el ZIP no se sube entero",
    texto: "Puede pesar 80 MB — se procesa en tu navegador, no se sube entero.",
  },
];

describe("lo que pasó al ⓘ sigue siendo ALCANZABLE", () => {
  for (const { archivo, que, texto } of A_LA_AYUDA) {
    it(`${que} — vive dentro de un <Ayuda> en ${archivo}`, () => {
      const fuente = leer(archivo);
      const enAlgunaAyuda = bloquesAyuda(fuente).some((b) => b.includes(plano(texto)));
      expect(enAlgunaAyuda, `"${texto}" ya no está adentro de ningún <Ayuda> de ${archivo}`).toBe(true);
    });
  }

  it("todo archivo que usa el ⓘ lo importa del ÚNICO componente compartido", () => {
    for (const archivo of new Set(A_LA_AYUDA.map((x) => x.archivo))) {
      expect(leer(archivo), archivo).toContain('from "@/components/shared/Ayuda"');
    }
  });

  it("el texto de la escala de meses es UNA constante, no dos copias que puedan divergir", () => {
    // Vivía escrito dos veces (lista del celular y tira del escritorio).
    const fuente = leer("components/multifashion/ClientesMultifashionSubtab.tsx");
    expect(fuente).toContain('const ESCALA_COMPARTIDA = "Escala compartida entre mayoreo y retail"');
    const literales = [...fuente.matchAll(/Escala compartida entre mayoreo y retail/g)];
    expect(literales.length, "el texto volvió a escribirse a mano en otro lado").toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Lo que SE FUE — instructivos, subtítulos que repiten y datos duplicados
// ─────────────────────────────────────────────────────────────────────────────

const SE_FUE: { archivo: string; que: string; texto: string }[] = [
  // El mismo número que ya está arriba de la tabla.
  { archivo: "app/admin/page.tsx", que: "CXC · conteo repetido en el menú de exportar", texto: "Se exportaran" },
  { archivo: "app/admin/components/ClientTable.tsx", que: "CXC · segunda línea del vacío", texto: "termino de busqueda" },
  { archivo: "app/admin/components/PanelCxcMobile.tsx", que: "CXC móvil · conteo repetido en el hero", texto: "clientCount" },
  { archivo: "components/multifashion/ProductosSubtab.tsx", que: "Productos · 'Sin comparación' suelto en cada celda", texto: "Sin comparación</p>" },
  { archivo: "components/multifashion/ProductosSubtab.tsx", que: "Productos · instructivo del selector de marcas", texto: "Tocá una marca" },
  { archivo: "components/multifashion/MultifashionResumenView.tsx", que: "Resumen · vacío del gráfico en dos líneas", texto: "No hay datos para este período" },
  { archivo: "app/clientes/ClientesListClient.tsx", que: "Clientes · 'probá con otros filtros'", texto: "Probá con otros filtros" },
  { archivo: "app/proveedores/ProveedoresListClient.tsx", que: "Proveedores · 'probá con otra búsqueda'", texto: "Probá con otra búsqueda" },
  { archivo: "app/proveedores/ProveedoresListClient.tsx", que: "Proveedores · orden fijo descrito en prosa", texto: "ordenados por monto" },
  { archivo: "app/proveedores/[key]/ProveedorDetail.tsx", que: "Proveedores · coletilla del encabezado", texto: "sincronizados de Switch" },
  { archivo: "app/catalogos/marcas/page.tsx", que: "Catálogos · bajada decorativa de cada marca", texto: "tagline" },
  { archivo: "app/catalogos/admin/[marca]/ProductosBatch.tsx", que: "Catálogos · conteo repetido en 'Actualizar inventario'", texto: "productos en catalogo" },
  { archivo: "app/catalogos/admin/[marca]/ProductosBatch.tsx", que: "Catálogos · 'o haz click para seleccionar'", texto: "haz click para seleccionar" },
  { archivo: "app/catalogos/admin/[marca]/ProductosBatch.tsx", que: "Catálogos · regla del SKU dicha dos veces en la misma tarjeta", texto: "Nombra cada archivo con el SKU" },
  { archivo: "app/catalogos/admin/[marca]/BulkPhotoUpload.tsx", que: "Catálogos · 'puedes soltar muchas a la vez'", texto: "soltar muchas a la vez" },
  { archivo: "app/catalogos/admin/[marca]/ProductosTarjetas.tsx", que: "Catálogos · vacío de fotos en dos líneas", texto: "Todo al día" },
  // Daniel (12-ago-2026, con captura del catálogo Calvin): "quítame las palabras
  // obvias como Catálogo Panamá" — ya estás EN el catálogo y TODO el negocio es
  // Panamá. Se podó en las 4 marcas. OJO: los "Fashion Group · Panamá" de los
  // PDFs/emails SÍ se quedan — un documento suelto necesita decir quién lo emite.
  { archivo: "lib/catalogo/marcas-ui.tsx", que: "Catálogos · subtítulo 'Catálogo Panamá' bajo el logo (las 4 marcas)", texto: "Catálogo Panamá" },
  { archivo: "lib/catalogo/marcas-ui.tsx", que: "Catálogos · 'Panamá' suelto bajo el logo del pedido público (las 4 marcas)", texto: ">Panamá<" },
  // Segunda vuelta del mismo pedido — barrido del módulo entero (12-ago-2026).
  // La regla que se aplicó: se va lo que repite dónde estás, lo que narra lo que
  // ya se está viendo, y lo que señala el único botón de la pantalla.
  { archivo: "app/catalogos/marcas/page.tsx", que: "Catálogos · h1 VISIBLE 'Catálogos' bajo la barra que ya lo dice", texto: 'mb-8">Catálogos' },
  { archivo: "components/catalogo/CheckoutClient.tsx", que: "Catálogos · el subtítulo narraba los tres bloques de la pantalla", texto: "revisa, elige cliente y envía a Switch" },
  { archivo: "components/catalogo/ConfirmacionClient.tsx", que: "Catálogos · señalaba el único botón primario, a 20 px", texto: "Puedes enviarlo con el botón de abajo" },
  { archivo: "components/catalogo/PedidoPublicoClient.tsx", que: "Catálogos · '(opcional)' en la misma frase que ya dice 'Si quieres'", texto: "por WhatsApp (opcional)" },
  { archivo: "components/catalogo/CatalogoVendedorPage.tsx", que: "Catálogos · subtítulo 'Todos los productos' del PDF sin filtros", texto: "Todos los productos" },
  { archivo: "lib/catalogo/order-pdf-core.ts", que: "Pedidos · rótulo 'Detalle' sobre la única tabla del PDF", texto: '"Detalle"' },
  { archivo: "lib/catalogo/order-email.ts", que: "Pedidos · rótulo 'Detalle' sobre la única tabla del correo", texto: '"Detalle"' },
  { archivo: "lib/catalogo/order-email.ts", que: "Pedidos · 'Este es el detalle' con la tabla justo debajo (cliente)", texto: "Este es el detalle" },
  { archivo: "lib/catalogo/order-email.ts", que: "Pedidos · 'A continuación el detalle:' con la tabla justo debajo (equipo)", texto: "A continuación el detalle" },
  { archivo: "lib/catalogo/order-email.ts", que: "Pedidos · pie 'generado automáticamente' al equipo, que no recibe pedidos de otro lado", texto: "generado automáticamente desde fashiongr.com" },

  // ───────────────────────────────────────────────────────────────────────────
  // EL NOMBRE DE LA PANTALLA, TRES VECES — 23 pantallas (12-ago-2026)
  //
  // Daniel ya había tomado esta decisión DOS veces y las dos quedaron escritas
  // en el código: Comisiones ("repetirlo costaba 44px de la primera pantalla del
  // iPhone") y el CXC de escritorio ("Sin título grande (pedido de Daniel)"). El
  // propio AppHeader lleva anotado el diagnóstico —"nombre 3×: chip + breadcrumb
  // + h1"— y en su momento le quitó el chip de escritorio y se olvidó del h1.
  // Acá se termina el trabajo en las 23 pantallas que faltaban.
  //
  // 🔴 EL h1 NO SE BORRA: pasa a `sr-only`, el patrón que estrenó el hub de
  // catálogos (#502). Podar ruido visual no es motivo para dejar un documento
  // sin encabezado. Por eso el candado NO puede ser `not.toContain("Clientes")`
  // —el nombre SIGUE en el archivo, y debe seguir— sino el marcado del título
  // GRANDE: la clase de tamaño pegada al texto. Si alguien devuelve el h1
  // visible, vuelve esa clase y el build se pone rojo.
  //
  // ⚠️ Guías › Nueva/Editar guía NO entró: su h1 dice "Nueva"/"Editar", y en
  // celular no hay breadcrumb, así que quitarlo borraba la única señal de si se
  // está creando o corrigiendo. Ver el comentario en GuiaForm.tsx.
  { archivo: "components/GroupPage.tsx", que: "Grupos · h1 grande con el nombre del grupo que ya dicen barra y breadcrumb", texto: 'text-2xl font-semibold text-gray-900">{meta.title}' },
  { archivo: "app/ventas/VentasShell.tsx", que: "Ventas · h1 grande 'Ventas'", texto: 'md:text-4xl"> Ventas' },
  { archivo: "app/vista-general/page.tsx", que: "Vista General · h1 grande 'Vista General'", texto: "sm:text-3xl" },
  { archivo: "app/referencia/ReferenciaClient.tsx", que: "Referencia · h1 grande 'Referencia'", texto: 'text-gray-900">Referencia' },
  { archivo: "app/multifashion/MultifashionShell.tsx", que: "Multifashion · h1 grande 'Multifashion'", texto: 'md:text-4xl"> Multifashion' },
  { archivo: "app/admin/components/PanelCxcMobile.tsx", que: "CXC celular · h1 grande 'Cuentas por Cobrar' (el de escritorio ya se había ido)", texto: "text-[22px] font-medium leading-tight" },
  { archivo: "app/clientes/ClientesListClient.tsx", que: "Clientes · h1 grande 'Clientes'", texto: 'tracking-tight">Clientes' },
  { archivo: "app/proveedores/ProveedoresListClient.tsx", que: "Proveedores · h1 grande 'Proveedores'", texto: 'tracking-tight">Proveedores' },
  { archivo: "app/admin/data-health/page.tsx", que: "Data Health · h1 grande 'Data Health'", texto: 'text-2xl font-semibold text-gray-900">Data Health' },
  { archivo: "app/guias/components/GuiasList.tsx", que: "Guías · h1 grande 'Guías de Despacho'", texto: 'tracking-tight">Guías de Despacho' },
  { archivo: "app/reclamos/components/EmpresaSelector.tsx", que: "Reclamos · h1 grande 'Reclamos'", texto: 'tracking-tight">Reclamos' },
  { archivo: "app/reclamos/components/ReclamoForm.tsx", que: "Reclamos · h1 grande 'Nuevo Reclamo' (su breadcrumb propio ya lo dice en todos los anchos)", texto: 'text-[21px] font-medium tracking-tight">Nuevo Reclamo' },
  { archivo: "app/productos/cargar/DepuradorClient.tsx", que: "Depurador · masthead 'Depurador de Productos'", texto: "font-serif text-xl font-semibold tracking-tight text-stone-900" },
  { archivo: "app/productos/cargar/FacturasTiendaClient.tsx", que: "Facturas Tienda · masthead 'Facturas Tienda' (la pestaña ya lo dice)", texto: "font-serif text-xl font-semibold tracking-tight text-stone-900" },
  { archivo: "app/asistencia/AsistenciaClient.tsx", que: "Asistencia · h1 grande 'Asistencia'", texto: 'text-xl font-semibold text-gray-900">Asistencia' },
  { archivo: "app/asistencia/AsistenciaClient.tsx", que: "Asistencia · el módulo iba en minúscula y ahora es lo único que nombra la pantalla", texto: 'module="asistencia"' },
  { archivo: "app/cheques/ChequesClient.tsx", que: "Cheques · h1 grande 'Cheques'", texto: 'tracking-tight">Cheques' },
  { archivo: "app/caja/components/PeriodoList.tsx", que: "Caja Menuda · h1 grande 'Caja Menuda' (38 px de alto)", texto: "clamp(28px, 4vw, 38px)" },
  { archivo: "app/marketing/components/InicioMarketing.tsx", que: "Marketing · h1 grande 'Marketing'", texto: 'text-xl font-semibold text-gray-900">Marketing' },
  { archivo: "app/gastos-contabilidad/GastosContabilidadClient.tsx", que: "Gastos · h1 grande 'Gastos'", texto: 'text-xl font-semibold tracking-tight text-gray-900' },
  { archivo: "app/saldos-banco/SaldosBancoClient.tsx", que: "Saldos de Banco · h1 grande 'Saldos de Banco'", texto: 'text-gray-900">Saldos de Banco' },

  // Poda de PALABRAS OBVIAS en todo el sistema (12-ago-2026, aprobada por
  // Daniel). La vara: quitarlo no le quita información a una secretaria, un
  // bodeguero o un vendedor que llega por primera vez. Lo que se fue repetía
  // dónde estás, narraba lo que ya se está viendo, señalaba el único botón de
  // la pantalla, o decía DOS VECES el mismo número.
  //
  // 🔴 Lo que NO entró en esta poda, y por qué (que nadie lo "termine" después):
  //   · Gastos: "parcial", "sin cerrar" y "sin datos" SÍ informan — solo se fue
  //     la del mes CERRADO, que duplicaba su propia etiqueta 7 veces.
  //   · Referencia: la línea de ADENTRO del buscador ("Podés pegar hasta N
  //     códigos juntos") se queda; se fue la bajada del encabezado.
  //   · Multifashion: "Mostrador anónimo va aparte" se queda (cambia cómo se
  //     lee el top).
  //   · Ventas › Clientes: "Clientes: últimos 12 meses" NO se toca — está
  //     redactado a propósito; se fue solo el prefijo "Vista:".
  //   · Saldos de Banco: la segunda mitad se queda (amarra con Vista General).
  //   · Asistencia: el botón que abre la ayuda y el "Cómo funciona la
  //     marcación" de adentro se quedan; se fue el del MEDIO.
  { archivo: "lib/mayor/gastos.ts", que: "Gastos · el mes cerrado ya lo dice su etiqueta (salía 7 veces)", texto: "La contadora ya cerró este mes." },
  { archivo: "app/referencia/ReferenciaClient.tsx", que: "Referencia · la bajada narraba la ficha que está debajo", texto: "pegá tu lista: cuánto llegó" },
  { archivo: "app/caja/components/PeriodoDetailHeader.tsx", que: "Caja · el % ya está arriba como '% del fondo'", texto: "% gastado" },
  { archivo: "app/caja/components/PeriodoDetailHeader.tsx", que: "Caja · 'Disponible' bajo el saldo", texto: 'sub="Disponible"' },
  { archivo: "app/caja/[periodoId]/nuevo/page.tsx", que: "Caja · el período del que se viene, repetido en el formulario", texto: "Período Nº" },
  { archivo: "app/caja/[periodoId]/nuevo/page.tsx", que: "Caja · instructivo del formulario con los * ya a la vista", texto: "Los campos con * son obligatorios" },
  { archivo: "app/admin/page.tsx", que: "CXC · '6 empresas' al lado de la pestaña 'Grupo · 6 empresas'", texto: ': "6 empresas"' },
  { archivo: "app/clientes/[codigo]/ClienteDetail.tsx", que: "Clientes · coletilla del encabezado (abajo dice 'Última sincronización')", texto: "Datos fiscales · sincronizados de Switch" },
  { archivo: "components/ventas/ClientesView.tsx", que: "Ventas › Clientes · el prefijo 'Vista:' del chip", texto: "Vista: {vistaChipLong}" },
  { archivo: "components/ventas/ClientesView.tsx", que: "Ventas › Clientes · rótulo del globo que se abre desde 'N empresas'", texto: "Desglose por empresa" },
  { archivo: "app/guias/[id]/page.tsx", que: "Guías · 'de esta guía' estando DENTRO de la guía", texto: "Envíos de esta guía" },
  { archivo: "app/reclamos/components/ReclamoForm.tsx", que: "Reclamos · rótulo sobre un único campo que ya se llama 'Empresa *'", texto: ">Empresa</div>" },
  { archivo: "app/asistencia/AsistenciaClient.tsx", que: "Asistencia · el 'Cómo funciona' DEL MEDIO (el botón y el contenido se quedan)", texto: ">Cómo funciona</h2>" },
  { archivo: "components/marketing/FacturaForm.tsx", que: "Marketing · la bajada del paso 3 repetía su propio título", texto: "Elige la marca (o marcas) del gasto." },
  { archivo: "app/marketing/components/FacturasSection.tsx", que: "Marketing · señalaba el botón de agregar, que está a la vista", texto: "Agrega la primera factura" },
  { archivo: "app/error.tsx", que: "Toda la app · señalaba el botón Recargar, que está justo debajo", texto: "Recarga la página para continuar." },
  { archivo: "app/global-error.tsx", que: "Toda la app · lo mismo en el error de raíz", texto: "Recarga la página para continuar." },
  { archivo: "app/saldos-banco/SaldosBancoClient.tsx", que: "Saldos de Banco · la PRIMERA mitad (la segunda amarra con Vista General y se queda)", texto: "Lo que hay en el banco de cada empresa" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2-bis. Lo que se fue DE LA VISTA pero NO del documento — patrón del PR #502
// ─────────────────────────────────────────────────────────────────────────────
//
// 🔴 Estos nueve rótulos no se podían borrar y ya: eran el ÚNICO encabezado de
// su sección. Para el ojo sobran (la tabla de abajo se llama igual, o la
// pestaña de arriba ya lo dijo); para quien navega con lector de pantalla, sin
// ellos la sección se queda sin nombre. Van `sr-only`.
//
// Un `not.toContain` no sirve acá —el texto SIGUE en el archivo, que es
// justamente el punto—, así que lo que se fija es lo contrario: que la palabra
// viva dentro de un elemento con `sr-only`. Borrarla del todo pone esto rojo
// (accesibilidad), y devolverla a un `<h2>` visible también (vuelve el ruido).

const SE_FUE_DE_LA_VISTA: { archivo: string; que: string; texto: string }[] = [
  { archivo: "app/caja/components/GastoTable.tsx", que: "Caja · 'Gastos' sobre la única tabla de la pantalla", texto: "Gastos" },
  { archivo: "app/reclamos/components/ReclamoDetail.tsx", que: "Reclamos · 'Totales' sobre las tarjetas Subtotal/ITBMS/Total", texto: "Totales" },
  { archivo: "app/proveedores/[key]/ProveedorDetail.tsx", que: "Proveedores · 'Por empresa' sobre una tabla cuya 1ª columna es Empresa", texto: "Por empresa" },
  { archivo: "app/prestamos/components/MovimientoTable.tsx", que: "Préstamos · 'Estado de Cuenta' sobre la única tabla", texto: "Estado de Cuenta" },
  { archivo: "app/marketing/components/InicioMarketing.tsx", que: "Marketing · el rótulo 'Resumen' sobre cifras que ya traen su pie", texto: "Resumen" },
  { archivo: "components/AppHeader.tsx", que: "Toda la app · 'Módulos' en el cajón del celular, que enseña los módulos", texto: "Módulos" },
  { archivo: "components/NotificationCenter.tsx", que: "Toda la app · 'Notificaciones' en el panel de la campanita", texto: "Notificaciones" },
  { archivo: "components/multifashion/VendedorasSubtab.tsx", que: "Multifashion · 'Vendedoras · <período>' bajo la pestaña Vendedoras", texto: "Vendedoras · {chipLabel[chip]}" },
  { archivo: "components/multifashion/ClientesMultifashionSubtab.tsx", que: "Multifashion · 'Clientes · <período>' bajo la pestaña Clientes", texto: "Clientes · {periodoStr}" },
  // El último de los 27 títulos de la auditoría, y el único que quedó sin podar
  // en el #510 porque era un h1. Se poda SOLO el nombre de la pantalla; el
  // número de PL se queda A LA VISTA (ver el bloque de abajo, que es el que de
  // verdad importa acá).
  { archivo: "app/packing-lists/[id]/page.tsx", que: "Packing Lists · 'Índice de Estilos por Bulto' es el nombre de la tabla que está debajo", texto: "Índice de Estilos por Bulto —" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2-ter. 🔴 EL IDENTIFICADOR NO ES EL NOMBRE DE LA PANTALLA — Packing Lists
// ─────────────────────────────────────────────────────────────────────────────
//
// El h1 decía DOS cosas pegadas: "Índice de Estilos por Bulto" (el nombre de lo
// que se está mirando, podable) y "PL #12345" (CUÁL packing list, que no lo es).
//
// 🔴 A 390 px el número NO está en ningún otro lado: la miga de pan de AppHeader
// es `hidden sm:flex` y la barra pegajosa dice "Packing Lists" en todas. Es la
// regla 2 de la poda del #510, la misma que le dejó su título a Nueva/Editar
// guía. Pasar el h1 ENTERO a sr-only —copiando el patrón sin mirar— habría
// dejado al usuario del iPhone sin saber cuál está abriendo.

describe("🔴 Packing Lists · se podó el nombre de la pantalla, NO el número de PL", () => {
  const PL = "app/packing-lists/[id]/page.tsx";

  it("el número de PL sigue VISIBLE (fuera de cualquier sr-only)", () => {
    const fuente = plano(leer(PL));
    // El h1 de la pantalla, con el número afuera del span escondido.
    expect(fuente).toContain(
      '<h1 className="text-lg font-semibold"> <span className="sr-only">Índice de Estilos por Bulto — </span> PL #{pl.numero_pl || "—"} </h1>',
    );
  });

  it("…y el nombre de la pantalla sigue existiendo para un lector de pantalla", () => {
    const fuente = plano(leer(PL));
    const enSrOnly = [...fuente.matchAll(/<(\w+)[^<>]*\bsr-only\b[^<>]*>([\s\S]*?)<\/\1>/g)].some((m) =>
      m[2].includes("Índice de Estilos por Bulto"),
    );
    expect(enSrOnly, "el nombre de la pantalla se borró en vez de esconderse").toBe(true);
  });

  it("la pantalla conserva UN solo h1", () => {
    expect((plano(leer(PL)).match(/<h1\b/g) || []).length).toBe(1);
  });

  it("⚠️ EL PAPEL NO SE TOCA: el PDF sigue escribiendo el número en su encabezado", () => {
    // Lo que se imprime de esta pantalla es el PDF de "Descargar PDF" — la
    // impresión del navegador ni siquiera pasa por acá (`@media print` de
    // globals.css solo hace visible `#print-document`, y esto es
    // `#pl-print-area`). Si el número se cayera del PDF, el papel dejaría de
    // decir de qué packing list es.
    expect(plano(leer(PL))).toContain("`Indice de Estilos por Bulto - PL #${pl.numero_pl}`");
  });
});

describe("lo que se fue DE LA VISTA sigue teniendo nombre para un lector", () => {
  for (const { archivo, que, texto } of SE_FUE_DE_LA_VISTA) {
    it(`${que} — vive en un elemento sr-only de ${archivo}`, () => {
      const fuente = plano(leer(archivo));
      // El elemento entero, de su `<` a su `>` de cierre, con el texto adentro.
      const enSrOnly = [...fuente.matchAll(/<(\w+)[^<>]*\bsr-only\b[^<>]*>([\s\S]*?)<\/\1>/g)].some(
        (m) => m[2].includes(plano(texto)),
      );
      expect(enSrOnly, `"${texto}" ya no está dentro de un sr-only de ${archivo}`).toBe(true);
    });
  }
});


// El lado simétrico, y el que de verdad importa: sacar el título GRANDE no
// puede dejar la página muda para un lector de pantalla. Cada una conserva
// EXACTAMENTE un h1, ahora `sr-only`. Préstamos entra acá aunque nunca tuvo
// título grande: tampoco tenía h1, y el sr-only cerró ese hueco.
const ENCABEZADO_SR_ONLY: { archivo: string; nombre: string }[] = [
  { archivo: "components/GroupPage.tsx", nombre: "{meta.title}" },
  { archivo: "app/ventas/VentasShell.tsx", nombre: "Ventas" },
  { archivo: "app/vista-general/page.tsx", nombre: "Vista General" },
  { archivo: "app/referencia/ReferenciaClient.tsx", nombre: "Referencia" },
  { archivo: "app/multifashion/MultifashionShell.tsx", nombre: "Multifashion" },
  { archivo: "app/admin/components/PanelCxcMobile.tsx", nombre: "Cuentas por Cobrar" },
  { archivo: "app/clientes/ClientesListClient.tsx", nombre: "Clientes" },
  { archivo: "app/proveedores/ProveedoresListClient.tsx", nombre: "Proveedores" },
  { archivo: "app/admin/data-health/page.tsx", nombre: "Data Health" },
  { archivo: "app/guias/components/GuiasList.tsx", nombre: "Guías de Despacho" },
  { archivo: "app/reclamos/components/EmpresaSelector.tsx", nombre: "Reclamos" },
  { archivo: "app/reclamos/components/ReclamoForm.tsx", nombre: "Nuevo Reclamo" },
  { archivo: "app/productos/cargar/DepuradorClient.tsx", nombre: "Depurador de Productos" },
  { archivo: "app/productos/cargar/FacturasTiendaClient.tsx", nombre: "Facturas Tienda" },
  { archivo: "app/asistencia/AsistenciaClient.tsx", nombre: "Asistencia" },
  { archivo: "app/cheques/ChequesClient.tsx", nombre: "Cheques" },
  { archivo: "app/caja/components/PeriodoList.tsx", nombre: "Caja Menuda" },
  { archivo: "app/prestamos/PrestamosClient.tsx", nombre: "Préstamos" },
  { archivo: "app/marketing/components/InicioMarketing.tsx", nombre: "Marketing" },
  { archivo: "app/gastos-contabilidad/GastosContabilidadClient.tsx", nombre: "Gastos" },
  { archivo: "app/saldos-banco/SaldosBancoClient.tsx", nombre: "Saldos de Banco" },
];

describe("🔴 podar el título NO deja la pantalla sin encabezado", () => {
  for (const { archivo, nombre } of ENCABEZADO_SR_ONLY) {
    it(`${archivo}: conserva UN h1, y es \`sr-only\` con "${nombre}"`, () => {
      const fuente = plano(leer(archivo));
      expect(fuente, "la pantalla se quedó sin ningún h1").toContain(
        `<h1 className="sr-only">${nombre}</h1>`,
      );
      const h1s = fuente.match(/<h1\b/g) || [];
      expect(h1s.length, "más de un h1: el encabezado deja de ser uno solo").toBe(1);
    });
  }

  it("una fila que se queda sin título no puede seguir en `justify-between`", () => {
    // El riesgo real de esta poda no era el título: eran los botones que
    // vivían en la MISMA fila (`flex justify-between`). Al quedar solos,
    // `between` los manda al borde IZQUIERDO — se ven colgando. Estas seis
    // filas quedaron con un único hijo visible y tienen que decir `end`.
    const filasQueQuedaronConUnSoloBoton = [
      "app/clientes/ClientesListClient.tsx",
      "app/proveedores/ProveedoresListClient.tsx",
      "app/admin/data-health/page.tsx",
      "app/guias/components/GuiasList.tsx",
      "app/reclamos/components/EmpresaSelector.tsx",
      "app/cheques/ChequesClient.tsx",
      "app/marketing/components/InicioMarketing.tsx",
    ];
    for (const archivo of filasQueQuedaronConUnSoloBoton) {
      const fuente = plano(leer(archivo));
      // La fila del título es la que lleva el h1 sr-only pegado adelante.
      const fila = fuente.match(/<div className="([^"]*flex[^"]*)"[^>]*>\s*<h1 className="sr-only">/);
      expect(fila, `no se encontró la fila del título en ${archivo}`).not.toBeNull();
      expect(fila![1], `${archivo}: la fila quedó con un solo botón y sigue en justify-between`)
        .not.toContain("justify-between");
    }
  });
});

// El chip "Oferta" pegado al precio se podó, pero la palabra SIGUE en el archivo
// (el badge sobre la foto). Un `not.toContain` no sirve: lo que hay que fijar es
// que se diga UNA sola vez por card.
describe("poda · la card no dice 'Oferta' tres veces", () => {
  it("CatalogoProductCard nombra la oferta una sola vez (el badge de la foto)", () => {
    const fuente = leer("components/catalogo/CatalogoProductCard.tsx");
    expect((fuente.match(/>\s*Oferta\s*</g) || []).length).toBe(1);
  });

  it("…y el badge y el precio rojo, que son los que informan, siguen ahí", () => {
    const fuente = leer("components/catalogo/CatalogoProductCard.tsx");
    expect(fuente).toContain('product.badge === "oferta"');
    expect(fuente).toContain("text-[#E4002B]");
  });
});

describe("lo que se fue no volvió por la ventana", () => {
  for (const { archivo, que, texto } of SE_FUE) {
    it(`${que} — ya no está en ${archivo}`, () => {
      expect(plano(leer(archivo))).not.toContain(plano(texto));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 🔴 LOS AVISOS SE QUEDAN EN PANTALLA — nunca adentro de un ⓘ
// ─────────────────────────────────────────────────────────────────────────────

const EN_PANTALLA: { archivo: string; por_que: string; texto: string }[] = [
  {
    archivo: "components/multifashion/ProductosSubtab.tsx",
    por_que: "🩸 sin esta línea, cuadrar el período contra Switch da EXACTAMENTE el doble de las devoluciones",
    texto: "las devoluciones (notas de crédito) ya están restadas",
  },
  {
    archivo: "components/multifashion/ProductosSubtab.tsx",
    por_que: "sin el 'mostrando N de M', las 100 primeras se leen como 'esto es todo'",
    texto: "Mostrando",
  },
  {
    archivo: "components/shared/SyncStatus.tsx",
    por_que: "🩸 el dato viejo es una decisión distinta; este aviso NO se toca",
    texto: "sin actualizar desde",
  },
  {
    archivo: "components/multifashion/MultifashionResumenView.tsx",
    por_que: "🩸 el mayoreo no entra al número y hay que poder verlo sin tocar nada",
    texto: "Retail (sin mayoreo)",
  },
  {
    archivo: "components/multifashion/VendedorasSubtab.tsx",
    por_que: "acá SÍ entra el mayoreo, al revés que en el resto del módulo",
    texto: "incluye mayoreo si lo hubo",
  },
  {
    archivo: "components/multifashion/ClientesMultifashionSubtab.tsx",
    por_que: "el mostrador anónimo va aparte y eso cambia cómo se lee el top",
    texto: "Mostrador anónimo va aparte",
  },
  {
    archivo: "components/multifashion/CajaSubtab.tsx",
    por_que: "que Switch no respondiera cambia si se confía o no en el cuadre",
    texto: "Switch no respondió",
  },
  {
    archivo: "app/catalogos/admin/[marca]/ZipB2BUpload.tsx",
    por_que: "cerrar la pestaña corta la subida: es un aviso, no metodología",
    texto: "No cierres esta pestaña hasta que termine.",
  },
  {
    archivo: "app/catalogos/admin/[marca]/ProductosBatch.tsx",
    por_que: "🔴 el archivo incompleto DESACTIVA productos y pone su stock en 0",
    texto: "Cualquier producto que no este en el archivo se desactiva",
  },
  {
    archivo: "app/catalogos/admin/[marca]/VariantePicker.tsx",
    por_que: "🩸 ofrecer 'cambiar foto' cuando no hay otra sería mentir",
    texto: "Este código no tiene más fotos guardadas.",
  },
  {
    archivo: "app/catalogos/admin/[marca]/BulkPhotoUpload.tsx",
    por_que: "sin la regla del nombre por SKU la subida masiva no hace nada",
    texto: "El nombre del archivo debe ser el código (SKU).",
  },
  {
    archivo: "app/admin/components/EstadoCuentaDrawer.tsx",
    por_que: "un panel vacío sin explicación se lee como un error de la app",
    texto: "no tiene documentos con saldo pendiente",
  },
  {
    archivo: "app/admin/components/EnviarEmailModal.tsx",
    por_que: "el correo repetido en muchos clientes frena un envío equivocado",
    texto: "clientes distintos. Verifica que sea el destinatario correcto.",
  },
  {
    archivo: "app/clientes/[codigo]/ClienteDetail.tsx",
    por_que: "la frescura del dato cambia cuánto se le cree a la ficha",
    texto: "Última sincronización",
  },
  {
    archivo: "app/proveedores/[key]/ProveedorDetail.tsx",
    por_que: "la frescura del dato cambia cuánto se le cree a la ficha",
    texto: "Última sincronización",
  },
];

describe("🔴 un aviso NUNCA se esconde detrás del ⓘ", () => {
  for (const { archivo, por_que, texto } of EN_PANTALLA) {
    it(`${archivo}: "${texto}" — ${por_que}`, () => {
      const fuente = leer(archivo);
      expect(plano(fuente), "el aviso desapareció del archivo").toContain(plano(texto));
      const escondido = bloquesAyuda(fuente).some((b) => b.includes(plano(texto)));
      expect(escondido, "el aviso terminó adentro de un <Ayuda>: nadie abre un ⓘ que no sabe que tiene algo").toBe(false);
    });
  }

  it("la venta de HOY de Multifashion no se tocó: sigue diciendo su frescura sin tocar nada", () => {
    const fuente = leer("components/multifashion/VentaHoyCard.tsx");
    expect(fuente).not.toContain("Ayuda");
    expect(plano(fuente)).toContain("sin actualizar desde");
  });
});
