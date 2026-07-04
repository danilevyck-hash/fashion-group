import CheckoutClient from "@/components/catalogo/CheckoutClient";

// Checkout único del catálogo Reebok (el guard vive en el layout de /catalogo/reebok).
export default function ReebokCheckoutPage() {
  return <CheckoutClient marca="reebok" />;
}
