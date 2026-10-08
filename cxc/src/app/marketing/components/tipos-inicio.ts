// Los tipos de la respuesta de `GET /api/marketing/inicio` (los usan la
// página de la marca, el detalle del período y el cierre). Salieron de la
// portada vieja `InicioMarketing` cuando se borró (8-oct-2026).

export interface MontoInicio {
  count: number;
  total: number;
}

export interface BloqueResumen {
  key: string;
  nombre: string;
  periodoAbierto: { id: string | null; nombre: string } | null;
  facturas: MontoInicio;
  muebles: MontoInicio;
  total: number;
  proyectos: number;
  /** Gastos sin el papel que respalda la plata. Los lleva TODO gasto. */
  sinComprobante?: number;
  /** Gastos sin foto de instalación. Solo los que tienen cliente. */
  sinFoto?: number;
  /** Lo apagado con «¿Se reporta a la marca?» (rediseño). Ausente = cero. */
  noReportado?: MontoInicio | null;
}

export interface PeriodoCerradoResumen {
  id: string | null;
  bloqueKey: string;
  bloqueNombre: string;
  nombre: string;
  cerradoEn: string | null;
  facturas: MontoInicio;
  muebles: MontoInicio;
  total: number;
  noReportado?: MontoInicio | null;
}

export interface FilaClienteInicio {
  cliente: string;
  clienteCodigo: string | null;
  porBloque: Record<string, number>;
  total: number;
}

export interface MarcaInicio {
  id: string;
  nombre: string;
  codigo: string;
}

export interface DatosInicio {
  bloques: BloqueResumen[];
  cerrados: PeriodoCerradoResumen[];
  resumen: { total: number; proyectos: number; clientes: number };
  porCliente: FilaClienteInicio[];
  porMarca: Record<string, number>;
  marcas: MarcaInicio[];
  conPeriodos: boolean;
  mobiliario: { entregas: number; total: number };
  impulsadoras: { count: number | null; montoMensual: number | null };
}

