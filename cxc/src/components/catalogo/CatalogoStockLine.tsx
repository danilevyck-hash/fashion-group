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

interface CatalogoStockLineProps {
  marca: MarcaUiKey;
  /** Vendible (saldo − apartado). null/undefined → "—" y la línea va atenuada. */
  disponibilidad: number | null | undefined;
  /** Saldo físico. null/undefined → "—". */
  existencia: number | null | undefined;
}

export default function CatalogoStockLine({ marca, disponibilidad, existencia }: CatalogoStockLineProps) {
  const s = getMarcaTheme(marca)!.card.stock;
  const agotado = disponibilidad == null || disponibilidad <= 0;
  return (
    /* Sin border-t ni separador: el stock ya no es una franja aparte, es la
       columna derecha del renglón del precio (Daniel, 25-jul-2026).
       shrink-0 + nowrap: los dos renglones nunca se parten a mitad de palabra.
       xl:text-right — de xl para arriba va pegado al borde derecho de la card;
       por debajo (card de ~173px) el bloque cae bajo el precio, alineado a la
       izquierda, porque ahí NINGÚN tamaño legible cabe al lado. */
    <div className="shrink-0 text-[11px] leading-[15px] tabular-nums xl:text-right">
      <div className={`font-semibold whitespace-nowrap ${agotado ? s.agotado : s.strong}`}>
        Disponibilidad {disponibilidad ?? "—"}
      </div>
      <div className={`whitespace-nowrap ${s.soft}`}>
        Existencia {existencia ?? "—"}
      </div>
    </div>
  );
}
