"use client";

// Selector CERRADO de cliente. **EL ÚNICO del sistema** contra el directorio
// (`clientes_master`, códigos D-XXX): lo usan Guías, Cheques y los dos
// formularios de Marketing (Registrar gasto y Editar proyecto, los dos SIN la
// salida a mano — ver `permitirOtro` abajo).
//
// Daniel, textual (ago-2026): *"sí, todos deben de tener mismo selector, tiene
// que hacer sentido con el sistema"*. Mismo rótulo, misma búsqueda, misma red
// de seguridad en todas las pantallas; lo único que cambia de una a otra es si
// la salida a mano existe. El candado que impide que aparezca un segundo
// selector vive en `src/__tests__/un-solo-selector-de-cliente.test.ts`.
//
// ⚠️ Los pedidos del catálogo NO usan este selector y no es un descuido: eligen
// clientes de **Switch** (`switch_clientes`, por empresa, con "Contado"), que es
// otro universo — ver `ClienteSwitchPicker`. Y el catálogo PÚBLICO deja que el
// visitante escriba su nombre a mano a propósito (#556).
//
// ── La salida a mano se llama con todas las letras (ago-2026) ───────────────
//
// 🩸 Decía **"Otro"**, y "Otro" se lee como UN CLIENTE MÁS de la lista: alguien
// la tocó sin buscar primero y escribió a mano el nombre de un cliente que SÍ
// estaba en el directorio. Ahora dice **"➕ No está en la lista — escribir a
// mano"**, que es lo que es: la salida, no una opción equivalente.
//
// 🩸 Y ACÁ VIVIÓ UN SELLO **"A mano"** en ámbar, al lado del campo. Murió el
// 26-ago-2026 (*"ese sello también sobra"*): repetía en un chip lo que el campo
// ya decía —el cliente que no está amarrado no tiene código— y en el formulario
// de una guía hacía que el mismo cliente se leyera dos veces. Lo que se fue es
// el CHIP; distinguir un cliente amarrado de uno escrito a mano se sigue
// pudiendo (por el código, y por el `sr-only` para quien no ve la pantalla).
//
// 🔴 Elegir cliente **NO es obligatorio** y esto no lo cambia (decisión escrita
// de Daniel: 272 de los 441 renglones de guía —62%— van a destinos que hoy no
// existen en el directorio). Lo que cambia es que escribir a mano sea
// DELIBERADO en vez de un accidente.
//
// Vivía en `app/guias/components/`. Se movió a `src/components/` en jul-2026,
// cuando Cheques pidió "que el cliente sea como en Guías": el componente ya era
// agnóstico (su API es value/codigo/onChange/topClientes, sin nada de guías), y
// tenerlo bajo una ruta de módulo obligaba a importarlo cruzado — que es lo que
// ya venía haciendo Marketing con su hermano `ClienteTypeahead`.
//
// La diferencia con el typeahead libre de antes (`ClienteTypeahead`, borrado en
// ago-2026 cuando Marketing › Editar proyecto —su último consumidor— pasó a
// este selector) es una sola, y es la que pidió Daniel:
//
//   > "quiero que solo se pueda poner un cliente de la lista … o que haya una
//      opción de otro para texto libre"
//
// Antes, lo que se tecleaba SE GUARDABA solo: escribir "city" y salirse dejaba
// la guía con el cliente "city", sin vínculo al directorio y sin que nadie lo
// decidiera. Acá lo que se teclea es SOLO una búsqueda (estado local `query`);
// el valor de la fila cambia únicamente cuando se elige algo:
//
//   • un cliente de la lista  → queda VINCULADO (guarda su código D-XXX)
//   • "No está en la lista"   → queda a mano, marcado como tal
//
// Cerrar sin elegir no cambia nada: el campo vuelve a mostrar lo que había.
//
// Buscar tecleando sigue siendo el camino rápido: el foco abre la lista, se
// escribe y se toca el resultado. No hay que scrollear 200 nombres.
//
// ── La lista FLOTA: portal a <body> + position fixed (30-jul-2026) ───────────
//
// Daniel, textual: *"no es que se borra, sino que se esconde como en la foto que
// te mande, es problema mas de ux"*. No perdía lo tecleado: dejaba de verlo.
//
// La lista era `absolute` DENTRO de la fila, y la fila vive en un
// `ScrollableTable` (`overflow-x-auto`). `overflow-x: auto` con `overflow-y:
// visible` computa `overflow-y: auto`, así que ese contenedor RECORTA y se
// vuelve scrolleable cuando el contenido lo pasa. Medido en producción a
// 1440×900: cerrado `scrollHeight` 114 == `clientHeight` 114; abierto 397 vs
// 114, o sea **283 px scrolleables** y **76 de los 81 px de la lista
// recortados** (se veía una tirita de 5 px). Al scrollear esos 283 px la fila
// entera se iba de y=612 a y=329 — por debajo del `thead` sticky — y en el
// hueco quedaba un pedazo de la lista, exactamente encima de donde estaban
// DIRECCIÓN / EMPRESA / FACTURA(S). Esa es la foto.
//
// **Subir el z-index no arregla nada**: el recorte de un ancestro con overflow
// no lo gana ningún apilamiento. Mientras la lista sea hija del contenedor que
// recorta, pierde siempre. Por eso sale del flujo con `createPortal` y se ubica
// en coordenadas de viewport con `calcularPosicionDesplegable` (módulo puro).
//
// 📌 Desde el 30-jul-2026 ese mecanismo NO vive acá: el barrido encontró el
// mismo bug en 5 controles más (Cheques ×2, Caja ×2, notificaciones) y se
// extrajo a `components/ui/DesplegableFlotante`. Este archivo lo USA. Si hay
// que tocar cómo flota una lista, se toca allá y se arreglan los seis.
//
// Consecuencias buscadas: abrir la lista **no cambia el layout de la fila** (ni
// una columna se mueve un píxel, medido), el campo con lo tecleado **queda
// siempre a la vista**, y la lista puede ser más ancha que la columna para que
// los nombres largos del directorio no salgan truncados.

import { useEffect, useId, useRef, useState } from "react";
import {
  useBusquedaClientes,
  useClientesDelGrupo,
  type ClienteHit,
} from "@/lib/hooks/useBusquedaClientes";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";
import SugerenciasCliente from "@/components/SugerenciasCliente";
import { nombreParaMostrar } from "@/lib/clientes/nombre-display";

interface ClientePickerProps {
  /** Nombre ya guardado en la fila. */
  value: string;
  /** Código D-XXX ya guardado. "" = escrito a mano. */
  codigo: string;
  /** Se llama SOLO cuando el usuario elige. `codigo` vacío = texto a mano. */
  onChange: (nombre: string, codigo: string) => void;
  /** Clientes más usados, para mostrar sin teclear nada. */
  topClientes?: ClienteHit[];
  /**
   * Mostrar el código D-XXX en verde al lado del campo cuando el cliente quedó
   * amarrado al directorio.
   *
   * Solo tiene sentido donde el código SE GUARDA. En Guías sí
   * (`guia_items.cliente_codigo`). En Cheques NO: la tabla `cheques` guarda el
   * nombre como texto y nada más, así que pintar un "D-126" verde prometería un
   * vínculo que no existe en la base. Ahí se apaga y el campo es, simplemente,
   * el nombre.
   */
  mostrarVinculo?: boolean;
  /**
   * false = SIN la salida a mano: acá el cliente SOLO puede salir de la lista.
   *
   * Lo pidió Daniel para Marketing › Registrar gasto (12-ago-2026), textual:
   * *"donde dice cliente, me deja pasar sin que amarre un cliente de mi lista
   * de fashion group?"*. La regla que fijó: un campo de cliente amarra SIEMPRE
   * al directorio (D-XXX), nunca texto libre. Con esto apagado, el pie de la
   * lista dice el camino — el cliente que falta se da de alta EN SWITCH (los
   * clientes nacen allá; el directorio se sincroniza de ahí).
   *
   * Encendido hoy en Guías (bodega despacha a destinos que no existen en el
   * directorio) y en Cheques. Apagado en los dos formularios de Marketing.
   */
  permitirOtro?: boolean;
  /**
   * El directorio del grupo, para la red de seguridad de abajo. Si no se pasa,
   * el selector lo pide él mismo — al MISMO caché de módulo que su búsqueda, o
   * sea sin una lectura extra.
   *
   * ⚠️ Un arreglo VACÍO significa "no se pudo leer el directorio", y ahí la
   * sugerencia se calla. Por eso `undefined` (no me lo pases) y `[]` (no hay)
   * no son lo mismo.
   */
  clientesDelGrupo?: readonly ClienteHit[];
  /**
   * Decir "no hay ningún cliente parecido" cuando la sugerencia sale vacía.
   * Solo lo enciende la ventana "Atar cliente" — ver `SugerenciasCliente`.
   */
  avisarSinParecidos?: boolean;
  /** Texto del campo vacío. Default: el de siempre ("Buscar cliente…"). */
  placeholder?: string;
  hasError?: boolean;
  inputClassName?: string;
  id?: string;
}

/** Fila del desplegable. 44 px de alto: se toca desde el iPhone. */
function Opcion({
  onElegir,
  children,
  destacada = false,
}: {
  onElegir: () => void;
  children: React.ReactNode;
  destacada?: boolean;
}) {
  return (
    <button
      type="button"
      // onMouseDown (no onClick) para ganarle al onBlur del input.
      onMouseDown={(e) => {
        e.preventDefault();
        onElegir();
      }}
      className={`w-full text-left px-3 min-h-[44px] flex items-center justify-between gap-2 text-sm transition ${
        destacada ? "bg-amber-50/60 hover:bg-amber-100 text-amber-900" : "hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Una fila de cliente del desplegable.
 *
 * El nombre pasa por `nombreParaMostrar`, así que la lista dice EXACTAMENTE lo
 * mismo que el chip de la guía — y lo que se guarda al elegir es ese mismo
 * texto, no la razón social que nadie reconoce.
 */
function OpcionCliente({
  hit,
  onElegir,
}: {
  hit: ClienteHit;
  onElegir: (nombre: string, codigo: string) => void;
}) {
  const nombre = nombreParaMostrar(hit.codigo, hit.nombre) || hit.nombre;
  return (
    <Opcion onElegir={() => onElegir(nombre, hit.codigo)}>
      <span className="truncate">{nombre}</span>
      <span className="text-xs text-gray-400 font-mono shrink-0">{hit.codigo}</span>
    </Opcion>
  );
}

export default function ClientePicker({
  value,
  codigo,
  onChange,
  topClientes,
  mostrarVinculo = true,
  permitirOtro = true,
  clientesDelGrupo,
  avisarSinParecidos = false,
  placeholder: placeholderVacio = "Buscar cliente…",
  hasError = false,
  inputClassName = "",
  id,
}: ClientePickerProps) {
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState("");
  /** El texto para el que ya dijeron "No, es otro". */
  const [descartada, setDescartada] = useState<string | null>(null);
  const idLista = `lista-${useId()}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { hits, cargando } = useBusquedaClientes(query, abierto);

  const vinculado = mostrarVinculo && Boolean(value.trim() && codigo.trim());
  const q = query.trim();

  // ── La red de seguridad ────────────────────────────────────────────────────
  // 🔑 Daniel vio una guía donde alguien escribió a mano el nombre de un cliente
  // que SÍ estaba en la lista. El directorio solo se pide cuando hay algo
  // escrito a mano: una fila vacía no toca la red.
  // ⚠️ Desde el 26-ago-2026 este estado NO dibuja ningún sello: alimenta la red
  // de seguridad y el `sr-only` del final, nada más.
  const escritoAMano = Boolean(value.trim()) && !codigo.trim();
  const directorioPropio = useClientesDelGrupo(escritoAMano && clientesDelGrupo === undefined);
  const directorio = clientesDelGrupo ?? directorioPropio;
  const mostrarSugerencias = escritoAMano && descartada !== value.trim();

  // Ubicar la lista, seguirla al scrollear y cerrarla al tocar afuera es todo
  // de `DesplegableFlotante`. Acá solo queda lo que es de ESTE selector.

  function elegir(nombre: string, cod: string) {
    onChange(nombre, cod);
    setQuery("");
    setAbierto(false);
  }

  // Lo que se ve en el campo: mientras está abierto es la BÚSQUEDA; cerrado, el
  // valor guardado. Por eso cerrar sin elegir no puede ensuciar la fila.
  const textoVisible = abierto ? query : value;
  const listaTop = q.length < 2 ? (topClientes ?? []) : [];

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        value={textoVisible}
        onChange={(e) => {
          setQuery(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => {
          // Arranca con lo que YA dice el campo en vez de vaciarlo: enfocar un
          // cliente puesto y verlo desaparecer es la mitad del "se esconde" que
          // reportó Daniel. Y no ensucia nada — la fila solo cambia en `elegir`.
          setQuery(value);
          setAbierto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && abierto) {
            // La capa de adentro gana: Escape cierra ESTA lista, no el modal que
            // la contiene. Sin esto, en Cheques un Escape para salir del
            // desplegable llegaba también al formulario.
            e.stopPropagation();
            setAbierto(false);
            setQuery("");
          }
          if (e.key === "Enter") {
            e.preventDefault();
            // Enter elige el primer resultado si hay uno; nunca guarda a mano
            // por accidente (para eso está la salida a mano, que hay que tocar).
            const primero = hits[0] ?? listaTop[0];
            if (primero) elegir(primero.nombre, primero.codigo);
          }
        }}
        placeholder={value ? value : placeholderVacio}
        className={`${inputClassName} ${vinculado ? "pr-16" : ""}`}
      />

      {/* 🔴 SOLO SE DIBUJA EL CÓDIGO. El sello ámbar «A mano» se retiró
          (26-ago-2026) — Daniel, textual: *"ese sello también sobra"*.

          🔑 Y NO SE AFLOJÓ NINGÚN CANDADO DE NEGOCIO: la regla es que el campo
          de cliente sea un picker contra `clientes_master` (D-XXX) y no texto
          libre, y eso lo sostienen `permitirOtro` (apagado en Marketing) y el
          rótulo *"No está en la lista — escribir a mano"*, que sigue siendo un
          toque DELIBERADO. El sello no validaba nada: solo repetía en un chip
          lo que el campo ya dice — sin código, no hay código. Quien no ve la
          pantalla lo sigue sabiendo por el `sr-only` de abajo.

          El chip del código SÍ se queda: es la prueba de que la línea está
          amarrada a Switch, y es un dato que el nombre no dice. */}
      {!abierto && vinculado && (
        <span
          className="absolute right-0 top-1/2 -translate-y-1/2 text-xs px-1.5 py-0.5 rounded font-mono text-emerald-700 bg-emerald-50 pointer-events-none"
          title={`Vinculado al directorio (${codigo})`}
        >
          {codigo}
        </span>
      )}

      {/* La lista se dibuja en <body>: NINGÚN ancestro con overflow la puede
          recortar, y al estar fuera del flujo no mueve ni una columna. */}
      <DesplegableFlotante
        abierto={abierto}
        anclaRef={inputRef}
        extraDentroRef={wrapRef}
        onCerrar={() => setAbierto(false)}
        id={idLista}
        marca="cliente"
        className="bg-white border border-gray-200 rounded-md shadow-lg"
      >
        <>
          {q.length >= 2 && cargando && (
            <div className="px-3 py-2 text-xs text-gray-400">Buscando…</div>
          )}

          {q.length >= 2 && !cargando && hits.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">
              {permitirOtro
                ? "No está en el directorio."
                : "No está en el directorio — hay que darlo de alta en Switch."}
            </div>
          )}

          {q.length >= 2 &&
            !cargando &&
            hits.map((h) => (
              <OpcionCliente key={h.codigo} hit={h} onElegir={elegir} />
            ))}

          {listaTop.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-xs uppercase tracking-wide text-gray-400">
                Más usados
              </div>
              {listaTop.map((h) => (
                <OpcionCliente key={h.codigo} hit={h} onElegir={elegir} />
              ))}
            </>
          )}

          {/* La salida de emergencia, SIEMPRE visible y siempre explícita —
              salvo donde el cliente amarra sí o sí (`permitirOtro=false`):
              ahí no hay salida a mano y el pie dice el camino. */}
          <div className="border-t border-gray-100">
            {!permitirOtro ? (
              <div className="px-3 py-2 text-xs text-gray-400">
                Solo clientes de la lista — si no está, hay que darlo de alta
                en Switch.
              </div>
            ) : q ? (
              <Opcion destacada onElegir={() => elegir(q, "")}>
                <span className="min-w-0">
                  <span className="block">➕ No está en la lista — escribir a mano</span>
                  <span className="block text-xs opacity-80 truncate">
                    Se guarda &ldquo;{q}&rdquo;
                  </span>
                </span>
              </Opcion>
            ) : (
              <div className="px-3 py-2 text-xs text-gray-400">
                ¿No está en la lista? Escribe el nombre y elige &ldquo;escribir a
                mano&rdquo;.
              </div>
            )}
          </div>
        </>
      </DesplegableFlotante>

      {/* 🔑 LA RED DE SEGURIDAD. Escribir a mano un nombre que SÍ está en la
          lista es el accidente que Daniel encontró en una guía. Acá se pregunta
          y se ata de un toque. NUNCA ata sola: ver `SugerenciasCliente`. */}
      {mostrarSugerencias && (
        <SugerenciasCliente
          clienteTexto={value}
          clientes={directorio}
          avisarSinParecidos={avisarSinParecidos}
          onDescartar={() => setDescartada(value.trim())}
          onElegir={(nombre, cod) => {
            onChange(nombre, cod);
            setQuery("");
            setAbierto(false);
          }}
        />
      )}

      {/* Solo para que el candado de 44px y los lectores de pantalla vean el
          estado sin abrir nada. */}
      <span className="sr-only">
        {!mostrarVinculo
          ? value.trim() ? `Cliente: ${value}` : "Sin cliente"
          : vinculado
            ? `Vinculado a ${codigo}`
            : escritoAMano
              ? "Cliente escrito a mano"
              : "Sin cliente"}
      </span>
      {hasError ? <span className="sr-only">Campo obligatorio</span> : null}
    </div>
  );
}
