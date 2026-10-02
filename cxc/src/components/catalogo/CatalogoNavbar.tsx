"use client";

// Navbar del catálogo con sesión, parametrizado por MARCA_THEME: link a Inicio
// y marca.
//
// 🩸 "PEDIDOS" YA NO VIVE ACÁ (12-ago-2026). Daniel: *"cambia el boton de
// pedido a la altura de compartir"*, en las 4 marcas. Estaba arriba del todo,
// en la barra de la app, mientras "Compartir" —la otra acción del catálogo—
// vivía más abajo, en la fila del logo. Ahora los dos están juntos, en
// `CatalogoVendedorPage` (ver `theme.vendorShare.pedidosBtn`).
//
// ⚠️ Consecuencia buscada: la navbar envuelve TODAS las sub-rutas del catálogo
// (/pedidos, /pedido/[id], /checkout…), así que "Pedidos" pasa a verse solo en
// la pantalla del catálogo. Desde el detalle se sigue volviendo con "← Volver a
// Pedidos", que es el camino que ya existía.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { hayCaminoDeMigas } from "@/lib/catalogo/camino-de-migas";
import { usePublicarAlturaEncabezado } from "@/lib/hooks/usePublicarAlturaEncabezado";
import { CATALOGOS_APPLE_2026_10, ID_ACCIONES_EN_LA_BARRA } from "@/lib/catalogo/catalogos-2026-10";

/** El logo de la marca a la altura de la barra. Tommy es muy ancho (17:1):
 *  en el celular va solo la palabra, en la computadora con la bandera. */
function LogoEnLaBarra({ marca }: { marca: MarcaUiKey }) {
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

export default function CatalogoNavbar({ marca }: { marca: MarcaUiKey }) {
  const theme = getMarcaTheme(marca)!;
  const [role, setRole] = useState("");
  const pathname = usePathname();

  // El catálogo con sesión NO lleva `AppHeader`: su encabezado pegajoso es esta
  // navbar, así que es ella la que publica el alto para las barras de adentro
  // (hoy, la del modo pedido). Ver src/lib/ui/barra-pegajosa.ts.
  const navRef = useRef<HTMLElement | null>(null);
  usePublicarAlturaEncabezado(navRef);

  useEffect(() => {
    setRole(sessionStorage.getItem("cxc_role") || "");
  }, []);

  // QUIRK Reebok heredado: "← Inicio" solo con rol de sistema (≠ 'cliente').
  const permiteInicio = theme.features.navInicioRequiereRol ? !!role && role !== "cliente" : true;
  // 🔴 «← Inicio» SE ESCONDE DONDE HAY CAMINO DE MIGAS (22-sep-2026). En
  // Comprobantes había TRES formas de volver apiladas en 100 píxeles; se queda
  // el camino, que además dice dónde estás. ⚠️ En las demás sub-rutas del
  // catálogo —el catálogo, el checkout, el detalle, la confirmación— NO hay
  // camino, y esta flecha es la única salida: ahí no se toca.
  const showInicio = permiteInicio && !hayCaminoDeMigas(pathname);
  const enElCatalogo = CATALOGOS_APPLE_2026_10 && pathname === theme.catalogoHref;

  return (
    <nav ref={navRef} className="sticky top-0 z-50 bg-white">
      <div className={`h-[2px] ${theme.navbar.accentBar}`} />
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3 sm:gap-4 border-b border-gray-100">
        {showInicio && (
          <Link href="/home" className={theme.navbar.inicioLink}>← Inicio</Link>
        )}
        {/* Logo de marca: opcional. Las marcas cuya identidad ya vive completa
            en el header grande (theme.logos.navbar === null) no lo repiten
            aquí — su navbar queda solo con "← Inicio". */}
        {enElCatalogo ? (
          /* Propuesta estilo Apple (v2): en la pantalla del catálogo el logo
             vive AQUÍ, en la línea de «← Inicio», y es el ÚNICO de la
             pantalla (el catálogo ya no dibuja su franja de logo). A la
             derecha, el hueco donde el catálogo monta sus acciones. */
          <>
            <Link href={theme.catalogoHref} className="min-w-0 shrink min-h-[44px] inline-flex items-center">
              <LogoEnLaBarra marca={marca} />
            </Link>
            <div id={ID_ACCIONES_EN_LA_BARRA} className="ml-auto flex items-center" />
          </>
        ) : theme.logos.navbar && (
          /* 6-sep-2026: el logo es un ENLACE al catálogo y medía 24-28 px de
             alto. `min-h-[44px]` lo sube al mínimo táctil; el logo se dibuja
             igual, solo gana aire arriba y abajo. */
          <Link href={theme.catalogoHref} className="flex-shrink-0 min-h-[44px] inline-flex items-center">
            {theme.logos.navbar()}
          </Link>
        )}
      </div>
    </nav>
  );
}
