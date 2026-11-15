"use client";

import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";

/** El logo de la marca a la altura de una barra. Tommy es muy ancho (17:1):
 *  en el celular va solo la palabra, en la computadora con la bandera. Lo usan
 *  la barra del catálogo con sesión y el encabezado del catálogo público. */
export default function LogoEnLaBarra({ marca }: { marca: MarcaUiKey }) {
  if (marca === "tommy") {
    return (
      <span className="flex items-center gap-2.5">
        <img src="/tommy/tommy-flag.png" alt="" width={1241} height={827} className="hidden sm:block w-9 h-6 object-contain shrink-0" />
        {/* width/height reales: el navegador guarda el ancho ANTES de que llegue la
            foto y el sello no salta de línea (CLS 0,24 → velocidad-2026-11). */}
        <img src="/tommy/tommy-horizontal.png" alt="TOMMY HILFIGER" width={900} height={52} className="h-3 sm:h-4 w-auto" />
      </span>
    );
  }
  return <>{getMarcaTheme(marca)!.logos.header()}</>;
}
