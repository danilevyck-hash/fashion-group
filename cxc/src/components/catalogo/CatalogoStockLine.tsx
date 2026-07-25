"use client";

// Línea de stock interno de la card, COMPARTIDA por la card plana
// (CatalogoProductCard) y la agrupada (CatalogoGroupedCard) — así el bloque no
// puede derivar entre marcas: es el MISMO markup, no dos copias parecidas.
// Los colores salen del tema (MARCA_THEME.card.stock); la estructura es única.
//
// Vocabulario del sistema: "Disponibilidad 48 · Existencia 48" (Daniel,
// 25-jul-2026). Solo catálogo INTERNO (showStock); NUNCA en el público.

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
    <div className={`mt-2 pt-2 border-t ${s.divider}`}>
      {/* 11px + nowrap en xl: a 5 columnas la línea completa mide ~182px contra
          200px de card — entra justa en UNA línea (medido en la app real). En
          iPad/móvil la card es de ~150px y NINGÚN tamaño legible cabe, así que
          ahí se deja fluir a dos líneas en vez de recortar el número. */}
      <div className="flex items-baseline gap-1.5 text-[11px] tabular-nums xl:flex-nowrap xl:whitespace-nowrap">
        <span className={`font-semibold whitespace-nowrap ${agotado ? s.agotado : s.strong}`}>
          Disponibilidad {disponibilidad ?? "—"}
        </span>
        <span className={s.dot}>&middot;</span>
        <span className={`${s.soft} whitespace-nowrap`}>
          Existencia {existencia ?? "—"}
        </span>
      </div>
    </div>
  );
}
