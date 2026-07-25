// Layout del catálogo con sesión /catalogo/[marca] — dinámico por marca.
// Valida la marca contra MARCA_THEME (404 si no existe) y monta guard + navbar.
// ToastProvider vive aquí (patrón del layout Reebok original; la lista de
// pedidos usa useToast — el layout Joybees viejo no lo tenía, bug latente).

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CatalogoAuthGuard from "@/components/catalogo/CatalogoAuthGuard";
import CatalogoNavbar from "@/components/catalogo/CatalogoNavbar";
import { ToastProvider } from "@/components/ToastSystem";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";

export function generateMetadata({ params }: { params: { marca: string } }): Metadata {
  const theme = getMarcaTheme(params.marca);
  if (!theme) return {};
  return { title: theme.metaTitle, description: theme.metaDescription };
}

export default function CatalogoMarcaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { marca: string };
}) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();

  return (
    <CatalogoAuthGuard>
      <ToastProvider>
        <div className="min-h-screen flex flex-col" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
          <CatalogoNavbar marca={theme.marca} />
          <main className="flex-1">{children}</main>
        </div>
      </ToastProvider>
    </CatalogoAuthGuard>
  );
}
