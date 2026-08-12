"use client";

// Header del catálogo (el logo de la marca), parametrizado por MARCA_THEME.
// El subtítulo "Catálogo Panamá" que iba bajo el logo se podó (12-ago-2026).

import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";

interface CatalogoHeaderProps {
  marca: MarcaUiKey;
  variant: "public" | "vendor";
}

export default function CatalogoHeader({ marca, variant }: CatalogoHeaderProps) {
  const theme = getMarcaTheme(marca)!;
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
