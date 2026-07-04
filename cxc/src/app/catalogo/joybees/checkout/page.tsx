"use client";

import CheckoutClient from "@/components/catalogo/CheckoutClient";

// Checkout único del catálogo Joybees (guard + navbar en el layout de /catalogo/joybees).
export default function JoybeesCheckoutPage() {
  return <CheckoutClient marca="joybees" />;
}
