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
];

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
