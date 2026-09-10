import { redirect } from "next/navigation";

import { PERSONA_EN_EL_CENTRO } from "@/lib/asistencia/persona-en-el-centro";
import PersonaPagina from "../PersonaPagina";

export const dynamic = "force-dynamic";
export const metadata = { title: "Persona · Asistencia · Fashion Group" };

/**
 * LA PÁGINA DE UNA PERSONA — ruta propia, como la ficha del cliente.
 *
 * 🔴 CON EL INTERRUPTOR APAGADO ESTA DIRECCIÓN NO EXISTE, y no basta con
 * esconder el enlace: quien la escriba a mano vuelve al módulo. Sin esto,
 * apagar el acomodo nuevo dejaría media pantalla prendida — que es exactamente
 * lo que un interruptor existe para impedir.
 *
 * ⚠️ Esto es NAVEGACIÓN, no el candado. El freno de verdad son las rutas de
 * `/api/asistencia/*`, que exigen el rol y contestan 403.
 */
export default function Page({ params }: { params: { codigo: string } }) {
  if (!PERSONA_EN_EL_CENTRO) redirect("/asistencia");
  return <PersonaPagina codigo={decodeURIComponent(params.codigo)} />;
}
