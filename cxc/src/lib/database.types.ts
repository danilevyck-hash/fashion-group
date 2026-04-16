// Auto-generated from Supabase SQL schema files
// Do not edit manually — regenerate from SQL migrations

export type Database = {
  public: {
    Tables: {
      // ─── CXC ────────────────────────────────────────────────────────────────
      cxc_uploads: {
        Row: {
          id: string
          company_key: string
          filename: string
          row_count: number
          uploaded_at: string
        }
        Insert: {
          id?: string
          company_key: string
          filename: string
          row_count?: number
          uploaded_at?: string
        }
        Update: {
          id?: string
          company_key?: string
          filename?: string
          row_count?: number
          uploaded_at?: string
        }
      }
      cxc_rows: {
        Row: {
          id: string
          upload_id: string
          company_key: string
          codigo: string | null
          nombre: string | null
          nombre_normalized: string
          correo: string | null
          telefono: string | null
          celular: string | null
          contacto: string | null
          pais: string | null
          provincia: string | null
          distrito: string | null
          corregimiento: string | null
          limite_credito: number | null
          limite_morosidad: number | null
          d0_30: number | null
          d31_60: number | null
          d61_90: number | null
          d91_120: number | null
          d121_180: number | null
          d181_270: number | null
          d271_365: number | null
          mas_365: number | null
          total: number | null
        }
        Insert: {
          id?: string
          upload_id: string
          company_key: string
          codigo?: string | null
          nombre?: string | null
          nombre_normalized: string
          correo?: string | null
          telefono?: string | null
          celular?: string | null
          contacto?: string | null
          pais?: string | null
          provincia?: string | null
          distrito?: string | null
          corregimiento?: string | null
          limite_credito?: number | null
          limite_morosidad?: number | null
          d0_30?: number | null
          d31_60?: number | null
          d61_90?: number | null
          d91_120?: number | null
          d121_180?: number | null
          d181_270?: number | null
          d271_365?: number | null
          mas_365?: number | null
          total?: number | null
        }
        Update: {
          id?: string
          upload_id?: string
          company_key?: string
          codigo?: string | null
          nombre?: string | null
          nombre_normalized?: string
          correo?: string | null
          telefono?: string | null
          celular?: string | null
          contacto?: string | null
          pais?: string | null
          provincia?: string | null
          distrito?: string | null
          corregimiento?: string | null
          limite_credito?: number | null
          limite_morosidad?: number | null
          d0_30?: number | null
          d31_60?: number | null
          d61_90?: number | null
          d91_120?: number | null
          d121_180?: number | null
          d181_270?: number | null
          d271_365?: number | null
          mas_365?: number | null
          total?: number | null
        }
      }
      cxc_client_overrides: {
        Row: {
          id: string
          nombre_normalized: string
          correo: string | null
          telefono: string | null
          celular: string | null
          contacto: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          nombre_normalized: string
          correo?: string | null
          telefono?: string | null
          celular?: string | null
          contacto?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          nombre_normalized?: string
          correo?: string | null
          telefono?: string | null
          celular?: string | null
          contacto?: string | null
          updated_at?: string
        }
      }
      vendor_assignments: {
        Row: {
          id: string
          company_key: string
          client_name: string
          vendor_name: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_key: string
          client_name: string
          vendor_name: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_key?: string
          client_name?: string
          vendor_name?: string
          updated_at?: string
        }
      }

      // ─── GUÍAS DE TRANSPORTE ─────────────────────────────────────────────────
      // Columns from: schema.sql + guias-workflow.sql + guias-firma.sql + add-guias-detalle.sql
      guia_transporte: {
        Row: {
          id: string
          numero: number
          fecha: string
          transportista: string
          placa: string | null
          observaciones: string | null
          created_at: string | null
          // from guias-workflow.sql
          nombre_entregador: string | null
          cedula_entregador: string | null
          // from guias-firma.sql
          firma_transportista: string | null
          // from add-guias-detalle.sql
          monto_total: number | null
          estado: string | null
          tipo_despacho: string | null
          nombre_chofer: string | null
        }
        Insert: {
          id?: string
          numero: number
          fecha: string
          transportista: string
          placa?: string | null
          observaciones?: string | null
          created_at?: string | null
          nombre_entregador?: string | null
          cedula_entregador?: string | null
          firma_transportista?: string | null
          monto_total?: number | null
          estado?: string | null
          tipo_despacho?: string | null
          nombre_chofer?: string | null
        }
        Update: {
          id?: string
          numero?: number
          fecha?: string
          transportista?: string
          placa?: string | null
          observaciones?: string | null
          created_at?: string | null
          nombre_entregador?: string | null
          cedula_entregador?: string | null
          firma_transportista?: string | null
          monto_total?: number | null
          estado?: string | null
          tipo_despacho?: string | null
          nombre_chofer?: string | null
        }
      }
      guia_items: {
        Row: {
          id: string
          guia_id: string
          orden: number
          cliente: string | null
          direccion: string | null
          empresa: string | null
          facturas: string | null
          bultos: number | null
          numero_guia_transp: string | null
        }
        Insert: {
          id?: string
          guia_id: string
          orden: number
          cliente?: string | null
          direccion?: string | null
          empresa?: string | null
          facturas?: string | null
          bultos?: number | null
          numero_guia_transp?: string | null
        }
        Update: {
          id?: string
          guia_id?: string
          orden?: number
          cliente?: string | null
          direccion?: string | null
          empresa?: string | null
          facturas?: string | null
          bultos?: number | null
          numero_guia_transp?: string | null
        }
      }

      // ─── CAJA MENUDA ─────────────────────────────────────────────────────────
      // caja_periodos columns from: schema.sql + migration_caja_mejoras.sql + migration_caja_fondo.sql
      caja_periodos: {
        Row: {
          id: string
          numero: number
          fecha_apertura: string
          fecha_cierre: string | null
          fondo_inicial: number | null
          estado: string | null
          created_at: string | null
          // from migration_caja_mejoras.sql
          repuesto: boolean | null
          repuesto_at: string | null
        }
        Insert: {
          id?: string
          numero: number
          fecha_apertura: string
          fecha_cierre?: string | null
          fondo_inicial?: number | null
          estado?: string | null
          created_at?: string | null
          repuesto?: boolean | null
          repuesto_at?: string | null
        }
        Update: {
          id?: string
          numero?: number
          fecha_apertura?: string
          fecha_cierre?: string | null
          fondo_inicial?: number | null
          estado?: string | null
          created_at?: string | null
          repuesto?: boolean | null
          repuesto_at?: string | null
        }
      }
      // caja_gastos columns from: schema.sql + migration_caja_mejoras.sql + add-caja-categoria.sql + migration_caja_campos.sql
      caja_gastos: {
        Row: {
          id: string
          periodo_id: string
          fecha: string
          nombre: string | null
          ruc: string | null
          dv: string | null
          factura: string | null
          subtotal: number | null
          itbms: number | null
          total: number | null
          created_at: string | null
          // from migration_caja_mejoras.sql
          categoria: string | null
          responsable: string | null
          // from add-caja-categoria.sql
          empresa: string | null
          // from migration_caja_campos.sql
          descripcion: string | null
          proveedor: string | null
          nro_factura: string | null
        }
        Insert: {
          id?: string
          periodo_id: string
          fecha: string
          nombre?: string | null
          ruc?: string | null
          dv?: string | null
          factura?: string | null
          subtotal?: number | null
          itbms?: number | null
          total?: number | null
          created_at?: string | null
          categoria?: string | null
          responsable?: string | null
          empresa?: string | null
          descripcion?: string | null
          proveedor?: string | null
          nro_factura?: string | null
        }
        Update: {
          id?: string
          periodo_id?: string
          fecha?: string
          nombre?: string | null
          ruc?: string | null
          dv?: string | null
          factura?: string | null
          subtotal?: number | null
          itbms?: number | null
          total?: number | null
          created_at?: string | null
          categoria?: string | null
          responsable?: string | null
          empresa?: string | null
          descripcion?: string | null
          proveedor?: string | null
          nro_factura?: string | null
        }
      }
      caja_responsables: {
        Row: {
          id: string
          nombre: string
          activo: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          nombre: string
          activo?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          nombre?: string
          activo?: boolean | null
          created_at?: string | null
        }
      }

      // ─── RECLAMOS ────────────────────────────────────────────────────────────
      reclamos: {
        Row: {
          id: string
          nro_reclamo: string
          empresa: string
          proveedor: string
          marca: string
          nro_factura: string
          nro_orden_compra: string | null
          fecha_reclamo: string
          estado: string | null
          notas: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          nro_reclamo: string
          empresa: string
          proveedor: string
          marca: string
          nro_factura: string
          nro_orden_compra?: string | null
          fecha_reclamo: string
          estado?: string | null
          notas?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          nro_reclamo?: string
          empresa?: string
          proveedor?: string
          marca?: string
          nro_factura?: string
          nro_orden_compra?: string | null
          fecha_reclamo?: string
          estado?: string | null
          notas?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      reclamo_items: {
        Row: {
          id: string
          reclamo_id: string
          referencia: string | null
          descripcion: string | null
          talla: string | null
          cantidad: number | null
          precio_unitario: number | null
          subtotal: number | null
          motivo: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          reclamo_id: string
          referencia?: string | null
          descripcion?: string | null
          talla?: string | null
          cantidad?: number | null
          precio_unitario?: number | null
          subtotal?: number | null
          motivo?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          reclamo_id?: string
          referencia?: string | null
          descripcion?: string | null
          talla?: string | null
          cantidad?: number | null
          precio_unitario?: number | null
          subtotal?: number | null
          motivo?: string | null
          created_at?: string | null
        }
      }
      reclamo_fotos: {
        Row: {
          id: string
          reclamo_id: string
          storage_path: string
          url: string
          created_at: string | null
        }
        Insert: {
          id?: string
          reclamo_id: string
          storage_path: string
          url: string
          created_at?: string | null
        }
        Update: {
          id?: string
          reclamo_id?: string
          storage_path?: string
          url?: string
          created_at?: string | null
        }
      }
      reclamo_seguimiento: {
        Row: {
          id: string
          reclamo_id: string
          nota: string
          autor: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          reclamo_id: string
          nota: string
          autor?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          reclamo_id?: string
          nota?: string
          autor?: string | null
          created_at?: string | null
        }
      }
      reclamo_contactos: {
        Row: {
          id: string
          empresa: string
          nombre: string | null
          whatsapp: string | null
          correo: string | null
          activo: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          empresa: string
          nombre?: string | null
          whatsapp?: string | null
          correo?: string | null
          activo?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          empresa?: string
          nombre?: string | null
          whatsapp?: string | null
          correo?: string | null
          activo?: boolean | null
          created_at?: string | null
        }
      }

      // ─── CHEQUES ─────────────────────────────────────────────────────────────
      cheques: {
        Row: {
          id: string
          cliente: string
          empresa: string
          banco: string
          numero_cheque: string
          monto: number
          fecha_deposito: string
          notas: string | null
          estado: string | null
          fecha_depositado: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          cliente: string
          empresa: string
          banco: string
          numero_cheque: string
          monto: number
          fecha_deposito: string
          notas?: string | null
          estado?: string | null
          fecha_depositado?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          cliente?: string
          empresa?: string
          banco?: string
          numero_cheque?: string
          monto?: number
          fecha_deposito?: string
          notas?: string | null
          estado?: string | null
          fecha_depositado?: string | null
          created_at?: string | null
        }
      }

      // ─── VENTAS ──────────────────────────────────────────────────────────────
      ventas_clientes: {
        Row: {
          id: string
          empresa: string
          año: number
          mes: number
          cliente: string
          ventas: number
        }
        Insert: {
          id?: string
          empresa: string
          año: number
          mes: number
          cliente: string
          ventas?: number
        }
        Update: {
          id?: string
          empresa?: string
          año?: number
          mes?: number
          cliente?: string
          ventas?: number
        }
      }
      ventas_metas: {
        Row: {
          id: string
          empresa: string
          año: number
          mes: number
          meta: number
        }
        Insert: {
          id?: string
          empresa: string
          año: number
          mes: number
          meta?: number
        }
        Update: {
          id?: string
          empresa?: string
          año?: number
          mes?: number
          meta?: number
        }
      }

      // ─── DIRECTORIO ──────────────────────────────────────────────────────────
      // directorio_clientes columns from: migration_directorio.sql + add-directorio-whatsapp.sql
      directorio_clientes: {
        Row: {
          id: string
          nombre: string
          empresa: string | null
          telefono: string | null
          celular: string | null
          correo: string | null
          contacto: string | null
          notas: string | null
          created_at: string | null
          // from add-directorio-whatsapp.sql
          whatsapp: string | null
        }
        Insert: {
          id?: string
          nombre: string
          empresa?: string | null
          telefono?: string | null
          celular?: string | null
          correo?: string | null
          contacto?: string | null
          notas?: string | null
          created_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          id?: string
          nombre?: string
          empresa?: string | null
          telefono?: string | null
          celular?: string | null
          correo?: string | null
          contacto?: string | null
          notas?: string | null
          created_at?: string | null
          whatsapp?: string | null
        }
      }

      // ─── ACTIVITY LOGS ───────────────────────────────────────────────────────
      activity_logs: {
        Row: {
          id: string
          user_role: string
          action: string
          entity_type: string | null
          entity_id: string | null
          details: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_role: string
          action: string
          entity_type?: string | null
          entity_id?: string | null
          details?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_role?: string
          action?: string
          entity_type?: string | null
          entity_id?: string | null
          details?: string | null
          created_at?: string | null
        }
      }

      // ─── PRÉSTAMOS ───────────────────────────────────────────────────────────
      prestamos_empleados: {
        Row: {
          id: string
          nombre: string
          empresa: string | null
          deduccion_quincenal: number
          notas: string | null
          activo: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          nombre: string
          empresa?: string | null
          deduccion_quincenal?: number
          notas?: string | null
          activo?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          nombre?: string
          empresa?: string | null
          deduccion_quincenal?: number
          notas?: string | null
          activo?: boolean | null
          created_at?: string | null
        }
      }
      prestamos_movimientos: {
        Row: {
          id: string
          empleado_id: string | null
          fecha: string
          concepto: string
          monto: number
          notas: string | null
          estado: string
          aprobado_por: string | null
          created_by: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          empleado_id?: string | null
          fecha: string
          concepto: string
          monto: number
          notas?: string | null
          estado?: string
          aprobado_por?: string | null
          created_by?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          empleado_id?: string | null
          fecha?: string
          concepto?: string
          monto?: number
          notas?: string | null
          estado?: string
          aprobado_por?: string | null
          created_by?: string | null
          created_at?: string | null
        }
      }

      // ─── ROLES / AUTH ────────────────────────────────────────────────────────
      role_passwords: {
        Row: {
          role: string
          password: string
          updated_at: string | null
        }
        Insert: {
          role: string
          password: string
          updated_at?: string | null
        }
        Update: {
          role?: string
          password?: string
          updated_at?: string | null
        }
      }
      role_permissions: {
        Row: {
          id: string
          role: string
          modulos: string[] | null
          activo: boolean | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          role: string
          modulos?: string[] | null
          activo?: boolean | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          role?: string
          modulos?: string[] | null
          activo?: boolean | null
          updated_at?: string | null
        }
      }

      // ─── REEBOK / PRODUCTS ───────────────────────────────────────────────────
      products: {
        Row: {
          id: string
          sku: string | null
          name: string
          description: string | null
          price: number | null
          category: string
          gender: string | null
          sub_category: string | null
          color: string | null
          image_url: string | null
          active: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          sku?: string | null
          name: string
          description?: string | null
          price?: number | null
          category?: string
          gender?: string | null
          sub_category?: string | null
          color?: string | null
          image_url?: string | null
          active?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          sku?: string | null
          name?: string
          description?: string | null
          price?: number | null
          category?: string
          gender?: string | null
          sub_category?: string | null
          color?: string | null
          image_url?: string | null
          active?: boolean | null
          created_at?: string | null
        }
      }
      inventory: {
        Row: {
          id: string
          product_id: string | null
          size: string
          quantity: number | null
        }
        Insert: {
          id?: string
          product_id?: string | null
          size: string
          quantity?: number | null
        }
        Update: {
          id?: string
          product_id?: string | null
          size?: string
          quantity?: number | null
        }
      }
      reebok_orders: {
        Row: {
          id: string
          order_number: string
          client_name: string
          vendor_name: string | null
          comment: string | null
          total: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          order_number: string
          client_name: string
          vendor_name?: string | null
          comment?: string | null
          total?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          order_number?: string
          client_name?: string
          vendor_name?: string | null
          comment?: string | null
          total?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      reebok_order_items: {
        Row: {
          id: string
          order_id: string | null
          product_id: string
          sku: string | null
          name: string | null
          image_url: string | null
          quantity: number | null
          unit_price: number
          created_at: string | null
        }
        Insert: {
          id?: string
          order_id?: string | null
          product_id: string
          sku?: string | null
          name?: string | null
          image_url?: string | null
          quantity?: number | null
          unit_price: number
          created_at?: string | null
        }
        Update: {
          id?: string
          order_id?: string | null
          product_id?: string
          sku?: string | null
          name?: string | null
          image_url?: string | null
          quantity?: number | null
          unit_price?: number
          created_at?: string | null
        }
      }

      // ─── CAMISETAS ───────────────────────────────────────────────────────────
      camisetas_productos: {
        Row: {
          id: string
          nombre: string
          genero: string
          color: string
          precio_panama: number
          rrp: number
          stock_comprado: number
          created_at: string | null
        }
        Insert: {
          id?: string
          nombre: string
          genero: string
          color: string
          precio_panama: number
          rrp: number
          stock_comprado?: number
          created_at?: string | null
        }
        Update: {
          id?: string
          nombre?: string
          genero?: string
          color?: string
          precio_panama?: number
          rrp?: number
          stock_comprado?: number
          created_at?: string | null
        }
      }
      // camisetas_clientes columns from: camisetas.sql + camisetas-estado.sql
      camisetas_clientes: {
        Row: {
          id: string
          nombre: string
          created_at: string | null
          // from camisetas-estado.sql
          estado: string | null
        }
        Insert: {
          id?: string
          nombre: string
          created_at?: string | null
          estado?: string | null
        }
        Update: {
          id?: string
          nombre?: string
          created_at?: string | null
          estado?: string | null
        }
      }
      camisetas_pedidos: {
        Row: {
          id: string
          cliente_id: string | null
          producto_id: string | null
          paquetes: number
          created_at: string | null
        }
        Insert: {
          id?: string
          cliente_id?: string | null
          producto_id?: string | null
          paquetes?: number
          created_at?: string | null
        }
        Update: {
          id?: string
          cliente_id?: string | null
          producto_id?: string | null
          paquetes?: number
          created_at?: string | null
        }
      }

      // ─── USER SYSTEM (fg_*) ──────────────────────────────────────────────────
      fg_users: {
        Row: {
          id: string
          name: string
          password: string
          role: string
          active: boolean | null
          associated_company: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          password: string
          role?: string
          active?: boolean | null
          associated_company?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          password?: string
          role?: string
          active?: boolean | null
          associated_company?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      fg_user_modules: {
        Row: {
          id: string
          user_id: string | null
          module_key: string
          enabled: boolean | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          module_key: string
          enabled?: boolean | null
        }
        Update: {
          id?: string
          user_id?: string | null
          module_key?: string
          enabled?: boolean | null
        }
      }
      fg_user_module_order: {
        Row: {
          id: string
          user_id: string | null
          module_order: string[] | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          module_order?: string[] | null
        }
        Update: {
          id?: string
          user_id?: string | null
          module_order?: string[] | null
        }
      }
      fg_audit_log: {
        Row: {
          id: string
          user_id: string | null
          user_name: string | null
          action: string
          module: string | null
          details: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          user_name?: string | null
          action: string
          module?: string | null
          details?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          user_name?: string | null
          action?: string
          module?: string | null
          details?: string | null
          created_at?: string | null
        }
      }
    }
  }
}

// Convenience type aliases
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
