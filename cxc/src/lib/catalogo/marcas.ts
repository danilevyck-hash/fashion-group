// Config por marca de catálogo para el flujo de pedidos (checkout + envío a
// Switch). SERVER-ONLY (importa los clients service-role) — no importar desde
// componentes cliente.

import type { SupabaseClient } from "@supabase/supabase-js";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { joybeesServer } from "@/lib/joybees-supabase-server";
import { getBultoSize as reebokBulto } from "@/lib/reebok-bulto";
import { getBultoSize as joybeesBulto } from "@/lib/joybees-bulto";

export interface MarcaConfig {
  marca: "reebok" | "joybees";
  label: string;
  empresaKey: string;
  db: SupabaseClient;
  ordersTable: string;
  itemsRelation: string; // nombre de la relación embebida en selects
  enviosTable: string;
  productsTable: string;
  createOrderRpc: string;
  bultoSize: (category: string | null | undefined) => number;
  /** Defaults del piloto — SOLO Reebok legacy (pedidos creados antes del
   *  checkout, sin cliente/vendedor guardados). Joybees no tiene legacy. */
  fallback: { clienteId: number; clienteNombre: string; vendedorId: number; vendedorNombre: string } | null;
}

export const MARCAS_CONFIG: Record<string, MarcaConfig> = {
  reebok: {
    marca: "reebok",
    label: "Reebok",
    empresaKey: "active_shoes",
    db: reebokServer,
    ordersTable: "reebok_orders",
    itemsRelation: "reebok_order_items",
    enviosTable: "reebok_switch_envios",
    productsTable: "products",
    createOrderRpc: "reebok_create_order",
    bultoSize: (c) => reebokBulto(c || "apparel"),
    fallback: { clienteId: 1, clienteNombre: "Contado", vendedorId: 2, vendedorNombre: "Reinaldo Espinosa" },
  },
  joybees: {
    marca: "joybees",
    label: "Joybees",
    empresaKey: "joystep",
    db: joybeesServer,
    ordersTable: "joybees_orders",
    itemsRelation: "joybees_order_items",
    enviosTable: "joybees_switch_envios",
    productsTable: "joybees_products",
    createOrderRpc: "joybees_create_order",
    bultoSize: () => joybeesBulto(),
    fallback: null,
  },
};
