"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import { Toast } from "@/components/ui";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import type { ContadoresDelHub, ContadoresMarca } from "@/lib/catalogo/contadores";
import { textoPulso, type PulsoDelHub, type PulsoMarca } from "@/lib/catalogo/pulso-pedidos";
import { CATALOGO_ADMIN_ROLES, COMPROBANTES_ROLES, catalogoRoles } from "@/lib/catalogo/roles";
import { URL_CATALOGOS_PUBLICOS } from "@/lib/catalogo/url-catalogos-publicos";
import { CATALOGO_ORDEN_CELULAR, clasesBotonesDeLaMarca } from "@/lib/catalogo/orden-celular";

// Catálogos en UNA pantalla: una tarjeta por marca con sus acciones adentro
// (Ver catálogo · Comprobantes · Administrar · Copiar enlace) + contadores en
// vivo (productos a la venta, sin foto). Elimina los pasos intermedios (elegir
// marca → Administrar → elegir marca otra vez).
//
// 🔴 «COMPROBANTES», ACCESO DIRECTO DESDE LA TARJETA (25-ago-2026)
//
// Daniel, textual: *"En el card donde están las marcas. Hay catálogo,
// administrar, debe de estar también pedidos para acceso directo."*
//
// Lleva a la lista ÚNICA de comprobantes del #611 (`/catalogo/<marca>/pedidos`),
// que es la que quedó: el panel de administrar ya redirige ahí. Antes, para
// verla desde el hub había que entrar al catálogo de la marca y buscar el botón
// en la fila del logo — dos toques por una lista que se mira todo el día.
//
// 🔴 EL BOTÓN SE LLAMA «COMPROBANTES» (6-sep-2026). Daniel, textual: *«todo
// Comprobantes, porque ahí también hay cotizaciones y borradores»*. El mismo
// lugar tenía TRES nombres: el botón decía «Pedidos», el título de la pantalla
// «Comprobantes» y el camino de vuelta «← Catálogo». ⚠️ La `key` del módulo y
// de la pestaña sigue siendo `pedidos` —vive en `role_permissions` y en enlaces
// guardados—: se cambia el RÓTULO, nunca la llave (lo mismo que se hizo al
// pasar Cheques a `/recordatorios`).
//
// El destino NO se escribe acá: sale de `theme.pedidosHref`, el mismo campo del
// que ya sale «Ver comprobantes» de la confirmación. Un href a mano en el hub es
// exactamente la deriva que ese campo existe para evitar.
//
// 🔴 «COPIAR ENLACE» (6-sep-2026). Para pasarle el catálogo a un cliente había
// que ENTRAR al catálogo de la marca y buscar «Compartir › Copiar link
// público». Ahora se copia desde la tarjeta. Lo que se copia es
// `theme.publicoShareUrl` **pelado, sin un solo parámetro** — el mismo enlace
// limpio que desde hoy copia el vendedor (ver `CatalogoVendedorPage`).
//
// 🔴 EL CONTADOR DICE LO QUE SE VE AL ENTRAR (6-sep-2026). Contaba las filas de
// `products?active=true` —lo que EXISTE en Switch— mientras el catálogo muestra
// lo VENDIBLE: Reebok decía 232 y adentro salían 182. Daniel: *«no sabía que
// los productos eran los de Switch, no con existencia»*. La regla es la del
// catálogo, importada de `lib/catalogo/a-la-venta` (una sola definición), y el
// rótulo lo dice: «182 productos a la venta».
//
// 🔴 LOS OCHO NÚMEROS LOS SUMA LA BASE (14-sep-2026). Daniel: *«5. ok va»*.
//
// 🩸 Para escribir esas ocho cifras, esta pantalla se bajaba el CATÁLOGO ENTERO
// de las cuatro marcas más el inventario por talla de Reebok: **462,8 KB
// medidos** contra producción (Tommy 227 · Reebok 108 + 50 · Calvin 40 ·
// Joybees 38) y **24.384 ms de p95** en Sentry. Nombre, precio, color,
// descripción y fechas viajaban para tirarse después de contar.
//
// Ahora es UNA petición a `/api/catalogo/contadores`, que responde **menos de
// 200 bytes**. 🔴 La REGLA no se duplicó: el servidor la cuenta con la función
// de la base, cuyo SQL se GENERA desde `lib/catalogo/contadores.ts` cláusula por
// cláusula de `estaALaVenta`; y mientras esa migración no esté aplicada, cuenta
// leyendo las filas con `productosALaVenta`, la misma de siempre.
//
// ⚠️ La pantalla NO cambió: los mismos ocho números, los mismos rótulos, el
// mismo diseño. Lo único que cambió es de dónde salen.
//
// 🔴 EL CONTADOR DICE TARJETAS, NO FILAS (22-sep-2026). El hub decía «81
// productos a la venta» de Joybees y al entrar salían **70 tarjetas**: Joybees
// es la única marca que junta las tallas de un modelo en UNA tarjeta, y hay 11
// modelos con dos filas cada uno (`-KIDS`/`-JUNIOR`, `-M`/`-W`), cada una con
// su inventario y dos pares con precio distinto. Daniel decidió: **el hub dice
// 70**, que es lo que el cliente ve. La tarjeta lee `c.tarjetas`; el rótulo no
// cambió. En las otras tres marcas `tarjetas` es el MISMO número que antes.
//
// 🔴 CADA TARJETA DICE SU PULSO (22-sep-2026). Antes solo contaba productos, y
// **Joybees llevaba 29 días sin un comprobante sin que nada lo dijera**. La
// línea nueva —«14 comprobantes · $79,968.00 · último hace 13 días»— la SUMA LA
// BASE y viaja en la MISMA petición: el texto lo arma `textoPulso`, que es puro
// y no sabe qué hora es. Si el pulso no se pudo leer, la línea no se dibuja: la
// tarjeta nunca se queda sin sus contadores por esto.
//
// 🔴 LOS CUATRO BOTONES ARRANCAN A LA MISMA ALTURA. «TOMMY HILFIGER» ocupa dos
// líneas y las otras tres una, así que su bloque entero bajaba ~36 px y la fila
// de botones quedaba escalonada. El nombre y el bloque de números reservan su
// alto (`sm:min-h-*`) desde que hay dos tarjetas por fila; en el celular, con
// una sola columna, no se reserva nada porque ahí nada se compara.
//
// Los COLORES de cada tarjeta salen del tema de la marca (MARCA_THEME.hub) —
// aquí solo vive la identidad no-visual (nombre, rutas). Agregar una marca =
// agregar una entrada a BRANDS + su tema.
//
// La tarjeta NO lleva bajada ("Calzado deportivo", "Clogs, sandalias y más"):
// describía la marca a gente que trabaja con esa marca todos los días. Lo que sí
// se queda son los contadores, que son los que hacen tocar la tarjeta.

interface Brand {
  key: MarcaUiKey;
  name: string;
  catalogoHref: string;  // "Ver catálogo"
  adminHref: string;     // "Administrar" (CATALOGO_ADMIN_ROLES)
}

const BRANDS: Brand[] = [
  {
    key: "reebok",
    name: "REEBOK",
    catalogoHref: "/catalogo/reebok",
    adminHref: "/catalogos/admin/reebok",
  },
  {
    key: "joybees",
    name: "JOYBEES",
    catalogoHref: "/catalogo/joybees",
    adminHref: "/catalogos/admin/joybees",
  },
  {
    key: "tommy",
    name: "TOMMY HILFIGER",
    catalogoHref: "/catalogo/tommy",
    adminHref: "/catalogos/admin/tommy",
  },
  {
    key: "calvin",
    name: "CALVIN KLEIN",
    catalogoHref: "/catalogo/calvin",
    adminHref: "/catalogos/admin/calvin",
  },
];

export default function CatalogosMarcasPage() {
  const { authChecked, role } = useAuth({
    moduleKey: "catalogos",
    allowedRoles: catalogoRoles(),
  });

  // `undefined` = todavía cargando · `null` = no se pudo · objeto = los números.
  const [counters, setCounters] = useState<ContadoresDelHub | null | undefined>(undefined);
  // El pulso viaja en la MISMA respuesta. Sin él, la línea simplemente no sale.
  const [pulso, setPulso] = useState<PulsoDelHub | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    // UNA petición para las cuatro tarjetas. El servidor decide cómo contarlas
    // (la base o las filas) y acá llega el resultado ya sumado.
    fetch("/api/catalogo/contadores", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((json: { contadores?: ContadoresDelHub; pulso?: PulsoDelHub }) => {
        if (cancelled) return;
        setCounters(json?.contadores ?? null);
        setPulso(json?.pulso ?? null);
      })
      .catch(() => { if (!cancelled) setCounters(null); });
    return () => { cancelled = true; };
  }, [authChecked]);

  if (!authChecked) return null;

  // Quién ve "Administrar": admin y secretaria (CATALOGO_ADMIN_ROLES). El
  // vendedor NO administra (ve el catálogo y sus pedidos) y bodega solo ve el
  // catálogo. El gate de verdad está en el server (requireAdminOSecretaria/requireRole en
  // /api/catalogo/**) — esto solo evita mostrar un botón que terminaría en 403.
  const puedeAdministrar = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(role);

  // Quién ve "Comprobantes": admin, secretaria y vendedor (COMPROBANTES_ROLES).
  // 🔴 BODEGA NO. Ve el catálogo y punto: el feed de la lista
  // (GET /api/catalogo/<marca>/orders) le responde 403, así que el botón lo
  // dejaría frente a una pantalla vacía. Nadie gana un permiso con este botón.
  const puedeVerComprobantes = (COMPROBANTES_ROLES as readonly string[]).includes(role);

  function copiarEnlace(marca: MarcaUiKey) {
    // El enlace PELADO de la marca: sin filtros, sin búsqueda, sin precio. Es
    // la misma regla que el «Copiar link público» del vendedor desde hoy —
    // Daniel: *«quiero que el cliente cuando abra el catálogo por el link se
    // sienta como si fuese el mismo catálogo»*.
    const url = getMarcaTheme(marca)!.publicoShareUrl;
    navigator.clipboard.writeText(url)
      .then(() => setToast("Link copiado"))
      .catch(() => setToast("No se pudo copiar el link"));
  }

  // UN link con los cuatro catálogos (23-sep-2026). Daniel: *«¿dónde veo el
  // link para copiar en el módulo Catálogos?»*. Es el mismo link vivo que la
  // página pública `/catalogo-publico/todos`: nada se congela al copiarlo.
  function copiarLinkDeTodos() {
    navigator.clipboard.writeText(URL_CATALOGOS_PUBLICOS)
      .then(() => setToast("Link de los 4 catálogos copiado"))
      .catch(() => setToast("No se pudo copiar el link"));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Catálogos" breadcrumbs={[{ label: "Marcas" }]} />
      {/* max-w-7xl (6-sep-2026): era `max-w-3xl` (768 px), el más angosto de
          los tres del módulo —el catálogo usa 7xl (1.280) y administrar 5xl
          (1.024)— y el que menos lo necesitaba: en escritorio quedaban cuatro
          tarjetas chicas con media pantalla en blanco. Con las 4 marcas, la
          grilla llega a 4 columnas en `xl` para que la fila se llene en vez de
          estirar cada tarjeta. */}
      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* El h1 VISIBLE decía "Catálogos" justo debajo de la barra que ya dice
            "Catálogos" — en escritorio el breadcrumb ("Catálogos › Marcas") y en
            celular el chip sticky del AppHeader. Es la MISMA repetición que el
            propio AppHeader ya había recortado ("nombre 3×: chip + breadcrumb +
            h1", ver su comentario); acá se termina el trabajo. Se queda como
            sr-only para que la página no pierda su encabezado accesible: podar
            ruido visual no es motivo para dejar un documento sin h1. */}
        <h1 className="sr-only">Catálogos</h1>

        {/* 🔴 EN EL CELULAR ES UNA LÍNEA (24-sep-2026). La caja medía **119 px**
            (del píxel 86 al 205) para un título, una dirección cortada y un
            botón debajo; en una sola línea son **68 px** y REEBOK empieza a
            verse sin deslizar. El título «Link para clientes · los 4 catálogos»
            se va del celular porque la dirección ya lo dice — en la computadora
            se queda tal cual. ⚠️ El botón sigue diciendo «Copiar link» en las
            dos: el rótulo no se toca, lo que se va es el renglón del título. */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <div className={`text-sm font-semibold text-gray-900 ${CATALOGO_ORDEN_CELULAR ? "hidden sm:block" : ""}`}>
              Link para clientes · los 4 catálogos
            </div>
            <div className="truncate font-mono text-xs text-gray-500" data-testid="link-catalogos-todos">{URL_CATALOGOS_PUBLICOS}</div>
          </div>
          <button
            type="button"
            onClick={copiarLinkDeTodos}
            className="min-h-[44px] rounded-md bg-black px-4 text-sm font-semibold text-white active:scale-[0.97]"
          >
            Copiar link
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {BRANDS.map((b) => {
            // Misma regla de siempre para la tarjeta: cargando · no disponible ·
            // los dos números. Una marca que el servidor no pudo contar llega
            // sin entrada y cae en «Contadores no disponibles».
            const c: ContadoresMarca | null | undefined =
              counters === undefined ? undefined : (counters?.[b.key] ?? null);
            const p: PulsoMarca | null = pulso?.[b.key] ?? null;
            // Paleta de la tarjeta desde el tema de la marca (no hardcodear).
            const theme = getMarcaTheme(b.key)!;
            const hub = theme.hub;

            return (
              <div key={b.key} className={`relative overflow-hidden rounded-2xl border p-6 ${hub.card}`}>
                <div className={`absolute top-0 right-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 ${hub.blob}`} />
                <div className="relative">
                  {/* `sm:min-h-[4.5rem]` = dos líneas de `text-3xl`: es lo que
                      mide "TOMMY HILFIGER" y lo que las otras tres reservan
                      para que los botones de las cuatro empiecen igual. */}
                  <h2 className={`text-3xl font-extrabold tracking-tight sm:min-h-[4.5rem] ${hub.name}`}>{b.name}</h2>

                  {/* Contadores + pulso. El bloque reserva sus tres líneas
                      (`sm:min-h-[3.75rem]`) por el mismo motivo que el nombre:
                      el pulso de Tommy ocupa dos renglones y el de Joybees uno. */}
                  <div className={`mt-4 text-sm font-medium tabular-nums sm:min-h-[3.75rem] ${hub.counter}`}>
                    {c === undefined ? (
                      <span className="opacity-50">Cargando…</span>
                    ) : c === null ? (
                      <span className="opacity-50">Contadores no disponibles</span>
                    ) : (
                      <span>
                        {/* 🔴 `tarjetas`, no `aLaVenta`: lo que el cliente VE. */}
                        {c.tarjetas} producto{c.tarjetas === 1 ? "" : "s"} a la venta
                        {c.tarjetasSinFoto > 0 && (
                          <>
                            {" · "}
                            <span className={hub.sinFoto}>
                              {c.tarjetasSinFoto} sin foto
                            </span>
                          </>
                        )}
                      </span>
                    )}
                    {p && (
                      <div className="mt-1 opacity-75">{textoPulso(p)}</div>
                    )}
                  </div>

                  {/* Acciones — iPhone: los links medían 39px de alto (px-4
                      py-2). min-h-[44px] los sube al mínimo táctil de la casa;
                      el ancho ya pasaba. Se repite en las 4 marcas porque el
                      bloque se renderiza por cada BRAND.

                      🔴 CON VARIOS BOTONES LA FILA BAJA DE LÍNEA, NO SE APLASTA.
                      El `flex-wrap` que ya estaba los baja de renglón en vez de
                      comprimir a los otros, y la tarjeta CRECE HACIA ABAJO. Vale
                      igual con el cuarto botón («Copiar enlace») y con la
                      grilla de 4 columnas de `xl`.

                      🔴 EN EL CELULAR SON DOS FILAS PAREJAS DE DOS (24-sep-2026).
                      Medido a 390 px: los cuatro anchos eran **133 · 140 · 127
                      · 105 px** y la fila de abajo terminaba en el píxel 292
                      contra el 332 de la de arriba — **40 px** de borde mocho.
                      Hasta `sm` van en rejilla de dos columnas iguales; de `sm`
                      para arriba manda el `flex-wrap` de siempre. La tarjeta
                      mide lo mismo (287 → 285 px): los cuatro botones YA caían
                      en dos filas, lo que se arregla es el borde. */}
                  <div className={clasesBotonesDeLaMarca()}>
                    <Link
                      href={b.catalogoHref}
                      className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition active:scale-[0.97] ${hub.primaryBtn}`}
                    >
                      Ver catálogo
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </Link>
                    <button
                      type="button"
                      onClick={() => copiarEnlace(b.key)}
                      className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition active:scale-[0.97] ${hub.outlineBtn}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copiar enlace
                    </button>
                    {puedeVerComprobantes && (
                      <Link
                        href={theme.pedidosHref}
                        className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition active:scale-[0.97] ${hub.outlineBtn}`}
                      >
                        Comprobantes
                      </Link>
                    )}
                    {puedeAdministrar && (
                      <Link
                        href={b.adminHref}
                        className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition active:scale-[0.97] ${hub.outlineBtn}`}
                      >
                        Administrar
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* `onDismiss` es lo que lo cierra solo (11-sep-2026): sin él, «Link
          copiado» se quedaba pegado hasta cambiar de pantalla. */}
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
