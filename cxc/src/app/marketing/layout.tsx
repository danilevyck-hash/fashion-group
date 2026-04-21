import { ToastProvider } from "@/components/ToastSystem";

export const metadata = {
  title: "Marketing — Fashion Group",
  description:
    "Gastos compartidos a marcas: proyectos, facturas, cobranzas y pagos.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}
