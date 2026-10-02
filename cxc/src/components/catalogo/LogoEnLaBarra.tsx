"use client";

import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";

/** El logo de la marca a la altura de una barra. Tommy es muy ancho (17:1):
 *  en el celular va solo la palabra, en la computadora con la bandera. Lo usan
 *  la barra del catálogo con sesión y el encabezado del catálogo público. */
export default function LogoEnLaBarra({ marca }: { marca: MarcaUiKey }) {
  if (marca === "tommy") {
    return (
      <span className="flex items-center gap-2.5">
        <img src="/tommy/tommy-flag.png" alt="" className="hidden sm:block w-9 h-6 object-contain shrink-0" />
        <img src="/tommy/tommy-horizontal.png" alt="TOMMY HILFIGER" className="h-3 sm:h-4 w-auto" />
      </span>
    );
  }
  return <>{getMarcaTheme(marca)!.logos.header()}</>;
}
