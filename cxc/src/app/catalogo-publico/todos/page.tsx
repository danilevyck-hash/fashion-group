import type { Metadata } from "next";
import { MARCAS_DEL_HUB } from "@/lib/catalogo/contadores";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";
import { DOMINIO_PUBLICO } from "@/lib/catalogo/metadata-publica";
import { URL_CATALOGOS_PUBLICOS } from "@/lib/catalogo/url-catalogos-publicos";

// ─────────────────────────────────────────────────────────────────────────────
// /catalogo-publico/todos — UN link para el cliente con los CUATRO catálogos
// (23-sep-2026). Daniel: «Créame un link para clientes para poder ver los 4
// catálogos». Sin login (cuelga del prefijo público `/catalogo-publico/`).
//
// · Las marcas salen de `MARCAS_DEL_HUB` (la misma lista del hub interno), y
//   cada tarjeta lleva al `publicoShareUrl` de su tema: no hay una segunda
//   lista de links públicos escrita a mano.
// · «todos» NO es una marca (`getMarcaTheme("todos")` es null), así que esta
//   ruta estática le gana a `[marca]` sin ambigüedad.
// · Es la MISMA información viva de cada catálogo: nada se congela al copiar
//   el link. Lo que Switch cambie (existencia, precio) lo ve el cliente al
//   volver a abrir.
// ─────────────────────────────────────────────────────────────────────────────

const TITULO = "Catálogos Fashion Group";
const DESCRIPCION = "Reebok · Joybees · Tommy Hilfiger · Calvin Klein — Fashion Group Panamá.";

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRIPCION,
  openGraph: {
    title: TITULO,
    description: DESCRIPCION,
    url: URL_CATALOGOS_PUBLICOS,
    siteName: "Fashion Group",
    locale: "es_PA",
    type: "website",
    images: [{ url: `${DOMINIO_PUBLICO}/logo.jpeg`, alt: TITULO }],
  },
  twitter: { card: "summary", title: TITULO, description: DESCRIPCION, images: [`${DOMINIO_PUBLICO}/logo.jpeg`] },
};

export default function CatalogosPublicosPage() {
  const marcas = MARCAS_DEL_HUB.map((m) => getMarcaTheme(m)).filter(
    (t): t is NonNullable<typeof t> => t !== null,
  );

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        <header className="mb-6 text-center">
          <h1 className="text-xl font-bold text-gray-900">Catálogos</h1>
          <p className="mt-1 text-sm text-gray-500">Fashion Group Panamá · elige una marca</p>
        </header>

        <ul className="space-y-3" aria-label="Catálogos por marca">
          {marcas.map((theme) => (
            <li key={theme.marca}>
              <a
                href={theme.publicoShareUrl}
                className={`flex min-h-[88px] items-center justify-between rounded-2xl border px-5 py-4 active:scale-[0.98] transition-transform ${theme.hub.card}`}
                aria-label={`Ver catálogo ${theme.label}`}
              >
                <span className="flex items-center">{theme.logos.pedidoPublico()}</span>
                <span className={`text-sm font-semibold ${theme.hub.name}`}>Ver catálogo ›</span>
              </a>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-center text-xs text-gray-400">
          Precios y existencias al día. Vuelve a abrir el link para ver lo último.
        </p>
      </div>
    </main>
  );
}
