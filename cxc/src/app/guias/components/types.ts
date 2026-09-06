export interface GuiaItem {
  id?: string;
  // Identidad ESTABLE de la fila mientras el formulario está abierto. No existe
  // en la base: la genera el cliente y la API la ignora (arma sus filas campo
  // por campo). Sirve para dos cosas que el índice de posición hacía mal:
  //   1. el `key` de React — con `key={idx}` borrar una fila hace que React
  //      reuse el DOM de la de abajo y el texto salta de fila;
  //   2. las marcas de "campo tocado" y los errores de validación, que con
  //      `item-<idx>-campo` se quedaban pegados a la fila equivocada al borrar.
  uid?: string;
  orden: number;
  cliente: string;
  // Código del cliente en el directorio (clientes_master), formato D-XXX.
  // "" / undefined = línea "sin vincular" (texto libre conservado en `cliente`).
  cliente_codigo?: string;
  direccion: string;
  empresa: string;
  facturas: string;
  bultos: number;
  /**
   * 🔴 EL RASTRO DE LA CORRECCIÓN DE BULTOS (5-sep-2026). Bodega puede corregir
   * la cuenta MIENTRAS la guía está pendiente (Daniel: *«si al despachar
   * cuentan más bultos de lo que puso la secretaria, quiero que lo pueda
   * cambiar»*), y queda registro (*«¿queda registro?»* → sí).
   *
   * ⚠️ Los tres son OPCIONALES a propósito: la migración
   * `20261004120000_guias_bultos_corregidos.sql` está PENDIENTE, y hasta que
   * corra las columnas no llegan. Sin dato no se afirma nada — ver
   * `textoCorreccionGuardada` en `lib/guias/bultos-correccion.ts`.
   */
  bultos_original?: number | null;
  bultos_corregido_por?: string | null;
  bultos_corregido_en?: string | null;
  numero_guia_transp: string;
}

export type ModoEntrega = "transportista" | "entrega_directa";

export interface Guia {
  id: string;
  numero: number;
  fecha: string;
  // Display label resuelto por la API (transportistaLabel). Optional porque
  // las respuestas pueden venir sin él si el JOIN falla; el form ya no lo
  // escribe en DB — usa modo_entrega + transportista_id.
  transportista?: string;
  modo_entrega?: ModoEntrega;
  transportista_id?: string | null;
  placa: string;
  observaciones: string;
  /**
   * 🩸 ACÁ VIVÍAN `motivo_rechazo` Y `monto_total`, Y LOS DOS SE FUERON
   * (5-sep-2026, Daniel: sobre «Rechazada», *«quitarlo»*; sobre los restos,
   * *«sí»*).
   *
   * Medido contra producción el 5-sep-2026 sobre las 242 guías de toda la
   * historia: `motivo_rechazo` **0 filas** (el estado «Rechazada» nunca se
   * usó), `monto_total` **0.00 en las 242** y no se mostraba en ninguna
   * pantalla — viajaba al navegador en cada carga de la lista para nada.
   *
   * ⚠️ Las COLUMNAS no se dropean (patrón `mayor_lineas` / `cxc_favorites`):
   * se quedan sin lectores ni escritores, con su `COMMENT`, y hay candado que
   * pone el build rojo si una migración las borra o si el código vuelve a
   * tocarlas — `guias-restos-muertos.test.ts`.
   */
  total_bultos: number;
  item_count: number;
  estado: string;
  receptor_nombre?: string;
  cedula?: string;
  firma_base64?: string;
  firma_entregador_base64?: string;
  entregado_por?: string;
  numero_guia_transp?: string;
  tipo_despacho?: string;
  nombre_chofer?: string;
  guia_items?: GuiaItem[];
}

export interface Transportista {
  id: string;
  nombre: string;
  activo: boolean;
}

export type View = "list" | "form" | "print";
