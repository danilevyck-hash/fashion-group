"use client";

import ConfirmacionClient from "@/components/catalogo/ConfirmacionClient";

export default function JoybeesConfirmacionPage({ params }: { params: { id: string } }) {
  return <ConfirmacionClient marca="joybees" orderId={params.id} />;
}
