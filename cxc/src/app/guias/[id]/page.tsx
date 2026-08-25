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

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
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
   * guardar o al cancelar — **sin cambiar de pantalla**.
   *
   * `?editar=1` la abre de entrada: es por donde entra el camino viejo
   * (`/guias/[id]/editar`, que ahora redirige acá), así que un enlace guardado
   * sigue abriendo lo que abría. Se lee de `window.location` y no con
   * `useSearchParams` por lo mismo que en `/guias`: ese hook obliga a envolver
   * la página en un `<Suspense>` para poder compilarla.
   */
  const [editando, setEditando] = useState(false);
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("editar") === "1") setEditando(true);
    } catch {
      /* sin query: la guía se abre en modo lectura, como siempre */
    }
  }, []);

  if (!authChecked || !id) return null;

  const puedeDespachar = DESPACHO_ROLES.includes(role || "");
  const g = s.guia;
  const items = g?.guia_items || [];
  const titulo = g ? `Guía ${fmtGuia(g.numero)}` : "Guía";

  // 🔴 UNA GUÍA YA DESPACHADA NO SE EDITA, Y ESE CANDADO NO SE TOCA. No es
  // cosmético: el PUT la rechaza igual, así que un botón «Editar» acá sería un
  // botón que lleva a una pantalla que no puede guardar. Las dos excepciones de
  // siempre siguen donde estaban (atar el cliente, y anotar el N° del
  // transportista desde el renglón).
  const puedeEditar = EDICION_ROLES.includes(role || "") && !s.despachada;
  const enEdicion = editando && puedeEditar && !!g;

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
      <span className="text-xs uppercase tracking-wide text-gray-400 block mb-1">
        Ya despachada
      </span>
      {/* 🔴 LA PANTALLA DICE QUE ESTÁ BLOQUEADA. Campos que parecen editables y
          no dejan escribir son peor que no mostrarlos: acá se dice de frente
          qué se puede tocar y qué no. Mismo criterio que el aviso "Solo se
          puede cambiar el cliente" del acordeón de la lista. */}
      <p className="text-sm text-gray-600 mb-3">
        Esta guía ya se despachó: no se puede editar.
        {puedeDespachar && !esEntregaDirecta(g)
          ? " Lo único que se puede cambiar es el N° del transportista de cada envío."
          : ""}
      </p>
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
      <Link
        href={`/guias/${id}/imprimir`}
        className="mt-4 inline-flex items-center min-h-[44px] text-sm text-blue-700 hover:text-blue-900 transition"
      >
        Ver e imprimir la guía
      </Link>
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
              — igual que en `/guias/nueva`. */}
          <EdicionGuia
            id={id}
            onSalir={() => setEditando(false)}
            onGuardado={() => {
              setEditando(false);
              // La guía de esta pantalla se relee: el PUT reemplaza los
              // renglones, así que los ids que el despacho tiene en la mano
              // para el N° del transportista cambiaron.
              void s.recargar();
            }}
          />
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
                {/* 🔴 «EDITAR» — y se abre ACÁ MISMO. Antes esto era un enlace
                    de texto que decía "Cambiar los envíos de esta guía" y
                    llevaba a OTRA pantalla, un nivel más adentro. Daniel:
                    *"quiero botón de editar y que se me abra la guía para
                    editar así mismo como si estuviese haciendo la guía"*. */}
                {puedeEditar && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setEditando(true)}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 rounded-md border border-gray-200 text-sm text-gray-700 hover:text-black hover:bg-gray-100 transition"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                      </svg>
                      Editar
                    </button>
                  </div>
                )}
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
                    {puedeDespachar
                      ? "Cuando lo tengas, anótalo en el envío que corresponda."
                      : ""}
                  </p>
                </div>
              )}

              {/* 🔴 UNA SOLA LISTA DE ENVÍOS. Cada renglón trae su caja del N° del
                  transportista y su botón "Corregir" — antes los mismos 7 envíos
                  se dibujaban dos veces en esta pantalla (acá de solo lectura y
                  otra vez completos dentro del formulario de despacho).

                  ⚠️ Y sigue siendo UNA SOLA con la edición abierta: cuando se
                  edita, esta lista no se dibuja — la del formulario es la misma
                  lista, completa y editable. */}
              <ListaEnvios
                items={items}
                numeroGuiaCabecera={g.numero_guia_transp}
                numerosTransp={s.numerosTransp}
                setNumeroTransp={s.setNumeroTransp}
                editable={!s.despachada && puedeDespachar}
                externo={s.tipoDespacho === "externo"}
                onCorregir={s.corregirItem}
                puedeAnotarNumero={s.despachada && puedeDespachar && !esEntregaDirecta(g)}
                onAnotarNumero={s.anotarNumeroTransp}
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
