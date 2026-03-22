export interface CxcRow {
  id: string;
  upload_id: string;
  company_key: string;
  codigo: string;
  nombre: string;
  nombre_normalized: string;
  correo: string;
  telefono: string;
  celular: string;
  contacto: string;
  pais: string;
  provincia: string;
  distrito: string;
  corregimiento: string;
  limite_credito: number;
  limite_morosidad: number;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d91_120: number;
  d121_180: number;
  d181_270: number;
  d271_365: number;
  mas_365: number;
  total: number;
}

export interface CxcUpload {
  id: string;
  company_key: string;
  filename: string;
  row_count: number;
  uploaded_at: string;
}

export interface ClientOverride {
  id: string;
  nombre_normalized: string;
  correo: string;
  telefono: string;
  celular: string;
  contacto: string;
  updated_at: string;
}

export interface ConsolidatedClient {
  nombre_normalized: string;
  companies: {
    [companyKey: string]: {
      nombre: string;
      codigo: string;
      d0_30: number;
      d31_60: number;
      d61_90: number;
      d91_120: number;
      d121_180: number;
      d181_270: number;
      d271_365: number;
      mas_365: number;
      total: number;
    };
  };
  correo: string;
  telefono: string;
  celular: string;
  contacto: string;
  total: number;
  current: number;    // 0-90
  watch: number;      // 91-180
  overdue: number;    // 181+
  hasOverride: boolean;
}
