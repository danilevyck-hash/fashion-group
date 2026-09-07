"use client";

// ─────────────────────────────────────────────────────────────────────────────
// UNA FILA DE COMPROBANTES, EN SUS DOS FORMAS: TABLA Y FICHA (6-sep-2026)
//
// 🩸 EN EL iPAD LAS ACCIONES QUEDABAN FUERA DE LA PANTALLA. La tabla pide unos
// 660 px y el iPad acostado le da 512 al contenido; lo que se cortaba era justo
// la tira de acciones de la derecha, y los tres botones medían **27 px de alto**
// contra los 44 que este sistema exige para lo que se toca con el dedo. Es el
// mismo arreglo que ya hicieron Guías y Cuentas por Cobrar: **por debajo de
// 1024 px la fila es una FICHA**, y de ahí para arriba la tabla se queda igual.
//
// Los dos dibujos comen de las MISMAS piezas (el nombre, los números, el
// vendedor, las acciones), así que no pueden decir cosas distintas.
// ─────────────────────────────────────────────────────────────────────────────

import { getMarcaTheme, type MarcaUiKey, type MarcaTheme } from "@/lib/catalogo/marcas-ui";
import { ORIGEN_LABEL } from "@/lib/catalogo/origen-comprobante";
import { esSinMandar, textoSinMandar } from "@/lib/catalogo/sin-mandar";
import {
  estaEnSwitch,
  textoEnSwitch,
  textoNumeroPedido,
  tieneNumeroPropio,
  type NumerosDePedido,
} from "@/lib/catalogo/numeros-pedido";
import type { FilaComprobante } from "@/lib/catalogo/fila-comprobante";
import AccionesComprobante from "./AccionesComprobante";

/** La etiqueta de origen. Los DOS nombres viven en `origen-comprobante.ts`. */
export function OrigenBadge({
  marca,
  origen,
  confirmadoCliente,
}: {
  marca: MarcaUiKey;
  origen: "mio" | "link";
  confirmadoCliente?: boolean;
}) {
  const theme = getMarcaTheme(marca)!;
  if (origen === "link") {
    return (
      <span
        data-chip="del-link"
        title={confirmadoCliente ? `${ORIGEN_LABEL.link} · Confirmado por el cliente` : undefined}
        className={theme.admin.pedidos.linkBadge}
      >
        {ORIGEN_LABEL.link}
        {confirmadoCliente && (
          <svg className={theme.admin.pedidos.linkBadgeCheck} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
      {ORIGEN_LABEL.mio}
    </span>
  );
}

export function datosNumeros(pedido: FilaComprobante, esOrders: boolean): NumerosDePedido {
  return {
    numeroPedido: pedido.numero_pedido ?? null,
    switchNumero: pedido.switch_numero ?? null,
    switchDocumento: pedido.switch_documento ?? null,
    status: pedido.status ?? null,
    enSwitch: pedido.en_switch,
    fuente: esOrders ? "orders" : "publicos",
  };
}

/**
 * Los dos números debajo del nombre.
 *
 * 🔴 EL QUE NO LLEGÓ A SWITCH SE NOTA. La frase existía y estaba en gris del
 * mismo tamaño que todo lo demás: ahora, cuando el pedido está TERMINADO y no
 * salió, va **en rojo y con los días** («Sin mandar a Switch · hace 65 días»).
 * Un borrador sigue con su frase gris de siempre: no se mandó porque no se
 * terminó, y eso no es una alarma.
 */
export function NumerosPedido({
  pedido,
  esOrders,
  hoy,
}: {
  pedido: FilaComprobante;
  esOrders: boolean;
  hoy: string;
}) {
  const datos = datosNumeros(pedido, esOrders);
  const propio = tieneNumeroPropio(datos);
  const enSwitch = estaEnSwitch(datos);
  const trabado = esSinMandar(datos);
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs leading-snug">
      <span className={propio ? "font-medium text-gray-600 tabular-nums" : "text-gray-400"}>
        {textoNumeroPedido(datos)}
      </span>
      <span className="text-gray-300" aria-hidden="true">
        ·
      </span>
      {trabado ? (
        <span data-medir="sin-mandar" className="font-medium text-red-600">
          {textoSinMandar(pedido.created_at, hoy)}
        </span>
      ) : (
        <span className={enSwitch ? "text-gray-600 tabular-nums" : "text-gray-400"}>
          {textoEnSwitch(datos)}
        </span>
      )}
    </div>
  );
}

export interface PropsFila {
  pedido: FilaComprobante;
  marca: MarcaUiKey;
  theme: MarcaTheme;
  esOrders: boolean;
  hoy: string;
  puedeAdministrar: boolean;
  puedeEditar: boolean;
  seleccionado: boolean;
  abriendo: boolean;
  fmtMoney: (n: number) => string;
  fmtDate: (iso: string) => string;
  clienteLabel: (p: FilaComprobante) => string;
  onAbrir: () => void;
  onSeleccionar: () => void;
  onDuplicar: () => void;
  onReenviarCorreo: () => void;
  onEliminar: () => void;
  showToast: (msg: string, tono?: "error" | "success") => void;
}

/** El nombre del cliente, con su «Sin nombre» en gris. */
function NombreCliente({ pedido, clienteLabel }: { pedido: FilaComprobante; clienteLabel: (p: FilaComprobante) => string }) {
  return clienteLabel(pedido) === "Sin nombre" ? (
    <span className="text-gray-300 italic">Sin nombre</span>
  ) : (
    <>{pedido.cliente}</>
  );
}

/**
 * 🔴 QUIÉN LO ARMÓ. En Tommy las 32 filas se veían iguales y las armaron TRES
 * personas (REINALDO ESPINOSA 28 · daniel 2 · rey 2). El dato ya viajaba en la
 * fila; solo no se dibujaba. Vacío se dice «—», no un blanco.
 */
function TextoVendedor({ vendor }: { vendor: string | null }) {
  const v = (vendor ?? "").trim();
  return v ? <>{v}</> : <span className="text-gray-300">—</span>;
}

/** La fila de la TABLA — de `lg` (1024 px) para arriba. */
export function FilaTabla(p: PropsFila) {
  return (
    <tr
      // Hooks ESTABLES para los candados de conducta: el número (o el short_id
      // cuando todavía no tiene) y la tabla física.
      data-pedido={p.pedido.numero_pedido ?? p.pedido.id_natural}
      data-fuente={p.pedido.fuente ?? "orders"}
      onClick={p.onAbrir}
      className="hover:bg-gray-50 transition cursor-pointer"
    >
      <td className="w-8 pl-4 pr-1 py-3" onClick={(e) => e.stopPropagation()}>
        {p.puedeAdministrar && (
          <input
            type="checkbox"
            checked={p.seleccionado}
            onChange={p.onSeleccionar}
            className="w-4 h-4 accent-black cursor-pointer align-middle"
            aria-label={`Seleccionar pedido de ${p.clienteLabel(p.pedido)}`}
          />
        )}
      </td>
      <td className="px-4 py-3">
        <OrigenBadge marca={p.marca} origen={p.pedido.origen} confirmadoCliente={!!p.pedido.confirmado_cliente_at} />
      </td>
      <td className="px-2 lg:px-4 py-3 text-gray-900">
        <NombreCliente pedido={p.pedido} clienteLabel={p.clienteLabel} />
        <NumerosPedido pedido={p.pedido} esOrders={p.esOrders} hoy={p.hoy} />
      </td>
      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
        <TextoVendedor vendor={p.pedido.vendor} />
      </td>
      <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
        ${p.fmtMoney(p.pedido.total)}
      </td>
      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{p.fmtDate(p.pedido.created_at)}</td>
      <td className="px-4 py-3 text-right">
        <AccionesComprobante
          pedido={p.pedido}
          theme={p.theme}
          puedeEditar={p.puedeEditar}
          puedeAdministrar={p.puedeAdministrar}
          esOrders={p.esOrders}
          abriendo={p.abriendo}
          onAbrir={p.onAbrir}
          onDuplicar={p.onDuplicar}
          onReenviarCorreo={p.onReenviarCorreo}
          onEliminar={p.onEliminar}
          showToast={p.showToast}
        />
      </td>
    </tr>
  );
}

/** La FICHA — por debajo de `lg`. Nada se arrastra de costado. */
export function FichaFila(p: PropsFila) {
  return (
    <div
      data-pedido={p.pedido.numero_pedido ?? p.pedido.id_natural}
      data-fuente={p.pedido.fuente ?? "orders"}
      onClick={p.onAbrir}
      className="px-3 py-3 hover:bg-gray-50 transition cursor-pointer"
    >
      <div className="flex items-start gap-2">
        {p.puedeAdministrar && (
          <input
            type="checkbox"
            checked={p.seleccionado}
            onChange={p.onSeleccionar}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 accent-black cursor-pointer mt-1 shrink-0"
            aria-label={`Seleccionar pedido de ${p.clienteLabel(p.pedido)}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-gray-900 truncate">
              <NombreCliente pedido={p.pedido} clienteLabel={p.clienteLabel} />
            </span>
            <span className="text-sm font-semibold text-gray-900 tabular-nums shrink-0">
              ${p.fmtMoney(p.pedido.total)}
            </span>
          </div>
          <NumerosPedido pedido={p.pedido} esOrders={p.esOrders} hoy={p.hoy} />
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            <OrigenBadge marca={p.marca} origen={p.pedido.origen} confirmadoCliente={!!p.pedido.confirmado_cliente_at} />
            <TextoVendedor vendor={p.pedido.vendor} />
            <span className="text-gray-300" aria-hidden="true">·</span>
            <span className="whitespace-nowrap">{p.fmtDate(p.pedido.created_at)}</span>
          </div>
        </div>
        <div className="shrink-0">
          <AccionesComprobante
            pedido={p.pedido}
            theme={p.theme}
            puedeEditar={p.puedeEditar}
            puedeAdministrar={p.puedeAdministrar}
            esOrders={p.esOrders}
            abriendo={p.abriendo}
            onAbrir={p.onAbrir}
            onDuplicar={p.onDuplicar}
            onReenviarCorreo={p.onReenviarCorreo}
            onEliminar={p.onEliminar}
            showToast={p.showToast}
          />
        </div>
      </div>
    </div>
  );
}
