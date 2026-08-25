"use client";

// Filtros del catálogo (búsqueda + chips + precio + orden), parametrizados por
// MARCA_THEME: opciones de género/categoría y clases vienen del tema, y el
// chip "2 bultos o más" + los campos de precio son feature (filtroBultos /
// filtroPrecio — ver lib/catalogo/filtros-extra).
//
// ── 💵 EL PRECIO SE ESCRIBE, YA NO SE ELIGE DE UN DESPLEGABLE (23-ago-2026) ──
//
// Daniel, textual: *"quita el dropdown del filtro de precio en los catalogos y
// pon opcion de filtro exacto"*, y sobre el segundo campo: *"me gusto el
// segundo campo de hasta, pero para facilidad del usuario siempre usara precio
// exacto, asi que el hasta automaticamente se ponga el precio que puso el
// usuario de desde para no hacer doble trabajo"*.
//
// De ahí sale el ESPEJO, que es el corazón de este control: hay dos campos
// («desde» y «hasta») pero se escribe UNO solo. Mientras nadie haya tocado
// «hasta» a mano, cada tecla de «desde» se copia ahí, y el filtro queda en
// precio EXACTO sin trabajo extra. Tocar «hasta» apaga el espejo (ahí la
// persona SÍ quiere un rango) y vaciarlo lo vuelve a encender.
//
// ── 🔴 LA FILA DE BOTONES DE PRECIO SE FUE. EL AVISO SE QUEDA (24-ago-2026) ──
//
// El 23-ago se había pintado, debajo de los campos, un botón por cada precio
// del catálogo (16 a la vista + "Ver los 41 precios" en Tommy). Daniel lo vio y
// lo retiró, textual: *"sí, pero no quiero botones de precios, solo escribirlo
// y ya, me explico?"*, y sobre cuántos precios mostrar en Tommy: *"ninguno"*.
// Así que acá quedan SOLO los dos campos donde se escribe.
//
// ⚠️ PERO EL AVISO DE "ESE PRECIO NO EXISTE" NO ES LA FILA DE BOTONES, Y SE
// QUEDA. Son dos cosas distintas y solo una la retiró Daniel:
//   · la fila de botones era permanente y ocupaba media pantalla de iPhone
//     antes del primer producto → se fue entera;
//   · el aviso es UNA línea de texto que aparece SOLO cuando el precio escrito
//     no existe en el catálogo → se queda.
// Sin él la pantalla parece rota: MEDIDO contra producción el 23-ago-2026,
// Tommy tiene $17.50 pero NO tiene $17, así que quien escribe "17" ve cero
// productos sin ninguna explicación. El aviso lo dice en español simple y
// ofrece la salida ("En este catálogo no hay nada a $17. Lo más cercano: $16 o
// $17.50."). Los precios reales que necesita salen de los productos que la
// pantalla YA tiene en memoria — ninguna consulta nueva, y el precio lo sigue
// mandando Switch.
//
// ── LOS CHIPS «OFERTA / NUEVO / PRÓXIMAMENTE» SE FUERON (14-ago-2026) ──
//
// Daniel, textual: *"eliminas filtros de reebok desde la raíz los de
// oferta/nuevo/proximamente"*. Medido contra producción: la columna `badge`
// está VACÍA en los 944 productos de las 4 marcas (products 284 · joybees 83 ·
// tommy 497 · calvin 80, las 944 en NULL), o sea que los 3 chips nunca
// devolvieron un solo resultado desde que existen. Se fue el chip, el
// filtrado, el tipo `SaleFilter`, el desplegable de celular y la bandera
// `features.saleFilter` que los encendía.
//
// ⚠️ La COLUMNA `badge` NO se borra, y el admin la sigue pudiendo escribir
// (`ProductosTarjetas` / `ProductosBatch` / `photoUpload.updateProductBadge`).
// De ella cuelga la PREVENTA (`is_preorder = badge === "proximamente"`), que
// es una función de negocio: ver el comentario en CatalogoVendedorPage.
//
// ── 📱 EN CELULAR Y iPAD LOS FILTROS SON DESPLEGABLES, NO UNA FILA QUE SE ARRASTRA ──
//
// Daniel, textual (30-jul-2026): *"en todo lo del iphone donde haya data como
// los filtros en los catalogos y hay que hacer scroll, mejor arreglarlo de otra
// manera, un drop down"*. Y después, viendo que a 834 px seguía arrastrándose:
// *"si, hazlo en ipad tambien"*.
//
// La fila de píldoras es un `overflow-x-auto`. Medido en el navegador con build
// y datos de producción, catálogo interno / público:
//
//   a 390 px (iPhone)          a 834 px (iPad vertical)
//   Tommy ..... 779 / 813 px    Tommy ..... 559 / 369 px
//   Reebok .... 642 / 674 px    Reebok .... 422 / 230 px
//   Joybees ... 138 / 158 px    Joybees ....... 0 /   0 px
//
// O sea: en Tommy, DIEZ opciones de filtro solo existían para quien adivinara
// que la fila se arrastra de costado. Este repo ya había pagado ese peaje una
// vez — el chip "2 bultos o más" se movió al principio de la fila el 26-jul
// justamente porque *"un filtro que no se ve no existe"*. Moverlo de lugar
// arreglaba UN chip; esto arregla la fila entera.
//
// La forma: **hasta `lg` (1024 px), un desplegable por grupo** — Género,
// Categoría, Estado — en una fila que ENVUELVE (`flex-wrap`), así que el
// arrastre horizontal es 0 px por construcción, no por que los chips hayan
// entrado justo. Cada disparador dice de qué filtro es Y qué está elegido
// ("Género: Women"), que es lo que la fila de píldoras no podía mostrar sin
// que uno la recorriera entera.
//
// ── 🖥️ Y DE `lg` PARA ARRIBA LA FILA DE PÍLDORAS TAMBIÉN ENVUELVE ────────────
//
// Daniel, tercer pedido: *"y si, hazlo en ipad horizontal tambien"*. A 1024 px
// (iPad horizontal) volvían las píldoras y volvía el arrastre.
//
// **Había dos salidas y las dos se midieron. La obvia PIERDE:**
//
//   1. Correr el corte a `xl` (1280). **Ni siquiera llega a 0** — medido, a
//      1280 px Tommy interno arrastra 113 px y a 1366 arrastra 27: ahí las
//      píldoras vuelven y vuelve el problema. Encima metería el desplegable en
//      laptops de 1280 lógicos, que Daniel no pidió cambiar.
//   2. Dejar el corte donde está y hacer que las píldoras ENTREN: `flex-wrap`.
//      Da 0 px **en TODOS los anchos**, incluidos los dos de laptop que la
//      salida 1 no arreglaba.
//
// Gana la 2 por número, no por gusto. **A 1440 no cambia nada y eso está
// medido, no supuesto**: ahí las píldoras ya entraban en una sola línea en las
// 3 marcas y las 2 vistas (0 px de arrastre, alto de la zona 163 px antes y
// después), y `flex-wrap` no mueve lo que ya cabe.
//
// El panel es `<DesplegableFlotante>` (portal a <body> + `position: fixed`), que
// es EL desplegable de la casa — un panel `absolute` acá lo recortaría el primer
// ancestro con overflow, y hay un candado (`__tests__/desplegables-flotan`) que
// pone el build rojo si alguien escribe uno nuevo.

import { useRef, useState } from "react";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import {
  BULTOS_CHIP_LABEL, PRECIO_VACIO, mensajeFiltroPrecio,
  type FiltroPrecio,
} from "@/lib/catalogo/filtros-extra";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";
import { grupoTieneOpciones, type OpcionFiltro } from "@/lib/catalogo/filtros-derivados";

interface FiltroDesplegableProps {
  /** Nombre del grupo, tal cual se lee en el botón: "Género", "Categoría"… */
  etiqueta: string;
  valor: string;
  opciones: { value: string; label: string }[];
  onChange: (v: string) => void;
  /** Clases del tema de la marca para el estado encendido/apagado. */
  chipActive: string;
  chipInactive: string;
}

/**
 * Un grupo de filtros del catálogo, en celular: botón + lista flotante.
 *
 * El botón muestra "<Etiqueta>: <elegido>" y se pinta como chip encendido
 * cuando hay algo elegido, así que el estado se lee sin abrirlo. La lista vive
 * en `<DesplegableFlotante>`: **cuando está cerrada no existe en el DOM**, que
 * es lo que hace que duplicar el control (píldoras en escritorio + desplegable
 * en celular) no duplique opciones ni etiquetas para nadie.
 */
/**
 * Desplegable de un filtro. Se EXPORTA para que la pantalla de administrar use
 * exactamente el mismo control que el catálogo público: son la misma pregunta
 * ("¿de qué género?", "¿de qué categoría?") y dos implementaciones distintas
 * terminarían dando dos listas de opciones distintas.
 */
export function FiltroDesplegable({
  etiqueta, valor, opciones, onChange, chipActive, chipInactive,
}: FiltroDesplegableProps) {
  const [abierto, setAbierto] = useState(false);
  const anclaRef = useRef<HTMLButtonElement>(null);
  const elegida = opciones.find(o => o.value === valor);
  const activo = !!valor;

  return (
    <>
      <button
        ref={anclaRef}
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[44px] ${
          activo ? chipActive : chipInactive
        }`}
      >
        <span>{etiqueta}: {elegida?.label ?? opciones[0]?.label ?? "Todos"}</span>
        <svg className="w-3 h-3 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <DesplegableFlotante
        abierto={abierto}
        anclaRef={anclaRef}
        onCerrar={() => setAbierto(false)}
        marca={`catalogo-filtro-${etiqueta.toLowerCase()}`}
        role="listbox"
        aria-label={etiqueta}
        anchoMinimo={200}
        className="bg-white rounded-xl border border-black/10 shadow-lg py-1"
      >
        {opciones.map(o => (
          <button
            key={o.value || "todos"}
            type="button"
            role="option"
            aria-selected={o.value === valor}
            onClick={() => { onChange(o.value); setAbierto(false); }}
            className={`w-full min-h-[44px] px-4 flex items-center justify-between gap-2 text-left text-sm transition hover:bg-black/5 ${
              o.value === valor ? "font-semibold" : "text-gray-700"
            }`}
          >
            <span>{o.label}</span>
            {o.value === valor && (
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </DesplegableFlotante>
    </>
  );
}

interface FiltroPrecioExactoProps {
  precio: FiltroPrecio;
  onChange: (precio: FiltroPrecio) => void;
  /**
   * Precios que existen en el catálogo, de menor a mayor y sin repetir.
   *
   * ⚠️ Ya NO se pintan: desde el 24-ago-2026 no hay fila de botones de precio.
   * Entran solo para que el aviso pueda decir cuál es el precio real más
   * cercano al que se escribió — sin ellos el aviso no tendría qué ofrecer.
   */
  precios: number[];
  chipLabel: string;
  chipInactive: string;
}

/**
 * Filtro de precio: DOS campos, pero el caso normal es escribir UNO.
 *
 * 🔴 EL ESPEJO. `espejo` arranca encendido y copia «desde» en «hasta» en cada
 * tecla, así que escribir 25 filtra el precio EXACTO 25 sin tocar el segundo
 * campo — que es lo que pidió Daniel para no hacer doble trabajo. Se apaga en
 * cuanto alguien escribe algo en «hasta» (ahí quiere un rango de verdad) y se
 * vuelve a encender al vaciarlo. El estado del espejo vive ACÁ y no en la URL:
 * es una intención de tecleo, no un filtro — lo que se comparte por link son
 * los dos números, que es lo que el otro necesita para ver lo mismo.
 *
 * Los campos son `type="text"` a propósito: `type="number"` descarta `$30` y
 * `30,00` sin decir por qué, y esos son los dos formatos que de verdad se
 * teclean. `inputMode="decimal"` igual saca el teclado numérico en el celular,
 * y `parsePrecio` limpia el resto.
 */
export function FiltroPrecioExacto({
  precio, onChange, precios, chipLabel, chipInactive,
}: FiltroPrecioExactoProps) {
  // Si el filtro llega con «hasta» escrito (un link compartido con rango), el
  // espejo nace apagado: copiarle encima el «desde» le rompería el link a quien
  // lo abrió.
  const [espejo, setEspejo] = useState(() => !precio.hasta.trim());

  // `placeholder:text-black/25`: con el color del chip, el "17.50" de ejemplo se
  // leía como un precio YA puesto y hacía dudar de si el filtro estaba activo.
  const campo = `${chipInactive} w-24 min-h-[44px] rounded-lg px-3 text-sm tabular-nums outline-none transition placeholder:text-black/25`;
  const suave = "text-xs text-black/50";

  function cambiarDesde(v: string) {
    onChange({ desde: v, hasta: espejo ? v : precio.hasta });
  }

  function cambiarHasta(v: string) {
    // Vaciar «hasta» reactiva el espejo: es la forma de volver al precio exacto
    // sin tener que adivinar que hay que reescribir el «desde».
    setEspejo(v.trim() === "");
    onChange({ desde: precio.desde, hasta: v });
  }

  function quitar() {
    setEspejo(true);
    onChange(PRECIO_VACIO);
  }

  const hayAlgo = !!(precio.desde.trim() || precio.hasta.trim());
  // 🔴 Los precios reales NO se pintan (Daniel, 24-ago-2026: *"no quiero
  // botones de precios, solo escribirlo y ya"*). Se usan para UNA sola cosa:
  // que el aviso de abajo pueda decir el precio más cercano al escrito.
  const aviso = mensajeFiltroPrecio(precio.desde, precio.hasta, precios);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={chipLabel}>Precio</span>
        <label className="flex items-center gap-1.5">
          <span className={suave}>desde</span>
          <input
            value={precio.desde}
            onChange={e => cambiarDesde(e.target.value)}
            inputMode="decimal"
            type="text"
            placeholder="17.50"
            aria-label="Precio desde"
            className={campo}
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className={suave}>hasta</span>
          <input
            value={precio.hasta}
            onChange={e => cambiarHasta(e.target.value)}
            inputMode="decimal"
            type="text"
            placeholder="17.50"
            aria-label="Precio hasta"
            className={campo}
          />
        </label>
        {hayAlgo && (
          <button
            type="button"
            onClick={quitar}
            className={`${chipInactive} min-h-[44px] px-3 rounded-full text-xs font-medium transition whitespace-nowrap`}
          >
            Quitar precio
          </button>
        )}
      </div>

      {/* Se podó "Escribe un precio y ves solo ese. El «hasta» se llena solo."
          (25-ago-2026, aprobado por Daniel): los dos campos ya dicen "desde" y
          "hasta" con su placeholder, y el autorrelleno se ve al escribir. Lo
          que SÍ se queda es el aviso de abajo (`aviso`), que aparece solo
          cuando el precio escrito no existe — ése informa, no describe.
          Candado: poda-textos-cxc-multifashion.test.ts. */}

      {/* 🔴 ACÁ NO VA UNA FILA DE BOTONES DE PRECIO. Estuvo del 23 al 24-ago-2026
          y Daniel la retiró: *"no quiero botones de precios, solo escribirlo y
          ya"* — y sobre cuántos mostrar en Tommy, *"ninguno"*. Lo único que se
          pinta debajo de los campos es el aviso de acá abajo, y solo cuando el
          precio escrito no existe. */}
      {aviso && (
        <p role="status" className="text-xs text-amber-700">
          {aviso}
        </p>
      )}
    </div>
  );
}

interface CatalogoFiltersProps {
  marca: MarcaUiKey;
  searchInput: string;
  onSearchChange: (v: string) => void;
  gender: string;
  onGenderChange: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  bultosFilter?: boolean;
  onBultosFilterChange?: (v: boolean) => void;
  /** Los dos campos de precio, tal cual los escribió la persona. */
  precio?: FiltroPrecio;
  /** Se llama con los DOS campos a la vez: el espejo cambia los dos juntos. */
  onPrecioChange?: (precio: FiltroPrecio) => void;
  /** Precios que EXISTEN en este catálogo, ya derivados de los productos que
   *  la pantalla tiene en memoria (`preciosDelCatalogo`). Nunca una consulta. */
  preciosDisponibles?: number[];
  sortBy: string;
  onSortByChange: (v: string) => void;
  filteredCount: number;
  onClearAll: () => void;
  /** Opciones YA derivadas de los productos (ver lib/catalogo/filtros-derivados).
   *  Sin ellas se usan las de `MARCA_THEME` tal cual — que es también el
   *  fail-open: quien no las calcule ve exactamente lo de antes. */
  genderOptions?: OpcionFiltro[];
  categoryOptions?: OpcionFiltro[];
}

export default function CatalogoFilters({
  marca,
  searchInput, onSearchChange,
  gender, onGenderChange,
  category, onCategoryChange,
  bultosFilter = false, onBultosFilterChange,
  precio = PRECIO_VACIO, onPrecioChange, preciosDisponibles = [],
  sortBy, onSortByChange,
  filteredCount, onClearAll,
  genderOptions, categoryOptions,
}: CatalogoFiltersProps) {
  const theme = getMarcaTheme(marca)!;
  const f = theme.filtros;
  // Las píldoras se DERIVAN de los productos: una opción sin ni un producto
  // detrás no se dibuja, y vuelve sola el día que entre el primero (Daniel,
  // 12-ago-2026 — "veo filtro de boots, pero no veo ninguna con boots").
  const generoOpts = genderOptions ?? f.genderOptions;
  const categoriaOpts = categoryOptions ?? f.categoryOptions;
  const conGenero = grupoTieneOpciones(generoOpts);
  const conCategorias = theme.features.categoryChips && grupoTieneOpciones(categoriaOpts);
  const conBultos = theme.features.filtroBultos && !!onBultosFilterChange;
  const conPrecio = theme.features.filtroPrecio && !!onPrecioChange;

  const hasActiveFilters = !!(
    searchInput || gender || category ||
    (conBultos && bultosFilter) ||
    (conPrecio && (precio.desde.trim() || precio.hasta.trim()))
  );

  return (
    <div className="space-y-3 mb-6">
      {/* Search bar */}
      <div className="relative">
        <svg className={f.searchIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={searchInput}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={f.searchPlaceholder}
          className={f.searchInput}
        />
        {searchInput && (
          <button
            onClick={() => onSearchChange("")}
            className={f.searchClear}
            aria-label="Limpiar búsqueda"
          >
            &times;
          </button>
        )}
      </div>

      {/* ── CELULAR Y iPAD (hasta lg): un desplegable por grupo, fila que ENVUELVE ──
          Es la misma información que la fila de píldoras de al lado, pero sin
          arrastre horizontal: `flex-wrap` la baja de renglón en vez de esconder
          lo que no entra. Medido: 813 px de arrastre a 390 → 0, y 559 px a
          834 (iPad vertical) → 0. */}
      <div className="flex lg:hidden flex-wrap items-center gap-2">
        {conBultos && (
          <button
            onClick={() => onBultosFilterChange!(!bultosFilter)}
            aria-pressed={bultosFilter}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[44px] ${
              bultosFilter ? f.chipActive : f.chipInactive
            }`}
          >
            {BULTOS_CHIP_LABEL}
          </button>
        )}

        {conGenero && (
          <FiltroDesplegable
            etiqueta="Género"
            valor={gender}
            opciones={generoOpts}
            onChange={onGenderChange}
            chipActive={f.chipActive}
            chipInactive={f.chipInactive}
          />
        )}

        {conCategorias && (
          <FiltroDesplegable
            etiqueta="Categoría"
            valor={category}
            opciones={categoriaOpts}
            onChange={onCategoryChange}
            chipActive={f.chipActive}
            chipInactive={f.chipInactive}
          />
        )}

      </div>

      {/* ── iPAD HORIZONTAL Y ESCRITORIO (lg+): la fila de píldoras, que ENVUELVE ──
          `flex-wrap` sin tope: lo que no entra baja de renglón en vez de
          esconderse a la derecha. **A 1440 no cambia NADA** — ahí las píldoras
          ya entraban en una línea (0 px de arrastre, medido en las 3 marcas y
          las 2 vistas), y `flex-wrap` no mueve nada que ya quepa.
          El corte NO se movió a `xl` a propósito: ver el porqué arriba.
          `overflow-x-auto` se queda como última red por si un grupo suelto
          fuera más ancho que la pantalla entera. */}
      <div className="hidden lg:flex flex-wrap items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
        {conBultos && (
          <>
            {/* Chip "2 bultos o más" (feature filtroBultos) — PRIMERO de la fila
                (Daniel, 26-jul-2026): al final quedaba detrás del Género y de
                las 7 categorías, y en móvil había que arrastrar la fila para
                encontrarlo. "Un filtro que no se ve no existe" — y este corta
                123 de 490 productos en Tommy, no es decorativo.
                Dice la REGLA y no un juicio de valor sobre el inventario: la
                card no muestra Disponibilidad ni Existencia, así que el cliente
                no tendría cómo saber por qué desaparecieron productos. "Bulto"
                ya es vocabulario de la card. Umbral: 2 bultos COMPLETOS
                (Tommy = 24 pzas). */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => onBultosFilterChange!(!bultosFilter)}
                aria-pressed={bultosFilter}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[44px] ${
                  bultosFilter ? f.chipActive : f.chipInactive
                }`}
              >
                {BULTOS_CHIP_LABEL}
              </button>
            </div>

            <div className={f.divider} />
          </>
        )}

        {/* Gender chips */}
        {conGenero && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={f.chipLabel}>Género</span>
          {generoOpts.map(opt => (
            <button
              key={opt.value}
              onClick={() => onGenderChange(gender === opt.value ? "" : opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[44px] ${
                gender === opt.value ? f.chipActive : f.chipInactive
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        )}

        {conCategorias && (
          <>
            <div className={f.divider} />

            {/* Category chips */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={f.chipLabel}>Categoría</span>
              {categoriaOpts.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => onCategoryChange(category === opt.value ? "" : opt.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[44px] ${
                    category === opt.value ? f.chipActive : f.chipInactive
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

      </div>

      {/* ── PRECIO: dos campos, pero se escribe uno solo (ver cabecera) ──
          Va en su propia franja y no metido en la fila de orden: son DOS campos
          más una lista de precios reales, y apretados contra el select de orden
          la fila no entraba en un iPhone. */}
      {conPrecio && (
        <FiltroPrecioExacto
          precio={precio}
          onChange={onPrecioChange!}
          precios={preciosDisponibles}
          chipLabel={f.chipLabel}
          chipInactive={f.chipInactive}
        />
      )}

      {/* Sort + count + clear.
          `flex-wrap` en las dos filas: se queda aunque el select de precio se
          haya ido a su propia franja (23-ago-2026). Nació porque con DOS selects
          la fila medía 404px contra 358 de ancho útil a 390px y la PÁGINA entera
          se iba en scroll horizontal; sacarlo ahora sería confiar en que
          "Limpiar filtros" + orden + conteo siempre entren, y no cuesta nada. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button onClick={onClearAll} className={f.clearAll}>
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
          <select
            value={sortBy}
            onChange={e => onSortByChange(e.target.value)}
            className={f.sortSelect}
          >
            <option value="relevancia">Ordenar: Relevancia</option>
            <option value="precio-asc">Precio: menor a mayor</option>
            <option value="precio-desc">Precio: mayor a menor</option>
            <option value="nombre-az">Nombre A-Z</option>
          </select>
          {/* El número suelto ("490") no le decía NADA al cliente: quedaba
              pegado al select de orden como si fuera parte de él. Con la
              palabra al lado se lee solo. */}
          <span className={f.count}>
            {filteredCount} {filteredCount === 1 ? "producto" : "productos"}
          </span>
        </div>
      </div>
    </div>
  );
}
