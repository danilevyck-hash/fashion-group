"use client";

// Navbar del catálogo con sesión, parametrizado por MARCA_THEME: link a
// Inicio, marca, y acceso secundario "Pedidos" para roles gestores.

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";

export default function CatalogoNavbar({ marca }: { marca: MarcaUiKey }) {
  const theme = getMarcaTheme(marca)!;
  const [role, setRole] = useState("");

  useEffect(() => {
    setRole(sessionStorage.getItem("cxc_role") || "");
  }, []);

  const isManager = role === "admin" || role === "vendedor" || role === "secretaria";
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
        <div className="flex-1" />
        {/* El pedido se arma en el carrito → "Ver pedido" → checkout. Aquí solo
            queda "Pedidos" como acceso secundario a la lista (no crea nada). */}
        {isManager && (
          <Link href={theme.pedidosHref} className={theme.navbar.pedidosLink}>Pedidos</Link>
        )}
      </div>
    </nav>
  );
}
