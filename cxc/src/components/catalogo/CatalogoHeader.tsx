"use client";

// Header del catálogo (logo + "Catalogo Panama"), parametrizado por MARCA_THEME.

import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";

interface CatalogoHeaderProps {
  marca: MarcaUiKey;
  variant: "public" | "vendor";
}

export default function CatalogoHeader({ marca, variant }: CatalogoHeaderProps) {
  const theme = getMarcaTheme(marca)!;
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">{theme.logos.header()}</div>
        {variant === "public" ? (
          <div className="flex items-center gap-1.5">
            <div className={theme.header.fashionGroupBar} />
            <span className={theme.header.fashionGroupText}>Fashion Group</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
