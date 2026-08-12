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
import { useEffect, useState } from "react";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";

export default function CatalogoNavbar({ marca }: { marca: MarcaUiKey }) {
  const theme = getMarcaTheme(marca)!;
  const [role, setRole] = useState("");

  useEffect(() => {
    setRole(sessionStorage.getItem("cxc_role") || "");
  }, []);

  // QUIRK Reebok heredado: "← Inicio" solo con rol de sistema (≠ 'cliente').
  const showInicio = theme.features.navInicioRequiereRol ? !!role && role !== "cliente" : true;

  return (
    <nav className="sticky top-0 z-50 bg-white">
      <div className={`h-[2px] ${theme.navbar.accentBar}`} />
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4 border-b border-gray-100">
        {showInicio && (
          <Link href="/home" className={theme.navbar.inicioLink}>← Inicio</Link>
        )}
        {/* Logo de marca: opcional. Las marcas cuya identidad ya vive completa
            en el header grande (theme.logos.navbar === null) no lo repiten
            aquí — su navbar queda solo con "← Inicio". */}
        {theme.logos.navbar && (
          <Link href={theme.catalogoHref} className="flex-shrink-0">
            {theme.logos.navbar()}
          </Link>
        )}
      </div>
    </nav>
  );
}
