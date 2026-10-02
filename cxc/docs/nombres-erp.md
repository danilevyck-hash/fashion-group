# Nombres de ERP — glosario obligatorio

> Daniel, 1-oct-2026: «no los raros que inventas, no se ve profesional».

**Regla:** en pantallas, pestañas, columnas, botones, modales, chips, avisos, PDF y Excel van **nombres normales de un ERP**: sustantivos cortos y estándar. Nada inventado, narrativo ni coloquial («Lo que va en el camión», «Quiénes deben», «Pierde plata»). **Mayúscula solo en la primera palabra** («Cuentas por cobrar», no «Cuentas por Cobrar»), salvo nombres propios (Switch, Fashion Group, Boston). Tuteo, nunca voseo.

Complementa [docs/diccionario.md](diccionario.md) (formatos y las diez decisiones del 5-sep-2026: fechas, plata, porcentajes, nombres de empresa). ⚠️ Dos choques que Daniel tiene que confirmar: «Última sincronización» (aquí, 1-oct) vs «Actualizado hace X» (diccionario §1.7), y Marketing › Mobiliario «Tienda» (audit 1-oct) vs «Cliente» (diccionario §0 n.º 2).

Antes de nombrar algo nuevo, busca aquí el término. Si el concepto no está, usa el nombre que usaría SAP/Odoo en español y agrégalo a esta tabla.

## Un término por concepto

| Concepto | Término | No usar |
|---|---|---|
| Persona de la planilla | Colaborador | Empleado, Persona |
| Lo que alguien adeuda | Saldo · Saldo a favor · Saldo final | Debe, Quiénes deben, Queda en caja, Por cobrar (en préstamos) |
| Cartera de clientes | Cuentas por cobrar (sigla CxC solo si no cabe) | Cuentas por Cobrar, Por cobrar, CXC |
| Cartera de proveedores | Cuentas por pagar | Por pagar (CXP) |
| El grupo completo | Fashion Group · Intercompañía (ventas internas) | Grupo · 6 empresas, Del grupo, también en el grupo |
| Razón social | Empresa | Compañía |
| Cierre estimado | Proyección de cierre | Cierre del año, Cierra, Cierra en |
| Documentos abiertos del cliente | Estado de cuenta · Enviar estado de cuenta | Ver los documentos, Cobrar |
| Texto libre / razón | Observaciones · Motivo | Nota, Por qué, Qué pasó |
| Columna de cantidad | Cantidad (en texto: «unidades») | Piezas, Pzas, Unidades (como encabezado) |
| Mandar algo | Enviar | Mandar |
| Escoger filas | Seleccionar · N seleccionados | Elegir, N elegidos |
| Quitar un registro | Eliminar (Anular solo documentos con número) | Borrar |
| Correo electrónico / URL | Correo · Enlace | email, link |
| Relacionar dos registros | Vincular · Sin vincular | Atar, Sin atar |
| Apuntar un pago | Registrar abono | Anotar abono |
| Estado de una persona/cliente | Activo · Inactivo | Trabaja aquí, Ya no trabaja, Dormidos |
| Producto no visible | Oculto · Ocultar | Escondido, Esconder |
| Cheque no pagado | Devuelto · Motivo de devolución | Rebotado, rebote |
| Dato traído de Switch | Última sincronización | Actualizado desde Switch el |
| Venta media | Ticket promedio · Tickets | Ticket prom., tkt prom, tiquetes |
| Rol con acceso total | Administrador | Admin |
| Sacar de una lista sin borrar el dato | Quitar (Eliminar es definitivo) | Borrar |
| Cancelar una acción | Cancelar | Mejor no |
| Fechas | Fecha · Fecha de ingreso · Fecha de salida | Día (como columna de fecha), Empezó, Su último día |

## Palabras prohibidas en textos visibles

Candado: `src/__tests__/lib/nombres-erp-prohibidos.test.ts` (barre los `.tsx` de `src/app` y `src/components`).

| Prohibido | Reemplazo |
|---|---|
| Mandar | Enviar |
| Atar cliente · Sin atar · sin atar a nadie | Vincular cliente · Sin vincular |
| Anotar abono | Registrar abono |
| Rebotado / Marcar como Rebotado | Devuelto / Marcar como devuelto |
| Quiénes deben · Solo los que deben · No deben nada | Saldos · Con saldo · Sin saldo |
| Elegir algunos · Dejar de elegir | Seleccionar · Cancelar selección |
| Pierde plata · Mejor no · Nada por aquí aún | Pérdida · Cancelar · Sin registros |
| Cuentas por Cobrar · Caja Menuda · Vista General · Nuevo Usuario (mayúsculas de título) | Cuentas por cobrar · Caja menuda · Vista general · Nuevo usuario |
| Voseo (elegí, podés, tenés, tocá…) | Tuteo (elige, puedes, tienes, toca…) |
