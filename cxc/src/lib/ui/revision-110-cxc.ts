// ─────────────────────────────────────────────────────────────────────────────
// REVISIÓN 110 (14-nov-2026) — Cuentas por cobrar, Clientes, Proveedores y
// Consulta de artículos. Daniel aprobó cada punto (memoria
// `revision-110-aprobaciones`). Un interruptor por punto, con su número de la
// revisión; `false` = la pantalla de antes. Ningún dato, monto ni regla de
// plata cambia: solo forma, nombres y a dónde lleva un toque.
// ─────────────────────────────────────────────────────────────────────────────

/** n.º 13 · Boston en el celular con la MISMA pantalla del grupo; se elige en el título. */
export const CXC_BOSTON_COMO_GRUPO_CELULAR = true;

/** n.º 14 · Bajo el título del celular, la empresa que se mira; «Todas las empresas» en las listas. */
export const CXC_EMPRESA_BAJO_EL_TITULO = true;

/** n.º 15 · Cliente en el celular: el título «‹ Cuentas por cobrar» vuelve; sin la fila repetida. */
export const CXC_CLIENTE_TITULO_VUELVE = true;

/** n.º 16 · Cliente: «Por empresa» con la misma tabla de la hoja, sin la leyenda de colores. */
export const CXC_CLIENTE_TABLA_DE_LA_HOJA = true;

/** n.º 17 · El Excel de la cartera: encabezados en la fila 1, con filtro y fila fija. */
export const CXC_EXCEL_FILA_1 = true;

/** n.º 18 · El estado de cuenta se llama igual descargado y adjunto al correo. */
export const CXC_PDF_UN_SOLO_NOMBRE = true;

/**
 * n.º 19 · «City Mall» decía «Sin resultados». Causa: la búsqueda se sumaba al
 * chip «sin pago en +90 días» prendido, y City Mall David pagó hace 24 días.
 * «Total» ahora apaga también ese chip, y si una búsqueda no encuentra nada con
 * filtros puestos, lo dice y ofrece quitarlos.
 */
export const CXC_BUSCAR_SIN_FILTRO_ESCONDIDO = true;

/** n.º 20 · «Descargar» deja de ser el botón negro: borde claro. */
export const CXC_DESCARGAR_SECUNDARIO = true;

/** n.º 21 · Un solo nombre para la acción: «Estado de cuenta». */
export const CXC_UN_NOMBRE_ESTADO_DE_CUENTA = true;

/** n.º 108 · Lista de la computadora: nombre completo arriba, «Último pago» debajo. */
export const CXC_NOMBRE_COMPLETO = true;

/** n.º 105 · La tarjeta «Cuentas por cobrar» de Ventas Boston abre la cartera de Boston. */
export const BOSTON_TARJETA_ABRE_BOSTON = true;

/** n.º 50 · Ficha del cliente en el celular: el título «‹ Clientes» vuelve; sin la fila repetida. */
export const CLIENTES_FICHA_TITULO_VUELVE = true;

/** n.º 104 · Un cliente sin código no es enlace: dice «Sin código en Switch». */
export const CLIENTE_SIN_CODIGO_SIN_ENLACE = true;

/**
 * Clientes › lista (filtro-a-3, aprobado): buscador en su línea; debajo
 * «Todos 148 ▾» · «Ordenar ▾» · «Actualizado hh:mm ↻». Sin la fila de chips.
 */
export const CLIENTES_LISTA_DESPLEGABLES = true;

/** n.º 51 · Proveedores: el saldo a favor siempre «−$284.62». */
export const PROVEEDORES_SIGNO_UNICO = true;

/** n.º 52 · Proveedores: «0-90 días · 91-120 días · 121-365 días · +1 año». */
export const PROVEEDORES_TRAMOS_EN_DIAS = true;

/** n.º 53 · Proveedor en el celular: el título «‹ Proveedores» vuelve; sin la fila azul. */
export const PROVEEDORES_TITULO_VUELVE = true;

/** n.º 109 · Consulta de artículos: el stock en cero dice «Agotado» en las dos tablas. */
export const REFERENCIA_AGOTADO = true;

/** n.º 110 · Últimas recepciones en el celular: cada recepción en dos líneas. */
export const REFERENCIA_RECEPCIONES_DOS_LINEAS = true;

/** El botón «Descargar» de la cartera (n.º 20): claro con borde; con el interruptor apagado, el negro de antes. */
export const CLASE_BOTON_DESCARGAR = CXC_DESCARGAR_SECUNDARIO
  ? "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50"
  : "bg-black text-white hover:bg-gray-800";
