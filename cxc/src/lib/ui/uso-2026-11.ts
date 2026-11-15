// ─────────────────────────────────────────────────────────────────────────────
// Auditoría de uso (15-nov-2026) — los mockups «ux-NN» que Daniel aprobó.
// Solo pantalla: ninguna cuenta de plata cambia. `false` = la pantalla de antes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ux-01 · Asistencia › Aprobaciones: «Aprobar 36 pendientes» dice cuántos
 * aprueba, y al tocarlo sale el aviso de 5 s con «Deshacer» (nada viaja al
 * servidor hasta que pasan los 5 s). «Sí» va gris hasta que alguien decide.
 */
export const APROBAR_LOTE_CON_DESHACER = true;

/** ux-02 · Caja menuda: «Nuevo gasto» fijo abajo en la portada, anota en el período abierto. */
export const CAJA_NUEVO_GASTO_EN_PORTADA = true;

/** ux-04 · Despachos › Pedidos: el pedido abierto trae abajo el mismo paso de la fila. */
export const PEDIDO_CON_ACCION_EN_DETALLE = true;

/** ux-05 · Estado de cuenta: WhatsApp solo a celular (8 dígitos que empiezan en 6); un fijo deja la opción apagada y lo dice. */
export const WHATSAPP_SOLO_CELULAR = true;

/** ux-06 · Guía pendiente: «Despachado por» viene puesto con quien entró, si está en la lista de despachadores. */
export const DESPACHADO_POR_EL_USUARIO = true;

/** ux-07 · Planilla › Antes de cerrar: la deuda del día libre en una línea gris con «ver quiénes», y «Ver lo que falta» arriba. */
export const ANTES_DE_CERRAR_CLARO = true;

/** ux-08b · Planilla con «Todas»: sin la frase de arriba y sin el «Generar» gris; queda «Revisar» por fila. */
export const TODAS_SIN_FRASE_NI_GENERAR = true;

/** ux-03 (opción B) · Caja › Nuevo gasto: rótulo arriba, de a dos por fila, el monto primero y nada tapa «Guardar». */
export const CAJA_FORM_DOS_POR_FILA = true;

/** ux-01 · El texto del aviso de 5 s: «36 aprobadas · 586:52 h». */
export function avisoLoteAprobado(colaboradores: number, horas: string): string {
  return `${colaboradores} ${colaboradores === 1 ? "aprobada" : "aprobadas"} · ${horas} h`;
}

/** ux-01 · «Aprobar 36 pendientes» (sin búsqueda); con búsqueda manda el rótulo de lo visible. */
export function rotuloLoteConCuantos(colaboradores: number): string {
  if (colaboradores <= 0) return "Aprobar pendientes";
  return colaboradores === 1 ? "Aprobar 1 pendiente" : `Aprobar ${colaboradores} pendientes`;
}

/**
 * ux-05 · ¿Se le puede escribir por WhatsApp? En Panamá un celular tiene 8
 * dígitos y empieza en 6; un fijo tiene 7. Con el 507 adelante se quita.
 */
export function esCelularPanama(telefono: string | null | undefined): boolean {
  let d = String(telefono ?? "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("00507")) d = d.slice(5);
  if (d.length === 11 && d.startsWith("507")) d = d.slice(3);
  return d.length === 8 && d.startsWith("6");
}

/**
 * ux-05 · El número al que va el WhatsApp: el primer CELULAR entre los
 * teléfonos del cliente (un campo puede traer «727-7247 / 6212-0673»).
 * Apagado = lo de antes (celular o, si no, teléfono). `null` = no hay celular.
 */
export function telefonoParaWhatsApp(...raws: (string | null | undefined)[]): string | null {
  if (!WHATSAPP_SOLO_CELULAR) return raws.find((r) => !!r?.trim()) ?? null;
  for (const raw of raws) {
    for (const parte of String(raw ?? "").split(/[\/;,]+/)) {
      if (esCelularPanama(parte)) return parte.trim();
    }
  }
  return null;
}

/** ux-05 · Lo que dice la fila apagada cuando hay teléfono pero no celular. */
export function textoSinCelular(telefono: string): string {
  const d = telefono.replace(/\D/g, "");
  return d.length === 7 ? `${telefono} es fijo: no tiene WhatsApp` : `${telefono} no es un celular: no tiene WhatsApp`;
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * ux-06 · El despachador que es la persona que entró. Igualdad EXACTA (sin
 * mayúsculas ni acentos) del nombre entero o del primer nombre contra la lista
 * del equipo, nunca por parecido. Sin coincidencia: "" (el campo queda vacío y
 * se elige, como antes).
 */
export function despachadorDelUsuario(lista: readonly string[], ...nombres: (string | null | undefined)[]): string {
  for (const n of nombres) {
    const entero = sinAcentos(String(n ?? ""));
    if (!entero) continue;
    const primero = entero.split(/\s+/)[0];
    const hallado = lista.find((d) => sinAcentos(d) === entero) ?? lista.find((d) => sinAcentos(d) === primero);
    if (hallado) return hallado;
  }
  return "";
}
