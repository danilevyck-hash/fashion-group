// La pantalla de marcar.
//
// ⚠️ EL GUARD NO ESTÁ ACÁ, Y ESO ES A PROPÓSITO: vive en `layout.tsx`, que
// cubre el segmento ENTERO (esta pantalla y cualquiera que nazca debajo) y es
// el archivo del PERMISO. Repetirlo acá serían dos copias de la misma regla:
// el día que cambie quién entra, una de las dos quedaría vieja.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL PRIMER PINTADO YA TRAE EL CONTENIDO (19-sep-2026).
//
// 🩸 Ana Trejos abrió la app en su teléfono y vio DOS pantallas seguidas: una
// en blanco con solo el encabezado, y un instante después todo de golpe — el
// saludo, la hora grande, el botón. Daniel: *«se siente lagged»*. La causa no
// era la red lenta: era que esta página pintaba un cascarón vacío y
// `MarcacionClient` recién entonces pedía los datos DESDE EL NAVEGADOR. Entre
// una cosa y la otra no había nada que mirar. En la calle, con señal mala, ese
// «entre» dura segundos.
//
// Ahora el estado se arma ACÁ, en el servidor, con las MISMAS funciones que
// contesta `GET /api/marcacion` (`armarEstadoDeLaPantalla`): no hay una segunda
// forma de armarlo, así que la pantalla no puede decir una cosa al abrirse y
// otra al refrescarse.
//
// 🔴 FALLA ABIERTA. Si la base no contesta, esto devuelve `null` y la pantalla
// se comporta EXACTAMENTE como antes: pide el dato desde el navegador. Un
// arreglo de pantalla no puede dejar a nadie sin poder marcar.
//
// ⚠️ NO SE PINTA UNA HORA INVENTADA: lo que viaja es `ahora`, la hora que dijo
// el servidor, y el teléfono ancla su reloj en ésa. Ver `MarcacionClient`.
// ─────────────────────────────────────────────────────────────────────────────

import { cookies } from "next/headers";
import { verifySession } from "@/lib/session-cookie";
import { leerEmpleadoCodigo } from "@/lib/marcacion/acceso";
import { armarEstadoDeLaPantalla, nombreDeLaFicha } from "@/lib/marcacion/estado-server";
import { AVISO_SIN_CODIGO } from "@/lib/marcacion/marcacion";
import MarcacionClient, { type EstadoServidor } from "./MarcacionClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marcación · Fashion Group" };

/**
 * El estado con el que se dibuja la pantalla la primera vez, o `null` si no se
 * pudo armar — y entonces lo pide el navegador, como antes.
 */
async function semillaDeLaPantalla(): Promise<EstadoServidor | null> {
  try {
    const sesion = verifySession((await cookies()).get("cxc_session")?.value);
    if (!sesion) return null; // el layout ya rebotó a quien no entra
    const codigo = await leerEmpleadoCodigo(sesion.userId);
    // 🔑 Sin ficha de colaborador no hay a quién marcarle, y se DICE desde el
    // primer pintado: el mismo texto que contesta la ruta.
    if (!codigo) {
      return { codigo: null, aviso: AVISO_SIN_CODIGO, ahora: new Date().toISOString() };
    }
    return await armarEstadoDeLaPantalla(codigo, await nombreDeLaFicha(codigo));
  } catch (e) {
    console.error("[marcacion page]", e instanceof Error ? e.message : e);
    return null;
  }
}

export default async function Page() {
  return <MarcacionClient inicial={await semillaDeLaPantalla()} />;
}
