import { Suspense } from "react";
import { BostonShell } from "./BostonShell";

// El módulo Confecciones Boston — la operación de David.
//
// El SSR no trae datos a propósito: las seis pestañas leen sus propias rutas y
// la primera que se abre (Inicio) pide UNA sola. Sembrar acá el payload de la
// pestaña activa habría obligado a que el servidor supiera qué pestaña es, o a
// traer las seis por si acaso — contra una base en compute Micro.

export const dynamic = "force-dynamic";

export default function BostonPage() {
  return (
    // Suspense requerido por useSearchParams (vía useUrlState) en Next 14 App
    // Router. Mismo patrón que /ventas y /multifashion.
    <Suspense>
      <BostonShell />
    </Suspense>
  );
}
