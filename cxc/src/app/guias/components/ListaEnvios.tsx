"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LOS ENVÍOS DE LA GUÍA — **UNA SOLA LISTA** (17-ago-2026).
//
// 🩸 LOS 7 ENVÍOS APARECÍAN DOS VECES EN LA MISMA PANTALLA. Arriba, un bloque
// `ENVÍOS` de solo lectura (cliente · dirección · empresa · facturas · bultos) y
// más abajo, dentro del formulario de despacho, el bloque `N° DE GUÍA DEL
// TRANSPORTISTA · UNO POR LÍNEA` con **los mismos 7 renglones otra vez**, cada
// uno en su cajita. Había que bajar por la misma lista dos veces, y con 7 envíos
// la pantalla pasaba los 2.000 px en un celular.
//
// Ahora es UNA lista: cada renglón dice lo suyo **y trae su caja del N° del
// transportista ahí mismo**.
//
// 🔴 BODEGA CORRIGE SIN SALIR DE ACÁ. Daniel, textual: *"la parte de bodega es
// firmar más que nada para que quede registrado, y si hay algún cambio que hacer
// por error por ejemplo nombre, dirección, cantidad de bultos, que lo pueda
// arreglar"*. Antes había que irse a `/guias/[id]/editar` y volver — con el
// camión esperando, eso es tiempo. El camino viejo NO se perdió: sigue el enlace
// "Cambiar los envíos de esta guía" para agregar o quitar renglones.
//
// ⚠️ CORREGIR UN CAMPO NO REEMPLAZA LA LISTA. Va por
// `PATCH /api/guias/[id]/item`, que escribe los campos tocados de UNA fila. El
// `items` del PUT es un reemplazo completo (borra e inserta, cambiando el id de
// cada línea) y usarlo acá tiraría el trabajo de atar clientes.
//
// 🔴 EL CLIENTE SE ELIGE CON EL SELECTOR DE SIEMPRE (`ClientePicker`), el único
// del sistema. Escribir el nombre a mano en un `<input>` acá sería estrenar el
// segundo selector justo después de que se retirara el último (#567).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import ClientePicker from "@/components/ClientePicker";
import type { GuiaItem } from "./types";
import { EMPRESAS_CANONICAS, opcionesEmpresa } from "./guia-form-logic";
import { numeroTranspImpreso } from "@/lib/guias/modo-despacho";
import type { CorreccionEnvio } from "./useDespachoGuia";

/** Campo de texto: 44 px con el dedo, denso solo cuando hay mouse. */
const CAMPO =
  "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base md:text-sm outline-none focus:border-black transition min-h-[44px]";

interface ListaEnviosProps {
  items: GuiaItem[];
  /** El N° de la cabecera: una línea sin el suyo hereda ése, igual que el papel. */
  numeroGuiaCabecera?: string | null;
  /** Los N° del transportista por línea, en el orden de la guía. */
  numerosTransp: string[];
  setNumeroTransp: (idx: number, v: string) => void;
  /** false = guía ya despachada, o quien mira no puede despachar: solo lectura. */
  editable: boolean;
  /** En entrega directa no hay transportista al que pedirle un número. */
  externo: boolean;
  /** Guarda los campos tocados de UNA fila. Devuelve el error, o null si salió. */
  onCorregir: (itemId: string, cambios: CorreccionEnvio) => Promise<string | null>;
  /**
   * 🔴 LA EXCEPCIÓN DE LA GUÍA YA DESPACHADA. El N° del transportista dejó de
   * bloquear el despacho, así que hay guías que salieron sin él: acá se anota
   * cuando llega. Es lo ÚNICO que se puede escribir en una guía cerrada.
   */
  puedeAnotarNumero?: boolean;
  onAnotarNumero?: (itemId: string, numero: string) => Promise<string | null>;
}

function Resumen({ item }: { item: GuiaItem }) {
  const detalle = [item.direccion, item.empresa, item.facturas].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0">
      <span className="text-sm font-medium break-words">{item.cliente || "Sin cliente"}</span>
      {detalle && <span className="block text-xs text-gray-500 break-words">{detalle}</span>}
    </div>
  );
}

/** El renglón abierto para corregir. Guarda al apretar, nunca al tipear. */
function Correccion({
  item,
  onGuardar,
  onCerrar,
}: {
  item: GuiaItem;
  onGuardar: (cambios: CorreccionEnvio) => Promise<string | null>;
  onCerrar: () => void;
}) {
  const [cliente, setCliente] = useState(item.cliente || "");
  const [codigo, setCodigo] = useState(item.cliente_codigo || "");
  const [direccion, setDireccion] = useState(item.direccion || "");
  const [empresa, setEmpresa] = useState(item.empresa || "");
  const [facturas, setFacturas] = useState(item.facturas || "");
  const [bultos, setBultos] = useState(String(item.bultos ?? 0));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Number(bultos);
  const bultosMal = !Number.isInteger(n) || n < 0;

  async function guardar() {
    if (guardando || bultosMal) return;
    setGuardando(true);
    setError(null);
    const err = await onGuardar({
      cliente,
      cliente_codigo: codigo || null,
      direccion,
      empresa,
      facturas,
      bultos: n,
    });
    setGuardando(false);
    if (err) setError(err);
    else onCerrar();
  }

  const rotulo = "text-xs uppercase tracking-wide text-gray-400 mb-1 block";

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
      <div>
        <span className={rotulo}>Cliente</span>
        <ClientePicker
          value={cliente}
          codigo={codigo}
          onChange={(nombre, cod) => {
            setCliente(nombre);
            setCodigo(cod);
          }}
          inputClassName={`${CAMPO} bg-white`}
        />
      </div>
      <div>
        <label htmlFor={`corr-direccion-${item.id}`} className={rotulo}>Dirección</label>
        <input
          id={`corr-direccion-${item.id}`}
          type="text"
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          className={`${CAMPO} bg-white`}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`corr-empresa-${item.id}`} className={rotulo}>Empresa</label>
          {/* `<select>` nativo: en iOS abre la rueda del sistema, 44 px puestos
              por el sistema operativo. Mismo criterio que el formulario. */}
          <select
            id={`corr-empresa-${item.id}`}
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            className={`${CAMPO} bg-white`}
          >
            <option value="">Elige la empresa</option>
            {opcionesEmpresa(empresa, EMPRESAS_CANONICAS).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`corr-bultos-${item.id}`} className={rotulo}>Bultos</label>
          <input
            id={`corr-bultos-${item.id}`}
            type="number"
            inputMode="numeric"
            min={0}
            value={bultos}
            onChange={(e) => setBultos(e.target.value)}
            className={`${CAMPO} bg-white`}
          />
        </div>
      </div>
      <div>
        <label htmlFor={`corr-facturas-${item.id}`} className={rotulo}>Factura(s)</label>
        <input
          id={`corr-facturas-${item.id}`}
          type="text"
          value={facturas}
          onChange={(e) => setFacturas(e.target.value)}
          className={`${CAMPO} bg-white`}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { void guardar(); }}
          disabled={guardando || bultosMal}
          className={`flex-1 min-w-[8rem] rounded-lg text-sm font-semibold min-h-[44px] px-4 transition ${
            guardando || bultosMal
              ? "bg-gray-300 text-white cursor-not-allowed"
              : "bg-black text-white hover:bg-gray-800 active:scale-[0.97]"
          }`}
        >
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-lg border border-gray-200 text-sm min-h-[44px] px-4 hover:bg-gray-50 transition"
        >
          Cancelar
        </button>
      </div>
      {bultosMal && (
        <p className="text-sm font-medium text-amber-700">
          Los bultos tienen que ser un número entero de 0 en adelante.
        </p>
      )}
    </div>
  );
}

/**
 * 🔴 ANOTAR EL N° DEL TRANSPORTISTA EN UNA GUÍA QUE YA SALIÓ — la única
 * excepción, y se ve que es una sola: un campo, nada más.
 *
 * Va por `PATCH /api/guias/[id]/numero-transp`, que escribe UNA columna de UNA
 * línea y ni siquiera consulta el estado. Todo lo demás del despacho —bultos,
 * facturas, cliente escrito, placa, receptor, cédula, firmas— sigue cerrado.
 */
function AnotarNumero({
  item,
  onGuardar,
  onCerrar,
}: {
  item: GuiaItem;
  onGuardar: (numero: string) => Promise<string | null>;
  onCerrar: () => void;
}) {
  const [numero, setNumero] = useState(item.numero_guia_transp || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (guardando) return;
    setGuardando(true);
    setError(null);
    const err = await onGuardar(numero);
    setGuardando(false);
    if (err) setError(err);
    else onCerrar();
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
      <div>
        <label
          htmlFor={`tarde-${item.id}`}
          className="text-xs uppercase tracking-wide text-gray-400 mb-1 block"
        >
          N° de guía del transportista
        </label>
        <input
          id={`tarde-${item.id}`}
          type="text"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="El que te dio el transportista"
          className={`${CAMPO} bg-white`}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { void guardar(); }}
          disabled={guardando}
          className={`flex-1 min-w-[8rem] rounded-lg text-sm font-semibold min-h-[44px] px-4 transition ${
            guardando
              ? "bg-gray-300 text-white cursor-not-allowed"
              : "bg-black text-white hover:bg-gray-800 active:scale-[0.97]"
          }`}
        >
          {guardando ? "Guardando…" : "Guardar el N°"}
        </button>
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-lg border border-gray-200 text-sm min-h-[44px] px-4 hover:bg-gray-50 transition"
        >
          Cancelar
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Es lo único que se puede cambiar de una guía ya despachada.
      </p>
    </div>
  );
}

export default function ListaEnvios({
  items,
  numeroGuiaCabecera,
  numerosTransp,
  setNumeroTransp,
  editable,
  externo,
  onCorregir,
  puedeAnotarNumero = false,
  onAnotarNumero,
}: ListaEnviosProps) {
  /** Solo UN renglón abierto a la vez: con 7 envíos, todos abiertos es un muro. */
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null);
  /** El renglón al que se le está anotando el N° del transportista (guía cerrada). */
  const [anotando, setAnotando] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      {/* "de esta guía" se fue: se está DENTRO de la guía. */}
      <span className="text-xs uppercase tracking-wide text-gray-400 block mb-1">
        Envíos
      </span>
      {editable && externo && items.length > 0 && (
        <p className="text-xs text-gray-500 mb-3">
          El transportista arma varias guías suyas por cada guía nuestra. Anota en
          cada envío el número que te dio — si no te dio ninguno, la guía se
          despacha igual y queda marcada.
        </p>
      )}
      <ul className="divide-y divide-gray-100">
        {items.map((item, idx) => {
          const abierto = !!item.id && corrigiendo === item.id;
          const anotandoEste = !!item.id && anotando === item.id;
          return (
            <li key={item.id || idx} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <Resumen item={item} />
                <span className="text-sm tabular-nums shrink-0">{item.bultos || 0} bultos</span>
              </div>

              {editable ? (
                <div className="mt-2 flex items-end gap-2">
                  {externo && (
                    <div className="flex-1 min-w-0">
                      {/* ⚠️ El rótulo va en el campo, no encima: repetido 7
                          veces sumaba una pantalla entera de alto en un
                          celular, y arriba de la lista ya está explicado. Se
                          conserva como `sr-only` para quien no ve la pantalla. */}
                      <label htmlFor={`transp-${idx}`} className="sr-only">
                        N° de guía del transportista de este envío
                      </label>
                      <input
                        id={`transp-${idx}`}
                        type="text"
                        value={numerosTransp[idx] ?? ""}
                        onChange={(e) => setNumeroTransp(idx, e.target.value)}
                        placeholder="N° del transportista"
                        className={CAMPO}
                      />
                    </div>
                  )}
                  {item.id && (
                    <button
                      type="button"
                      onClick={() => setCorrigiendo(abierto ? null : item.id!)}
                      className="shrink-0 text-sm text-blue-700 hover:text-blue-900 transition inline-flex items-center min-h-[44px] px-2"
                    >
                      {abierto ? "Cerrar" : "Corregir"}
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-0.5 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">
                    N° guía transportista:{" "}
                    <span className="font-medium text-gray-700">
                      {numeroTranspImpreso(item.numero_guia_transp, numeroGuiaCabecera) || "—"}
                    </span>
                  </span>
                  {/* 🔴 LA EXCEPCIÓN, Y ES UNA SOLA: en una guía YA DESPACHADA se
                      puede anotar el N° del transportista que llegó tarde, y
                      NADA MÁS. Daniel: *"hazle la excepción para ese número"*.
                      Todo lo demás del despacho sigue cerrado. */}
                  {puedeAnotarNumero && item.id && (
                    <button
                      type="button"
                      onClick={() => setAnotando(anotandoEste ? null : item.id!)}
                      className="shrink-0 text-sm text-blue-700 hover:text-blue-900 transition inline-flex items-center min-h-[44px] px-2"
                    >
                      {anotandoEste
                        ? "Cerrar"
                        : numeroTranspImpreso(item.numero_guia_transp, numeroGuiaCabecera)
                          ? "Cambiar el N°"
                          : "Anotar el N°"}
                    </button>
                  )}
                </div>
              )}

              {anotandoEste && item.id && onAnotarNumero && (
                <AnotarNumero
                  item={item}
                  onGuardar={(numero) => onAnotarNumero(item.id!, numero)}
                  onCerrar={() => setAnotando(null)}
                />
              )}

              {abierto && item.id && (
                <Correccion
                  item={item}
                  onGuardar={(cambios) => onCorregir(item.id!, cambios)}
                  onCerrar={() => setCorrigiendo(null)}
                />
              )}
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="py-2.5 text-sm text-gray-400">Esta guía no tiene envíos cargados.</li>
        )}
      </ul>
    </div>
  );
}
