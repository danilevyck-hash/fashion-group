"use client";

// Header del catálogo (el logo de la marca), parametrizado por MARCA_THEME.
// El subtítulo "Catálogo Panamá" que iba bajo el logo se podó (12-ago-2026).

import type { ReactNode } from "react";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import LogoEnLaBarra from "./LogoEnLaBarra";

interface CatalogoHeaderProps {
  marca: MarcaUiKey;
  variant: "public" | "vendor";
  /** `CATALOGOS_APPLE_2026_10_B` (catálogo público): el logo, el sello y esta
   *  acción en UNA fila, sin franjas. Sin ella, el encabezado de hoy. */
  enUnaFila?: { accion: ReactNode };
}

export default function CatalogoHeader({ marca, variant, enUnaFila }: CatalogoHeaderProps) {
  const theme = getMarcaTheme(marca)!;
  if (enUnaFila) {
    // A la izquierda el logo y el sello (que baja debajo del logo solo si no
    // cabe, como con Tommy en el celular); a la derecha la acción.
    return (
      <div className="mb-3 flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex shrink-0 items-center"><LogoEnLaBarra marca={marca} /></div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className={theme.header.fashionGroupBar} />
            <span className={theme.header.fashionGroupText}>Fashion Group</span>
          </div>
        </div>
        {enUnaFila.accion}
      </div>
    );
  }
  return (
    <div className="mb-6">
      {/* `flex-wrap` + hijos `shrink-0`: el logo NUNCA se aplasta. El wordmark
          de Tommy es ancho (relación 14:1) y en teléfono no cabía junto al
          sello "Fashion Group" — flexbox lo comprimía y deformaba las letras.
          Ahora el sello baja de línea. Reebok y Joybees no se mueven. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 shrink-0">{theme.logos.header()}</div>
        {variant === "public" ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={theme.header.fashionGroupBar} />
            <span className={theme.header.fashionGroupText}>Fashion Group</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
