import Link from "next/link";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { PANEL_COMPROBANTES } from "@/lib/catalogo/numeros-pedido";

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 UNA SOLA RUTA ARRIBA (17-sep-2026)
//
// Daniel, 6-sep-2026, textual: «entro a catalogo y sale /catalogos/marcas,
// después entro a pedidos y sale /catalogo/reebok/pedidos y si pongo /catalogo
// sale error» · «una sola ruta arriba: Inicio › Catálogos › Marcas › Reebok ›
// Pedidos».
//
// 🩸 Esta pantalla era la única del módulo sin camino arriba: se llegaba desde
// el hub, desde el catálogo de la marca o desde un enlace, y lo único que decía
// dónde estabas era un «← Catálogo» chiquito.
//
// ⚠️ El catálogo con sesión NO lleva `AppHeader` —su encabezado es
// `CatalogoNavbar`, que es la que publica el alto para las barras pegajosas—,
// así que la ruta se dibuja acá, debajo de esa navbar, con el MISMO aspecto que
// la barra de breadcrumb de `AppHeader` (px-6 py-1, text-xs, separador «›», el
// último tramo en texto plano).
//
// 🔑 El último tramo dice «Comprobantes», no «Pedidos», y no es un desvío del
// pedido de Daniel: ese mismo 6-sep-2026 él decidió *«todo Comprobantes, porque
// ahí también hay cotizaciones y borradores»* para arreglar que este lugar
// tuviera TRES nombres. El rótulo se DERIVA de `PANEL_COMPROBANTES`, el mismo
// del título de la pantalla y del botón del hub: un cuarto nombre acá sería
// volver al problema. La `key` de la ruta sigue siendo `pedidos`.
//
// ⚠️ «Catálogos» apunta a `/catalogo`, que desde hoy redirige (307) al hub —
// igual que el breadcrumb del propio hub, que deriva su enlace del primer tramo
// de la dirección. Antes las dos caían en el 404 de Next, en inglés.
// ─────────────────────────────────────────────────────────────────────────────

/** Los tramos, en orden. El último no es enlace: es donde estás parado. */
export function tramosDeComprobantes(marca: MarcaUiKey): { label: string; href?: string }[] {
  const theme = getMarcaTheme(marca);
  return [
    { label: "Inicio", href: "/home" },
    { label: "Catálogos", href: "/catalogo" },
    { label: "Marcas", href: "/catalogos/marcas" },
    { label: theme?.label ?? "", href: theme?.catalogoHref },
    { label: PANEL_COMPROBANTES },
  ];
}

export default function RutaArriba({ marca }: { marca: MarcaUiKey }) {
  const tramos = tramosDeComprobantes(marca);
  const ultimo = tramos.length - 1;
  return (
    <nav aria-label="Dónde estás" className="flex flex-wrap items-center gap-1 px-6 py-1 text-xs text-gray-400">
      {tramos.map((t, i) => (
        <span key={t.label} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden>›</span>}
          {i === ultimo || !t.href ? (
            <span className="cursor-default font-medium text-gray-600">{t.label}</span>
          ) : (
            <Link
              href={t.href}
              className="-my-[13px] inline-flex min-h-[44px] min-w-[44px] items-center justify-center transition hover:text-gray-700 hover:underline"
            >
              {t.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
