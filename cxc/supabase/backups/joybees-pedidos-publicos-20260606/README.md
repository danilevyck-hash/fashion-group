# Backup — Borrado backend muerto Joybees (G5 Sprint A, 2026-06-06)

El flujo público de Joybees nunca guardó pedidos reales (el endpoint POST estaba
desconectado, cero callers). En este PR se eliminó el código muerto; la tabla
`joybees_pedidos_publicos` queda huérfana y se dropea **a mano después del deploy**.

## Contenido
| Archivo | Qué es |
|---|---|
| `joybees_pedidos_publicos.json` | Datos exportados (**0 filas** — estaba vacía) |
| `drop_joybees_pedidos_publicos.sql` | Verificación FKs + DROP — aplicar **después** del deploy del merge |

## Orden
1. Merge del PR `fix/grupo5-sprint-a` → deploy Vercel.
2. Confirmar deploy OK en producción.
3. Correr `drop_joybees_pedidos_publicos.sql`: primero la verificación de FKs, luego el DROP.

El catálogo público de Joybees y su botón de WhatsApp **siguen vivos** — solo se
borró la infraestructura de "pedidos" que nunca se cableó.
