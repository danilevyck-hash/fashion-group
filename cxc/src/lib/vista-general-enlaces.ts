// Vista general › alertas (#36, 16-nov-2026): cada fila lleva a donde dice.
// Cuentas por cobrar ya acepta `?search=` y `?empresa=`; Proveedores, `?empresa=`
// (despliega esa empresa). Sin dato, el módulo a secas.

/** El cliente con +90 días → Cuentas por cobrar buscándolo, en su empresa. */
export function enlaceClienteCxc(c: { nombre: string; empresaKey?: string }): string {
  const p = new URLSearchParams();
  const nombre = c.nombre.trim();
  if (nombre && nombre !== "—") p.set("search", nombre);
  if (c.empresaKey) p.set("empresa", c.empresaKey);
  const q = p.toString();
  return q ? `/cxc?${q}` : "/cxc";
}

/** El proveedor con +90 días → Proveedores con su empresa desplegada. */
export function enlaceProveedor(p: { empresaKey?: string }): string {
  return p.empresaKey ? `/proveedores?empresa=${encodeURIComponent(p.empresaKey)}` : "/proveedores";
}
