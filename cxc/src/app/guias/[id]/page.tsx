"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA PÁGINA DE UNA GUÍA. Acá se termina de despachar.
//
// 🩸 POR QUÉ EXISTE. En la lista, abrir una guía pendiente desplegaba el
// formulario de despacho ENTERO dentro de la fila —y arriba, en la misma
// tarjeta, un botón "Editar"—. Dos caminos para lo mismo. Daniel, textual:
// *"solo quiero una y en boton de editar para entrar a la guia y terminarla"*.
// Ahora la fila solo muestra la guía; el botón trae acá, y acá se termina.
//
// La lista NO perdió nada: los envíos, el chip del cliente, "Imprimir" y el
// menú "···" siguen en su acordeón, igual que antes. Lo único que salió de ahí
// es el formulario.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «EDITAR» ABRE EL MISMO FORMULARIO CON EL QUE SE CREÓ LA GUÍA (23-ago-2026)
//
// Daniel, textual: *"veo algo raro en guias, al editar una, tengo que poner
// despachar para editar en vez de editar, quiero botón de editar y que se me
// abra la guía para editar así mismo como si estuviese haciendo la guía, no
// algo diferente"*.
//
// 🩸 Lo que pasaba: para corregir una guía pendiente había que entrar por
// «Despachar» y, desde acá, tocar *"Cambiar los envíos de esta guía"* — o sea
// un nivel MÁS adentro, y a una pantalla distinta de la del alta.
//
// Ahora el botón dice **«Editar»** y el formulario se abre **acá mismo**, sin
// cambiar de URL: es literalmente el `GuiaForm` de `/guias/nueva`, con la
// fecha, el modo, el transportista, quién despacha, los envíos (agregar y
// quitar incluidos) y las observaciones editables. Y **«Despachar» sigue en
// ESTA misma pantalla**, debajo: se corrige y se despacha sin irse a ningún
// lado.
//
// ⚠️ LO QUE NO CAMBIÓ, a propósito:
//   · **Una guía Completada/Rechazada NO se edita.** No hay botón «Editar», y
//     la pantalla lo DICE. El candado del PUT no se tocó; las dos excepciones
//     de siempre (atar cliente · anotar el N° del transportista) siguen igual.
//   · **Una sola puerta para despachar.** La lista sigue sin despachar (ni por
//     swipe ni por formulario) y sigue teniendo UN SOLO botón por fila, que en
//     las pendientes se llama «Despachar».
//   · **Mientras se edita, la lista de envíos es UNA SOLA**: la del formulario.
//     El resumen de solo lectura y su "Corregir" no se dibujan al mismo tiempo
//     — eso serían los mismos envíos dos veces en la misma pantalla, que es lo
//     que se sacó el 17-ago-2026.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast } from "@/components/ui";
import DespachoForm from "../components/DespachoForm";
import EdicionGuia from "../components/EdicionGuia";
import ListaEnvios from "../components/ListaEnvios";
import { useDespachoGuia } from "../components/useDespachoGuia";
import { fmtDate, fmtGuia } from "@/lib/format";
import {
  ETIQUETA_TIPO_DESPACHO,
  esEntregaDirecta,
  guiaSinNumeroTransp,
  sinCeroPelado,
  tipoDespachoEfectivo,
} from "@/lib/guias/modo-despacho";
import { abrirEnEdicion, urlDeLaGuia } from "@/lib/guias/abrir-en-edicion";
import { textoFaltantesDespachada } from "@/lib/guias/faltantes-despacho";
// ⚠️ `papel-de-la-guia` arrastra jsPDF (~148 kB) y se pide con `await import`,
// nunca de arriba: estático acá la carga inicial de esta pantalla pasaba de 204
// kB a 351 kB, y es la que bodega abre desde el celular. Se PRECARGA al montar
// (ver `useEffect` más abajo) para que el toque no tenga que esperar red.

/**
 * `useLayoutEffect` en el navegador, `useEffect` en el servidor.
 *
 * ⚠️ React avisa por consola si un `useLayoutEffect` corre en el servidor (allá
 * no hace nada). El valor se decide UNA vez por entorno, así que el orden de
 * los hooks no cambia entre dibujos — que es lo único que la regla de hooks
 * pide.
 */
const useLayoutEffectSeguro = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Los mismos que ya podían despachar desde la lista. Vendedor mira, no toca. */
const DESPACHO_ROLES = ["admin", "secretaria", "bodega"];

/**
 * Quiénes pueden abrir «Editar». Es EXACTAMENTE el mismo conjunto que ya
 * decidía si la fila de la lista mostraba el botón (`canEdit` en `GuiasList`):
 * este cambio mueve el formulario de lugar, no reparte permisos nuevos.
 * Vendedor sigue mirando sin tocar, como dice el cuadro de roles.
 */
const EDICION_ROLES = DESPACHO_ROLES;

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <span className="text-xs uppercase tracking-wide text-gray-400 block">{etiqueta}</span>
      <span className="text-sm font-medium break-words">{valor || "—"}</span>
    </div>
  );
}

export default function GuiaPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const { authChecked, role } = useAuth({
    moduleKey: "guias",
    allowedRoles: ["admin", "secretaria", "bodega", "vendedor"],
  });

  // 🔴 Hooks ANTES de cualquier return condicional (regla de React).
  const s = useDespachoGuia(authChecked ? id : null);

  /**
   * ¿La edición está abierta? Se abre con el botón «Editar» y se cierra al
   * guardar o al cancelar — **sin cambiar de pantalla**. Quién la enciende al
   * llegar con `?editar=1`, y por qué antes de pintar, está en el efecto de
   * abajo.
   */
  const [editando, setEditando] = useState(false);

  /**
   * 🔴 ¿LA GUÍA SE ABRE CON EL FORMULARIO YA ABIERTO? — **ANTES DE PINTAR**.
   *
   * 🩸 EL PARPADEO. Esto era un `useEffect`, que corre **después** de que el
   * navegador pintó: tocar «Editar» dibujaba la guía entera en modo LECTURA
   * —datos, envíos, bloque de despacho— y recién en el cuadro siguiente la
   * reemplazaba por el formulario. Medido con capturas en secuencia: a los 100
   * ms se veía la pantalla equivocada.
   *
   * 🔑 `useLayoutEffect` corre **antes del pintado**, así que el modo queda
   * bien sin que se llegue a ver el otro. Es UNA sola pieza a propósito: hubo
   * una versión con un inicializador perezoso de `useState` ADEMÁS de esto, y
   * **la mutación que lo sacaba sobrevivía** — dos mecanismos para lo mismo
   * hacen que ninguno de los dos se pueda probar.
   *
   * 🩸 Y NO ALCANZA CON LEER LA URL EN EL PRIMER DIBUJO: medido en el
   * navegador, entrando por «Editar» desde la lista `router.push` actualiza
   * `window.location` y renderiza la ruta nueva **sin garantizar el orden**, y
   * lo que se leía era la dirección VIEJA (`/guias`). La pantalla aterrizaba en
   * LECTURA y había que tocar «Editar» otra vez. Un efecto de montaje lee la
   * dirección cuando ya está donde tiene que estar.
   *
   * ⚠️ Solo ENCIENDE, nunca apaga. Cerrar la edición limpia la dirección
   * (`cambiarModo`), así que esto no puede reabrir lo que la persona acaba de
   * cerrar; y si apagara, pisaría el «Editar» de esta misma pantalla, que no
   * toca la URL hasta después.
   *
   * ⚠️ Se lee de `window.location` y no con `useSearchParams` por lo mismo que
   * en `/guias`: ese hook obliga a envolver la página en un `<Suspense>` para
   * poder compilarla.
   */
  useLayoutEffectSeguro(() => {
    if (abrirEnEdicion(window.location.search)) setEditando(true);
    // Solo al montar: la dirección ya está donde tiene que estar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 🩸 Y LA DIRECCIÓN DICE LO QUE SE ESTÁ VIENDO. Al cerrar la edición la URL
   * seguía diciendo `?editar=1`: recargar, compartir el enlace o darle "atrás"
   * volvía a abrir el formulario que la persona acababa de cerrar.
   *
   * `replace` y no `push`: con `push`, el "atrás" del navegador reabriría el
   * formulario en vez de sacar de la guía.
   */
  /**
   * 🔑 EL MÓDULO DEL PAPEL SE PIDE AL ENTRAR, NO AL TOCAR EL BOTÓN.
   *
   * 🩸 En iOS la hoja de compartir y el visor de PDF solo se abren DENTRO del
   * gesto del toque. Si el módulo se bajara al apretar «Compartir», el `await`
   * de red haría que el navegador dejara de contarlo como gesto y no abriría
   * nada — con un `catch` silencioso, sin decir por qué. Pedirlo acá lo deja en
   * memoria antes de que el botón exista en pantalla, y el `await` del handler
   * resuelve en un microtask.
   */
  useEffect(() => {
    void import("@/lib/guias/papel-de-la-guia");
  }, []);

  const cambiarModo = useCallback(
    (abierto: boolean) => {
      setEditando(abierto);
      if (!id) return;
      try {
        router.replace(urlDeLaGuia(id, abierto, window.location.search), { scroll: false });
      } catch {
        /* sin router disponible: el modo cambió igual, que es lo que importa */
      }
    },
    [id, router],
  );

  if (!authChecked || !id) return null;

  const puedeDespachar = DESPACHO_ROLES.includes(role || "");
  const g = s.guia;
  const items = g?.guia_items || [];
  const titulo = g ? `Guía ${fmtGuia(g.numero)}` : "Guía";

  /**
   * 🔴 A UNA GUÍA DESPACHADA **TAMBIÉN** SE ENTRA Y SE ABRE EL FORMULARIO — con
   * tres cosas editables, no con todo.
   *
   * Daniel, punto 4: *"Guía despachada → se puede corregir **N° del
   * transportista · cliente · facturas**"*; punto 5: *"los **bultos** de una
   * despachada **NO se tocan** — es lo que el transportista firmó"*; punto 6:
   * *"la firma queda la vieja, no se vuelve a firmar"*.
   *
   * ⚠️ **EL CANDADO DEL PUT NO SE TOCÓ.** Una guía Completada lo sigue
   * rechazando entero: las tres correcciones van por escrituras POR COLUMNA
   * (`PATCH …/item` y `PATCH …/numero-transp`), que es lo único que no le rota
   * el id a cada renglón. La regla vive en `campos-editables.ts` y la leen el
   * formulario y el servidor.
   *
   * 🔴 Y NADIE GANA PERMISOS: es el MISMO conjunto de siempre (admin ·
   * secretaria · bodega). Vendedor sigue mirando sin tocar.
   */
  const puedeEditar = EDICION_ROLES.includes(role || "");
  /**
   * 🔴 NO DEPENDE DE QUE LA GUÍA YA HAYA CARGADO, y eso es la otra mitad del
   * arreglo del parpadeo. Con `&& !!g`, mientras la guía viajaba la pantalla
   * caía en el modo LECTURA y dibujaba su esqueleto y su encabezado; al llegar
   * los datos saltaba al formulario. Ahora el modo lo decide quien apretó el
   * botón, y lo que se muestra mientras carga es el esqueleto DEL FORMULARIO.
   */
  const enEdicion = editando && puedeEditar;
  /** Lo que falta en una guía que ya salió: se DICE, no se puede completar acá. */
  const faltaEnLaDespachada = g ? textoFaltantesDespachada(g) : "";

  /**
   * 🔴 EL DESPACHO, QUE VIVE EN ESTA MISMA PANTALLA — se esté editando o no.
   * Daniel pidió que «Despachar» fuera *otro botón dentro de la misma
   * pantalla* que el formulario, y por eso este bloque se dibuja en los dos
   * modos. Sigue siendo **el único** formulario de despacho del sistema: la
   * lista no despacha ni por swipe ni desplegando nada.
   */
  const bloqueDespacho = !g ? null : s.despachada ? (
    /* Ya despachada: lo que se firmó, de solo lectura. */
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <span className="text-xs uppercase tracking-wide text-gray-400 block mb-3">
        Ya despachada
      </span>
      {/* 🔴 ACÁ VIVÍA EL PRIMERO DE LOS TRES TEXTOS QUE SE CONTRADECÍAN.
          Decía *"Esta guía ya se despachó: no se puede editar. Lo único que se
          puede cambiar es el N° del transportista de cada envío"*, mientras el
          acordeón de la lista decía *"Solo se puede cambiar el cliente"* y el
          renglón decía *"Es lo único que se puede cambiar de una guía ya
          despachada"*. Tres frases, tres respuestas distintas, y desde el punto
          4 las tres son FALSAS: se corrigen el N° del transportista, el cliente
          y las facturas. Los tres se fueron (Daniel, punto 14).

          Lo que se puede tocar ya no hace falta explicarlo: se ve, porque es lo
          único que el formulario dibuja como campo. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Dato etiqueta="Cómo salió" valor={ETIQUETA_TIPO_DESPACHO[tipoDespachoEfectivo(g)]} />
        {/* En entrega directa no hay placa, y un "0" no es una placa. */}
        {!esEntregaDirecta(g) && <Dato etiqueta="Placa" valor={sinCeroPelado(g.placa)} />}
        {g.nombre_chofer && <Dato etiqueta="Chofer" valor={g.nombre_chofer} />}
        <Dato etiqueta="Recibido por" valor={g.receptor_nombre || ""} />
        <Dato etiqueta="Cédula" valor={g.cedula || ""} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        {g.firma_base64 && (
          <div>
            <span className="text-xs uppercase tracking-wide text-gray-400 block mb-1">
              {esEntregaDirecta(g) ? "Firma del chofer" : "Firma del transportista"}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.firma_base64} alt="Firma" className="h-12 border border-gray-200 rounded p-1 bg-white" />
          </div>
        )}
        {g.firma_entregador_base64 && (
          <div>
            <span className="text-xs uppercase tracking-wide text-gray-400 block mb-1">
              {esEntregaDirecta(g) ? "Firma del cliente" : "Firma del entregador"}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.firma_entregador_base64} alt="Firma" className="h-12 border border-gray-200 rounded p-1 bg-white" />
          </div>
        )}
      </div>
    </div>
  ) : puedeDespachar ? (
    <DespachoForm
      tipoDespacho={s.tipoDespacho}
      setTipoDespacho={s.setTipoDespacho}
      /* 🩸 DOS CONTROLES PARA EL MISMO CAMPO EN LA MISMA PANTALLA. Con la
         edición abierta, el formulario ya pregunta «Modo de entrega» (y en
         entrega directa repetía palabra por palabra *"Sale en nuestro propio
         camión: no lleva placa ni N° de guía de transportista"*). Peor: son
         DOS estados distintos —`useGuiaFormState.modoEntrega` y
         `useDespachoGuia.tipoDespacho`—, así que mover uno no movía el otro.
         Mientras se edita, manda el formulario. En lectura el bloque «Cómo
         sale» + «Cambiar» sigue EXACTAMENTE igual: es lo que evitó que 50 de
         51 entregas directas quedaran grabadas como transportista externo
         (14-ago-2026). */
      mostrarModo={!enEdicion}
      bPlaca={s.bPlaca}
      setBPlaca={s.setBPlaca}
      bReceptor={s.bReceptor}
      setBReceptor={s.setBReceptor}
      bCedula={s.bCedula}
      setBCedula={s.setBCedula}
      bChofer={s.bChofer}
      setBChofer={s.setBChofer}
      juegos={s.juegos}
      onUsarJuego={s.usarJuego}
      bSaving={s.bSaving}
      onConfirmar={(f1, f2) => { void s.confirmarDespacho(f1, f2); }}
      pendingFirma1={s.pendingFirma1}
      pendingFirma2={s.pendingFirma2}
      onFirma1Change={s.setPendingFirma1}
      onFirma2Change={s.setPendingFirma2}
    />
  ) : (
    <p className="text-sm text-gray-500">
      Esta guía todavía no se despachó. Solo bodega, secretaría o un
      administrador pueden despacharla.
    </p>
  );

  return (
    <div>
      <AppHeader
        module="Guías de Despacho"
        breadcrumbs={[{ label: g ? fmtGuia(g.numero) : "Guía" }]}
      />

      {enEdicion ? (
        <>
          {/* 🔑 EL MISMO FORMULARIO DEL ALTA, no uno parecido. Trae su propia
              barra pegajosa (con "Guardar Cambios" y el "Falta: …" cuando el
              botón está apagado), así que va FUERA de la caja de esta página
              — igual que en `/guias/nueva`.

              🔴 MIENTRAS LA GUÍA VIAJA SE MUESTRA **EL ESQUELETO DEL
              FORMULARIO**, no la pantalla de lectura. Antes, `enEdicion` exigía
              que la guía ya estuviera cargada, así que el camino era: esqueleto
              de lectura → pantalla de lectura entera → formulario. Ese salto
              es el parpadeo.

              🔴 Y LA GUÍA SE LE PASA YA CARGADA (`guia={g}`): sin esto el
              formulario la pedía POR SEGUNDA VEZ. Eran 6 pedidos para abrir
              «Editar», con la misma guía viajando dos veces. */}
          {!g ? (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
              <div className="h-24 bg-gray-100 rounded-lg animate-pulse mb-4" />
              <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
            </div>
          ) : (
            <EdicionGuia
              id={id}
              guia={g}
              onSalir={() => cambiarModo(false)}
              onGuardado={() => {
                cambiarModo(false);
                // La guía de esta pantalla se relee: el PUT reemplaza los
                // renglones, así que los ids que el despacho tiene en la mano
                // para el N° del transportista cambiaron.
                void s.recargar();
              }}
            />
          )}
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-6">{bloqueDespacho}</div>
        </>
      ) : (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          {/* Encabezado: ‹ Atrás · Guía GT-190 */}
          <div className="flex items-center gap-3 mb-5">
            <button
              type="button"
              onClick={() => router.push("/guias")}
              className="inline-flex items-center min-h-[44px] px-2 -ml-2 text-sm text-blue-700 hover:text-blue-900 transition"
            >
              ‹ Atrás
            </button>
            <h1 className="text-lg font-semibold tracking-tight truncate">{titulo}</h1>
          </div>

          {s.loading ? (
            <div className="space-y-3">
              <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
              <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
            </div>
          ) : s.error || !g ? (
            <p className="text-sm text-red-500">{s.error || "No encontrada"}</p>
          ) : (
            <div className="space-y-4">
              {/* Datos de la guía */}
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Dato etiqueta="Fecha" valor={fmtDate(g.fecha)} />
                  <Dato etiqueta="Transportista" valor={g.transportista || ""} />
                  <Dato etiqueta="Envíos" valor={String(items.length)} />
                  {/* Los bultos se SUMAN de los renglones, siempre: bodega los
                      corrige acá mismo y el total tiene que moverse con ellos.
                      (`guia_transporte` no tiene columna de total; el listado la
                      calcula igual.) */}
                  <Dato etiqueta="Bultos" valor={String(items.reduce((a, i) => a + (i.bultos || 0), 0))} />
                </div>
                {/* 🔴 TRES BOTONES, TRES TAREAS, UN TOQUE CADA UNA.
                    · «Editar» abre el MISMO formulario del alta, acá mismo.
                    · «Imprimir» manda el papel a la impresora SIN pantalla
                      intermedia (antes abría una pestaña y adentro había que
                      buscar otro «Imprimir»).
                    · «Compartir» abre la hoja del celular con el PDF.
                    Daniel, puntos 10 y 11. */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {puedeEditar && (
                    <button
                      type="button"
                      onClick={() => cambiarModo(true)}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 rounded-md border border-gray-200 text-sm text-gray-700 hover:text-black hover:bg-gray-100 transition"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                      </svg>
                      Editar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      // El módulo ya está en memoria (se precargó al entrar),
                      // así que esto resuelve en un microtask y el toque sigue
                      // contando como gesto en iOS.
                      void import("@/lib/guias/papel-de-la-guia").then(({ imprimirGuia }) => {
                        if (imprimirGuia(g) === "bloqueado") {
                          s.showToast("El navegador bloqueó la ventana. Permite las ventanas emergentes y vuelve a intentar.");
                        }
                      });
                    }}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 rounded-md border border-gray-200 text-sm text-gray-700 hover:text-black hover:bg-gray-100 transition"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    Imprimir
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void import("@/lib/guias/papel-de-la-guia")
                        .then(({ compartirGuia }) => compartirGuia(g))
                        .then((r) => {
                          if (r === "descargado") s.showToast("Guía descargada — revisa tu carpeta de descargas");
                        });
                    }}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 rounded-md border border-gray-200 text-sm text-gray-700 hover:text-black hover:bg-gray-100 transition"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 16V4" />
                      <path d="m8 8 4-4 4 4" />
                      <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
                    </svg>
                    Compartir
                  </button>
                </div>
              </div>

              {/* 🔴 LA MARCA DE LO QUE FALTÓ. El N° del transportista dejó de
                  bloquear el despacho —*"a veces el transportista lo da, a veces
                  no"*— y una guía puede salir sin él. Que no bloquee no significa
                  que se pierda: queda dicho acá y en la lista de guías, para que
                  alguien pueda encontrarlas.

                  🔴 Y SÍ se puede anotar, desde el renglón que corresponda
                  (Daniel: *"hazle la excepción para ese número"*). Es la ÚNICA
                  excepción: va por `PATCH /api/guias/[id]/numero-transp`, que
                  escribe UNA columna de UNA línea. El candado del PUT sobre una
                  guía despachada NO se tocó. */}
              {guiaSinNumeroTransp(g) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-900">
                    Esta guía salió sin el N° del transportista.{" "}
                    {puedeEditar ? "Cuando lo tengas, anótalo con «Editar»." : ""}
                  </p>
                </div>
              )}

              {/* 🔴 LO QUE FALTÓ AL DESPACHAR, DICHO — no arreglado acá.
                  Daniel, punto 13: *"Las 68 sin placa y 65 sin recibido →
                  marcadas para completarlas"*.

                  🩸 De las 207 despachadas, 190 (92%) tienen al menos un dato
                  en blanco: se cerraron cuando nada bloqueaba. El bloqueo se
                  puso el 10-ago-2026 y desde entonces son 0 de 15 — es una
                  deuda del pasado, no un agujero abierto.

                  ⚠️ **SE MARCA, NO SE ABRE.** La placa, quién recibió y la
                  cédula NO están entre las tres cosas que Daniel abrió (N° del
                  transportista · cliente · facturas) y siguen cerradas: el
                  candado del PUT las rechaza igual. Marcarlas es lo que permite
                  encontrarlas. */}
              {faltaEnLaDespachada && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-900">{faltaEnLaDespachada}.</p>
                </div>
              )}

              {/* 🔴 UNA SOLA LISTA DE ENVÍOS, Y **UNA SOLA FORMA DE EDITARLA**.
                  Daniel, punto 1: *"se retira el «Corregir» por renglón. Un
                  formulario, el MISMO al crear y al editar"*.

                  🩸 Convivían DOS caminos para arreglar el mismo renglón: el
                  «Corregir» de acá (que abría una cajita con cliente,
                  dirección, empresa, bultos y facturas) y «Editar», que abre el
                  formulario con exactamente los mismos campos. Dos formas de
                  hacer lo mismo, cada una con su propio botón de guardar y su
                  propio idioma. Quedó el formulario.

                  ⚠️ Las cajas del N° del transportista SÍ se quedan: no son
                  otra forma de editar, son parte de DESPACHAR — se llenan con
                  el papel del chofer en la mano y se confirman con las firmas,
                  en el mismo acto. */}
              <ListaEnvios
                items={items}
                numeroGuiaCabecera={g.numero_guia_transp}
                numerosTransp={s.numerosTransp}
                setNumeroTransp={s.setNumeroTransp}
                editable={!s.despachada && puedeDespachar}
                externo={s.tipoDespacho === "externo"}
              />

              {/* 🔴 LAS OBSERVACIONES, DONDE SE CARGA EL CAMIÓN.
                  Se escriben al crear la guía y vivían SOLO en el acordeón de la
                  lista y en el papel: quien despacha tenía que volver a la lista
                  y abrir la guía ahí para leerlas. El dato ya viajaba a esta
                  pantalla — solo no se dibujaba.

                  Va acá, pegado a los envíos y ARRIBA de los campos que se
                  llenan al despachar: se lee antes de trabajar, no después.

                  ⚠️ Es de SOLO LECTURA **en este modo**. Se cambia donde se
                  escribió: con «Editar», en el mismo campo del alta.

                  ⚠️ Y se muestra TAL CUAL está guardada. Hay basura adentro
                  (GT-124 tiene "|", GT-001 tiene "S1373259"): filtrarla o
                  "limpiarla" es decisión de Daniel, no de esta pantalla. */}
              {String(g.observaciones ?? "").trim() && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <span className="text-xs uppercase tracking-wide text-amber-700 block mb-1">
                    Observaciones
                  </span>
                  {/* Medido sobre las 36 notas reales de producción: mediana 32
                      caracteres, la más larga 83, máximo 2 líneas. Es texto
                      CORTO — se lee de un vistazo y NO se trunca (`break-words`
                      parte una palabra larga en vez de desbordar; `pre-wrap`
                      respeta el salto de línea de la única nota que lo tiene). */}
                  <p className="text-sm text-amber-900 whitespace-pre-wrap break-words">
                    {String(g.observaciones ?? "").trim()}
                  </p>
                </div>
              )}

              {bloqueDespacho}
            </div>
          )}
        </div>
      )}
      <Toast message={s.toast} />
    </div>
  );
}
