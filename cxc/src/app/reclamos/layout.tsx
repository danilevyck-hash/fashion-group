import { ToastProvider } from "@/components/ToastSystem";

// ToastProvider para toda la ruta /reclamos. Lo necesita FacturaPdfUploader
// (y el PdfUploader de marketing que reusa), que llaman useToast() al montar —
// sin este provider el hook lanza "useToast must be used within ToastProvider"
// y el form de "Reclamo nuevo" cae a pantalla blanca. Mismo patrón que
// marketing/layout.tsx y catalogo/reebok/layout.tsx.
export default function ReclamosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}
