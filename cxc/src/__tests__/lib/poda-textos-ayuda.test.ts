/**
 * PODA DE TEXTOS (ago-2026) — lo que se movió a un ⓘ TIENE QUE SEGUIR AHÍ.
 *
 * Daniel pidió podar la prosa de las pantallas de Operación. La regla fue: un
 * texto se queda si cambia lo que HACE, se va si solo describe lo que ya está
 * viendo, y en el medio queda la METODOLOGÍA —cómo se calcula, qué gana a qué,
 * qué hace la IA—, que no se borra pero tampoco tiene que gritar en cada carga
 * de pantalla: va dentro de `<Ayuda>` (`src/components/shared/Ayuda.tsx`).
 *
 * 🔴 EL RIESGO QUE ESTE ARCHIVO EXISTE PARA CAZAR: que "pasarlo a un ⓘ" se
 * convierta, en el commit siguiente, en "borrarlo". Un texto escondido detrás
 * de un toque no lo extraña nadie mientras esté; el día que desaparezca tampoco
 * lo extraña nadie — y ahí se pierde la única explicación de cómo se calcula un
 * precio o de qué se lleva un correo al proveedor.
 *
 * Por eso el candado no pregunta "¿está el texto en el archivo?" (eso se pondría
 * verde con el texto en un comentario), sino "¿está DENTRO de un `<Ayuda>`?".
 * Verificado por mutación: borrar cualquiera de estas frases, o sacarla del
 * bloque `<Ayuda>` dejándola suelta como comentario, pone el build ROJO.
 *
 * Lo que este barrido NO cubre y se cubre aparte, renderizando de verdad:
 * `AtarClienteModal` ("Lo que dice la guía no cambia") — ver
 * `src/__tests__/components/guias-sugerencias-cliente.test.tsx`, que ABRE el ⓘ
 * y comprueba que el texto se puede leer.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

/** Los tramos de texto que quedan DENTRO de cada `<Ayuda>…</Ayuda>` del archivo. */
function bloquesDeAyuda(fuente: string): string[] {
  const bloques: string[] = [];
  let desde = 0;
  for (;;) {
    const abre = fuente.indexOf("<Ayuda", desde);
    if (abre === -1) break;
    const cierra = fuente.indexOf("</Ayuda>", abre);
    if (cierra === -1) break;
    bloques.push(fuente.slice(abre, cierra));
    desde = cierra + 1;
  }
  return bloques;
}

/** Compara ignorando los saltos de línea y la sangría del JSX. */
const aplanar = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * (archivo, frase). La frase es un tramo CORTO y distintivo: si se pide la
 * oración entera, un reacomodo del JSX rompe el test sin que se haya perdido
 * nada, y el candado se termina borrando por ruidoso.
 */
const EN_UN_AYUDA: Array<[string, string]> = [
  // ── Packing Lists ────────────────────────────────────────────────────────
  ["app/packing-lists/PackingListsClient.tsx", "Bodega necesita esta información correcta para inventario"],
  ["app/packing-lists/PackingListsClient.tsx", "confía en el total del PDF y colapsa a 1 item"],
  ["app/packing-lists/PackingListsClient.tsx", "reconstruye el desglose por estilo"],
  ["app/packing-lists/[id]/page.tsx", "Muestra = bulto con talla M o 32 · OS = otro tamaño"],

  // ── Reclamos ─────────────────────────────────────────────────────────────
  ["app/reclamos/components/ReclamoForm.tsx", "la IA rellena proveedor, marca, factura, fecha y pedido"],
  ["app/reclamos/components/ReclamoForm.tsx", "se guardan junto con el reclamo en un solo paso"],
  ["app/reclamos/components/ReclamoDetail.tsx", "para marcar Pagado es obligatorio (foto o PDF)"],
  ["app/reclamos/components/EnviarProveedorModal.tsx", "Se adjunta el Excel"],
  ["app/reclamos/components/EnviarProveedorModal.tsx", "la tabla resumen y la descarga"],

  // ── Depurador ────────────────────────────────────────────────────────────
  ["app/productos/cargar/ReebokClient.tsx", "Vacío = hereda la fórmula de marca"],
  ["app/productos/cargar/FacturasTiendaClient.tsx", "La factura .xls no trae fecha"],
  ["app/productos/cargar/FacturasTiendaClient.tsx", "Jerarquía: precio fijo"],
  ["app/productos/cargar/CatalogoDescripcionesAdmin.tsx", "Desactivar no borra"],
  ["app/productos/cargar/CurvasView.tsx", "Sube el Excel crudo de Fashion Shoes"],

  // ── Marketing ────────────────────────────────────────────────────────────
  // El ⓘ "Cómo se llena el kit" de EntregaForm se fue el 12-ago-2026 CON la
  // funcionalidad que explicaba (Daniel mandó quitar el autorrelleno por
  // curva): no es una poda de texto, es una función eliminada. El candado
  // inverso —que la curva no VUELVA— vive abajo en este mismo archivo.
  ["components/marketing/AyudaClienteVinculado.tsx", "Elige del directorio para vincular"],
  ["app/marketing/components/FotosSection.tsx", "Respaldo visual que se adjunta a la cobranza a la marca"],

  // ── Gastos de Empresa: el módulo se retiró (11-ago-2026) ─────────────────
  // Sus dos textos de ayuda explicaban la carga MANUAL de gastos, que ya no
  // existe. No se "perdieron": se fueron con la pantalla que los alojaba.

  // ── Usuarios ─────────────────────────────────────────────────────────────
  ["app/admin/usuarios/page.tsx", "los deja ver en Cuentas por Cobrar únicamente los clientes de esa empresa"],
  ["app/admin/usuarios/page.tsx", "la lista reemplaza a la del rol, no se suma"],
  ["app/admin/usuarios/VendedorSwitchSection.tsx", "el pedido sale a Switch a nombre del vendedor que elijas"],
];

describe("la metodología que se movió a un ⓘ sigue estando adentro del ⓘ", () => {
  it.each(EN_UN_AYUDA)("%s → %s", (archivo, frase) => {
    const fuente = leer(archivo);
    const dentro = bloquesDeAyuda(fuente).map(aplanar);
    expect(
      dentro.some((b) => b.includes(aplanar(frase))),
      `"${frase}" ya no está dentro de ningún <Ayuda> de ${archivo}. ` +
        "Si el texto se movió, actualiza este candado; si se borró, no se puede borrar.",
    ).toBe(true);
  });

  it("todo archivo con un <Ayuda> lo IMPORTA de shared/Ayuda", () => {
    // Un `<Ayuda>` sin su import no compila, pero el barrido de arriba sí
    // pasaría contra un archivo que solo lo tenga en un comentario. Esto ata
    // los dos: el bloque que el candado mira es el componente de verdad.
    const archivos = [...new Set(EN_UN_AYUDA.map(([a]) => a))];
    for (const a of archivos) {
      const fuente = leer(a);
      expect(
        /import \{[^}]*\bAyuda\b[^}]*\} from "@\/components\/shared\/Ayuda"/.test(fuente),
        `${a} usa <Ayuda> pero no lo importa de @/components/shared/Ayuda`,
      ).toBe(true);
    }
  });
});

describe("🩸 el 'cómo se guarda el cliente' de Marketing es UNO, no dos copias", () => {
  // Estaba escrito palabra por palabra en el formulario de nuevo proyecto y en
  // el modal de editar. Dos copias de la misma frase se separan sola la primera
  // vez que alguien corrige una.
  // ProyectoForm.tsx se borró el 11-ago-2026 (su único caller era el modal de
  // "Nuevo proyecto", retirado cuando el proyecto pasó a autocrearse).
  const CONSUMIDORES = [
    "app/marketing/components/EditarProyectoModal.tsx",
  ];

  it.each(CONSUMIDORES)("%s usa el componente compartido", (archivo) => {
    expect(leer(archivo)).toContain("<AyudaClienteVinculado />");
  });

  it.each(CONSUMIDORES)("%s no vuelve a escribir la frase a mano", (archivo) => {
    expect(aplanar(leer(archivo))).not.toContain("Elige del directorio para vincular");
  });
});

describe("🩸 el aviso de saldo negativo de Caja es UNO, no dos copias", () => {
  // Los dos caminos guardan el MISMO gasto contra el MISMO fondo: dos copias es
  // una que se corrige y otra que se queda vieja, y la que se queda vieja es un
  // freno a una acción que descuadra la caja.
  const CONSUMIDORES = [
    "app/caja/components/NuevoGastoDrawer.tsx",
    "app/caja/[periodoId]/nuevo/page.tsx",
  ];

  it("el texto vive en el componente compartido", () => {
    const fuente = aplanar(leer("app/caja/components/AvisoSaldoNegativo.tsx"));
    expect(fuente).toContain("¿Continuar con saldo negativo?");
    expect(fuente).toContain("Este gasto deja el fondo en");
    expect(fuente).toContain("Considera solicitar reabastecimiento antes de seguir gastando");
  });

  it.each(CONSUMIDORES)("%s lo usa y no lo reescribe", (archivo) => {
    const fuente = aplanar(leer(archivo));
    expect(fuente).toContain("<AvisoSaldoNegativo");
    expect(fuente).not.toContain("¿Continuar con saldo negativo?");
  });
});

describe("⛔ el autorrelleno del kit de EntregaForm NO vuelve (12-ago-2026)", () => {
  // Daniel mandó quitar la curva: los inputs de accesorios son 100% MANUALES.
  // El riesgo inverso al del resto del archivo: acá lo que no puede volver es
  // la FUNCIONALIDAD — un autofill que mete cantidades que nadie escribió.
  it("ni la curva, ni el 'Sugerido:', ni el recálculo reaparecen", () => {
    const src = leer("components/marketing/EntregaForm.tsx");
    // Solo el CÓDIGO: los comentarios cuentan la historia y nombran la curva.
    const codigo = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/[^\n"']\/\/[^\n]*$/gm, "");
    expect(codigo).not.toMatch(/\bCURVA\b/);
    expect(codigo).not.toMatch(/curva/i);
    expect(codigo).not.toContain("Sugerido:");
    expect(codigo).not.toContain("sugeridoDe");
    expect(codigo).not.toContain("Recalcular accesorios");
    expect(codigo).not.toContain("tocadoManual");
    expect(codigo).not.toContain("Cómo se llena el kit");
  });
});

describe("🔴 lo que FRENA una acción sigue en pantalla, nunca adentro de un ⓘ", () => {
  // El propio componente lo dice en su encabezado: un aviso escondido detrás de
  // un toque es exactamente igual que un aviso borrado. Estos son los que la
  // poda tuvo más cerca de tragarse.
  const EN_PANTALLA: Array<[string, string]> = [
    // Guía cerrada: sin esto, un chip tocable se lee como "el despacho entero
    // se puede editar".
    ["app/guias/components/GuiasList.tsx", "Solo se puede cambiar el cliente"],
    // La ventana de sugerencias, cuando no hay ningún parecido.
    ["app/guias/components/SugerenciasCliente.tsx", "No hay ningún cliente parecido en el directorio"],
    ["app/guias/components/SugerenciasCliente.tsx", "Hay que darlo de alta en Switch"],
    // Borrar una guía no se deshace.
    ["app/guias/page.tsx", "Esta acción no se puede deshacer"],
    // Packing Lists: validar contra el PDF y la caducidad de 7 días.
    ["app/packing-lists/PackingListsClient.tsx", "Valida cada PL contra el PDF original antes de guardar"],
    ["app/packing-lists/PackingListsClient.tsx", "Los PLs se eliminan automáticamente después de 7 días"],
    // Reclamos: el comprobante es obligatorio para marcar Pagado.
    ["app/reclamos/components/SettlementModal.tsx", "obligatorio para marcar Pagado"],
    // Depurador: el bloqueo por descripciones nuevas.
    ["app/productos/cargar/DepuradorClient.tsx", "Bloqueado: hay"],
    ["app/productos/cargar/FacturasTiendaClient.tsx", "Bloqueado: hay"],
    // Marketing: las notas del proveedor NO se fusionan con el inventario.
    ["components/marketing/NotasProveedorMobiliario.tsx", "no se suma ni entra en los totales"],
    // Usuarios: el aviso de "esta función todavía no está activada".
    ["app/admin/usuarios/VendedorSwitchSection.tsx", "falta activar esta función en el sistema"],
  ];

  it.each(EN_PANTALLA)("%s → %s", (archivo, frase) => {
    const fuente = leer(archivo);
    const dentroDeAyuda = bloquesDeAyuda(fuente).map(aplanar);
    const plano = aplanar(fuente);

    expect(plano, `${archivo} ya no dice "${frase}"`).toContain(aplanar(frase));
    expect(
      dentroDeAyuda.some((b) => b.includes(aplanar(frase))),
      `"${frase}" es un AVISO y quedó adentro de un <Ayuda> en ${archivo}. ` +
        "Esconderlo detrás de un toque es igual que borrarlo: nadie abre un ⓘ " +
        "que no sabe que tiene algo adentro.",
    ).toBe(false);
  });
});
