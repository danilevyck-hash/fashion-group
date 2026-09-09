// ─────────────────────────────────────────────────────────────────────────────
// LA FORMA DEL ESTADO DE CUENTA, EN UN SOLO LUGAR (9-sep-2026).
//
// 🩸 Estaba escrita DOS VECES: el servidor la declaraba en
// `lib/cxc/estado-cuenta-data.ts` y la pantalla la volvía a declarar en
// `app/cxc/components/EstadoCuentaDrawer.tsx`, que es de donde la importaban el
// PDF y las dos rutas de correo. Agregar un campo en una y no en la otra no
// rompe nada: simplemente el papel deja de verlo.
//
// Son tipos puros, sin una sola línea de I/O: los puede importar el servidor y
// el navegador.
// ─────────────────────────────────────────────────────────────────────────────

export interface EstadoDocumento {
  numero: string;
  fecha: string | null;
  tipo: string;
  monto: number;          // total del documento (positivo)
  saldo: number;          // con signo (crédito negativo)
  dias: number | null;    // edad desde su emisión — NO mora
  /** 🔴 Los que imprime el papel de Switch. Ya venían de Switch y nadie los
   *  miraba: `debito − credito` de cada fila da exactamente el saldo firmado. */
  debito: number;
  credito: number;
  /** Días de crédito; de acá sale la fecha de vencimiento (Switch no la manda). */
  plazoCredito: number | null;
  /** El número fiscal del documento electrónico, para el renglón gris de abajo. */
  numeroFiscal: string | null;
}

export interface EstadoEmpresa {
  empresa_key: string;
  empresa_nombre: string;
  documentos: EstadoDocumento[];
  subtotal: number;
  /** Lo que Switch dice que debe este cliente en esta empresa. `null` = todavía
   *  no lo trajo el sync (o la DDL no corrió): sin dato NO se afirma nada. */
  saldoSwitch: number | null;
}

/** Lo que el papel de Switch pone arriba, del lado del cliente. Todo sale de
 *  `switch_clientes`; lo que falte va en blanco, nunca inventado. */
export interface FichaCliente {
  nombre: string;
  identificacion: string;
  telefono: string;
  email: string;
  direccion: string;
  limiteCredito: number | null;
  tiempoMorosidad: number | null;
}

export interface EstadoCuenta {
  codigo: string;
  /** El nombre COMO LO ESCRIBE SWITCH («City Mall Paso Canoa»), no el
   *  normalizado que usa la pantalla para parear («CITY MALL PASO CANOA»). */
  clienteNombre: string;
  cliente: FichaCliente;
  empresas: EstadoEmpresa[];
  total: number;
  generadoEn: string;
}

export const FICHA_CLIENTE_VACIA: FichaCliente = {
  nombre: "",
  identificacion: "",
  telefono: "",
  email: "",
  direccion: "",
  limiteCredito: null,
  tiempoMorosidad: null,
};
