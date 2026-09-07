"use client";

// ─────────────────────────────────────────────────────────────────────────────
// «DESCARGAR PDF» DEL CATÁLOGO — UNA sola implementación, dos pantallas.
//
// 🔴 EL CLIENTE TAMBIÉN PUEDE DESCARGARLO (6-sep-2026). Hasta hoy el PDF vivía
// SOLO del lado del vendedor, en «Compartir › Descargar PDF» — y es exactamente
// el mismo archivo que él le manda a mano por WhatsApp. Ahora el catálogo
// público lo ofrece igual.
//
// 🔑 No se copió el código: se MUDÓ acá. Las ~90 líneas que armaban el
// subtítulo y las secciones vivían dentro de `CatalogoVendedorPage`; duplicarlas
// habría dejado dos PDF que se van separando con el primer arreglo que alguien
// haga en uno solo. Se llama desde las dos pantallas y sale el MISMO archivo.
//
// El verbo es **«Descargar»** en los dos lados: es la palabra de la casa (el
// sistema la usa 23 veces contra 5 formas raras — ver el rediseño de Comisiones).
//
// ⚠️ El PDF sí respeta los filtros de QUIEN LO PIDE, y por eso el subtítulo los
// escribe. Eso no es lo mismo que el ENLACE compartido, que desde hoy sale
// pelado (ver `handleCopyLink`): un PDF es una foto de lo que estás mirando; un
// enlace es la puerta al catálogo entero.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from "react";
import type { MarcaTheme, MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import type { FiltroPrecio } from "@/lib/catalogo/filtros-extra";
import type { CatalogoProducto } from "./types";
import {
  SECTION_ORDER, SECTION_LABELS,
  type DisplaySection, type GroupedProduct,
} from "./groupByModel";

interface ItemPdf {
  name: string;
  sku: string;
  color?: string | null;
  price: number | null;
  image_url: string | null;
  badge: string | null;
}

export interface DescargaPdfArgs {
  marca: MarcaUiKey;
  theme: MarcaTheme;
  agrupado: boolean;
  /** Pipeline plano: los productos ya filtrados y ordenados. */
  filtered: CatalogoProducto[];
  /** Pipeline agrupado: los grupos ya filtrados, con su sección. */
  sortedGroups: { group: GroupedProduct; section: DisplaySection }[];
  filteredCount: number;
  gender: string;
  category: string;
  search: string;
  bultosFilter: boolean;
  precio: FiltroPrecio;
  /** Etiqueta legible de cada categoría (sale del tema, la arma la pantalla). */
  catLabel: Record<string, string>;
  /** Un aviso corto en pantalla (toast). */
  avisar: (mensaje: string) => void;
}

export function useDescargarCatalogoPdf() {
  const [descargando, setDescargando] = useState(false);

  const descargar = useCallback(async (a: DescargaPdfArgs) => {
    const {
      marca, theme, agrupado, filtered, sortedGroups, filteredCount,
      gender, category, search, bultosFilter, precio, catLabel, avisar,
    } = a;

    if ((agrupado ? !sortedGroups.length : !filtered.length) || descargando) return;

    setDescargando(true);
    avisar("Generando catalogo PDF...");

    try {
      // Lib compartida de todas las marcas (src/lib/catalogo/catalog-pdf.ts).
      const { downloadCatalogPdf } = await import("@/lib/catalogo/catalog-pdf");

      const filterDesc: string[] = [];
      if (agrupado) {
        if (gender) filterDesc.push(SECTION_LABELS[gender as DisplaySection] || gender);
        if (category) filterDesc.push(category);
        if (search) filterDesc.push(`“${search}”`);
      } else {
        if (gender) filterDesc.push(theme.genero.filterLabel(gender));
        if (category) filterDesc.push(catLabel[category] || category);
        if (search) filterDesc.push(`“${search}”`);
      }
      // 🩸 EL PRECIO Y LOS BULTOS TAMBIÉN SE ESCRIBEN. El subtítulo listaba
      // género, categoría y búsqueda y NADA MÁS: con el filtro de precio puesto
      // salía un PDF de 12 productos que se leía como "este es todo el catálogo
      // Tommy", y quien lo recibe por WhatsApp no tiene cómo saber que estaba
      // recortado. Vale para las dos ramas: los dos filtros son de Tommy/Calvin,
      // que van por la rama plana, pero escribirlo acá abajo lo deja atado al
      // FILTRO y no al pipeline.
      if (theme.features.filtroBultos && bultosFilter) filterDesc.push("2 bultos o más");
      const pDesde = precio.desde.trim();
      const pHasta = precio.hasta.trim();
      if (theme.features.filtroPrecio && (pDesde || pHasta)) {
        filterDesc.push(
          pDesde && pHasta ? `$${pDesde} a $${pHasta}`
            : pDesde ? `desde $${pDesde}`
              : `hasta $${pHasta}`,
        );
      }
      // Sin filtros el subtítulo va VACÍO (poda, 12-ago-2026): decía "Todos los
      // productos" sobre un PDF que ya anuncia "{n} productos" en la portada —
      // no distinguía nada de nada. Con filtros puestos sí informa ("HOMBRE ·
      // CALZADO"), y ahí se conserva tal cual.
      const subtitle = filterDesc.length > 0 ? filterDesc.join("  ·  ") : "";

      let pdfSections: { label: string; items: ItemPdf[] }[];
      if (agrupado) {
        // Secciones canónicas por SECTION_ORDER (mismo orden que la vista).
        const bySection = new Map<DisplaySection, GroupedProduct[]>();
        for (const gs of sortedGroups) {
          if (!bySection.has(gs.section)) bySection.set(gs.section, []);
          bySection.get(gs.section)!.push(gs.group);
        }
        pdfSections = [...bySection.entries()]
          .sort((x, y) => (SECTION_ORDER[x[0]] ?? 99) - (SECTION_ORDER[y[0]] ?? 99))
          .map(([section, groups]) => ({
            label: SECTION_LABELS[section] || section,
            items: groups.map(g => ({
              name: g.name, sku: g.baseSku, price: g.price,
              image_url: g.image_url, badge: null,
            })),
          }));
      } else {
        // Agrupación canónica de la marca (theme.genero.pdfSections): Reebok
        // Hombre/Mujer/Niños/Unisex, Tommy Women/Men/Boys/Girls. "otros" cierra
        // el catch-all para que ningún producto con género no contemplado se
        // caiga del PDF en silencio.
        pdfSections = theme.genero.pdfSections.map(g => ({
          label: g.label,
          items: filtered.filter(p => theme.genero.groupKey(p.gender) === g.key).map(p => ({
            name: p.name, sku: p.sku || "", color: p.color, price: p.price,
            image_url: p.image_url || null, badge: p.badge ?? null,
          })),
        }));
      }

      await downloadCatalogPdf({
        marca,
        sections: pdfSections,
        subtitle,
        totalCount: filteredCount,
        filename: `catalogo-${marca}-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
      avisar("Catalogo descargado");
    } catch (e) {
      console.error(e);
      avisar("Error al generar PDF");
    } finally {
      setDescargando(false);
    }
  }, [descargando]);

  return { descargando, descargar };
}
