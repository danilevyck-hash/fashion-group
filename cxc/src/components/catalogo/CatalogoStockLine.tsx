"use client";

// Bloque de stock interno de la card, COMPARTIDO por la card plana
// (CatalogoProductCard) y la agrupada (CatalogoGroupedCard) — así el bloque no
// puede derivar entre marcas: es el MISMO markup, no dos copias parecidas.
// Los colores salen del tema (MARCA_THEME.card.stock); la estructura es única.
//
// Vocabulario del sistema: "Disponibilidad 48" / "Existencia 48" (Daniel,
// 25-jul-2026) — palabras completas, nunca abreviadas. Solo catálogo INTERNO
// (showStock); NUNCA en el público.
//
// POR QUÉ DOS RENGLONES Y NO UNO (medido, 25-jul-2026): el bloque va a la
// DERECHA del precio, y la card mide 224px en escritorio (204px de contenido).
// Con la fuente real de la app y números de 3 dígitos:
//   · "Disponibilidad 191 · Existencia 191" en UNA línea = 190.5px a 11px,
//     + 61.2px del precio + 8px de gap = 259.7px > 204px → NO cabe. Para que
//     cupiera habría que bajar la fuente a ~7.5px (ilegible).
//   · apilado, el renglón más ancho es "Disponibilidad 191" = 97.2px a 11px,
//     + 61.2 + 8 = 166.4px ≤ 204px → entra con 37.6px de sobra.
// Por eso se apila a la derecha y desaparece el "·" (ya no separa nada).
// Además el bloque ocupa 30px de alto contra los 44px de la columna del precio:
// la card NO crece por el stock.

import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { MOSTRAR_EXISTENCIA } from "@/lib/catalogo/stock-en-la-tarjeta";
import { CATALOGO_ORDEN_CELULAR } from "@/lib/catalogo/orden-celular";

interface CatalogoStockLineProps {
  marca: MarcaUiKey;
  /** Vendible (saldo − apartado). null/undefined → "—" y la línea va atenuada. */
  disponibilidad: number | null | undefined;
  /** Saldo físico. null/undefined → "—". */
  existencia: number | null | undefined;
  /**
   * Talla elegida — SOLO la card agrupada de Joybees con selector de talla
   * (30-jul-2026). Con talla el bloque deja de ser la columna derecha del precio
   * y pasa a ocupar el ancho completo DEBAJO de los botones de talla:
   * "Disponibilidad 168 · Junior". Ahí el número tiene que decir de QUÉ talla es,
   * y al lado del precio no cabe (medido: "Disponibilidad 168 · Junior" son
   * ~135px de los 204px de contenido, y el precio ya se lleva 61px + 8 de gap).
   * Sin talla, el bloque histórico de dos renglones a la derecha — es el caso de
   * Reebok, Tommy y los modelos de una sola talla: no cambia nada.
   */
  talla?: string;
  /**
   * «Bulto de N» — SOLO en el celular y solo cuando la card lo cede (24-sep-2026).
   *
   * 🔴 EN EL CELULAR LOS TRES DATOS VAN EN UNA LÍNEA: «Bulto de 12 ·
   * Disponibilidad 1 · Existencia 1». Medido en la tarjeta de CLASSIC LEATHER a
   * 390 px, los tres renglones ocupaban **41 px** (727→734, 745→755, 760→768) y
   * en uno solo son **8**: la tarjeta baja de 368 a 335 px y el catálogo entero
   * de Reebok, de 30.386 px a unos 27.900 — casi tres pantallas menos.
   *
   * ⚠️ No se quita ningún dato ni se toca un número. La card sigue dibujando su
   * propio «Bulto de N» para `sm` en adelante (ahí nada cambia), y este de aquí
   * solo existe hasta `sm`. Sin `bulto` —catálogo público, o el interruptor
   * apagado— la línea no lo menciona y la card lo dibuja como siempre.
   */
  bulto?: string;
}

export default function CatalogoStockLine({ marca, disponibilidad, existencia, talla, bulto }: CatalogoStockLineProps) {
  const s = getMarcaTheme(marca)!.card.stock;
  const agotado = disponibilidad == null || disponibilidad <= 0;
  // La línea única es del CELULAR y del bloque de la derecha (sin talla): con
  // talla el bloque ya vive a lo ancho debajo de los botones y no se toca.
  const enUnaLinea = CATALOGO_ORDEN_CELULAR && !talla;
  return (
    /* Sin border-t ni separador: el stock ya no es una franja aparte, es la
       columna derecha del renglón del precio (Daniel, 25-jul-2026).
       shrink-0 + nowrap: los dos renglones nunca se parten a mitad de palabra.
       xl:text-right — de xl para arriba va pegado al borde derecho de la card;
       por debajo (card de ~173px) el bloque cae bajo el precio, alineado a la
       izquierda, porque ahí NINGÚN tamaño legible cabe al lado. */
    <div className={talla
      ? "text-[11px] leading-[15px] tabular-nums"
      : enUnaLinea
        ? "shrink-0 flex flex-wrap items-center gap-x-1.5 text-[11px] leading-[15px] tabular-nums sm:block xl:text-right"
        : "shrink-0 text-[11px] leading-[15px] tabular-nums xl:text-right"}>
      {/* 🔴 El «Bulto de N» del celular. Va PRIMERO, como en la pantalla de
          hoy, y desaparece de `sm` para arriba: ahí lo sigue dibujando la card
          bajo el precio, donde siempre estuvo. */}
      {enUnaLinea && bulto && (
        <div className={`whitespace-nowrap sm:hidden ${s.soft}`}>Bulto de {bulto}</div>
      )}
      {/* 🔑 El punto medio que separa los datos en el celular es CSS (`before:`),
          nunca un nodo de texto: así lo que se lee de la tarjeta sigue diciendo
          «Disponibilidad 1» y «Existencia 1», sin un «·» pegado a la palabra. */}
      <div className={`font-semibold whitespace-nowrap ${
        enUnaLinea && bulto ? "before:mr-1.5 before:content-['·'] sm:before:content-none " : ""
      }${agotado ? s.agotado : s.strong}`}>
        Disponibilidad {disponibilidad ?? "—"}
        {talla && <span className={`font-normal ${s.soft}`}> · {talla}</span>}
      </div>
      {/* 🔑 El segundo renglón cuelga de UN interruptor (22-sep-2026): medido,
          los dos números dicen lo mismo en 643 de 838 productos activos, y en
          el teléfono son dos renglones de una tarjeta que ya es alta. Arranca
          PRENDIDO —la pantalla no cambió— porque cuál de los dos se queda lo
          decide Daniel, no el código. Ver `stock-en-la-tarjeta.ts`. */}
      {MOSTRAR_EXISTENCIA && (
        <div className={`whitespace-nowrap ${
          enUnaLinea ? "before:mr-1.5 before:content-['·'] sm:before:content-none " : ""
        }${s.soft}`}>
          Existencia {existencia ?? "—"}
        </div>
      )}
    </div>
  );
}
