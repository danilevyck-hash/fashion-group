// La pantalla de marcar.
//
// ⚠️ EL GUARD NO ESTÁ ACÁ, Y ESO ES A PROPÓSITO: vive en `layout.tsx`, que
// cubre el segmento ENTERO (esta pantalla y cualquiera que nazca debajo) y es
// el archivo del PERMISO. Repetirlo acá serían dos copias de la misma regla:
// el día que cambie quién entra, una de las dos quedaría vieja.

import MarcacionClient from "./MarcacionClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marcación · Fashion Group" };

export default function Page() {
  return <MarcacionClient />;
}
