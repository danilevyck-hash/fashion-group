# El sistema, módulo por módulo

> Escrito el **4-sep-2026** por encargo de Daniel: *«te pedí que leas todos los módulos y así vas
> teniendo un documento con todo. Cada uno, cada detalle. Así podrás hacerme mejores
> recomendaciones y sugerencias y no tener que estar suponiendo. Cuando tengas todos los módulos
> al 100% hablamos. Así también sabrás qué conecta con qué.»*

**13.193 líneas, 22 módulos, todo medido contra producción.** Esto es la **referencia**: lo que
HAY. Las sugerencias de mejora viven aparte, en [`docs/eficiencia/`](../eficiencia/README.md).

Cada módulo trae catorce secciones: qué es · quién entra · las pantallas con sus campos exactos ·
los datos columna por columna (quién escribe, quién lee, cuántas filas, cuáles nadie lee) · de
dónde vienen los datos · las reglas ya fijadas con su candado · **con qué conecta en las dos
direcciones** · por qué está así (con las citas de Daniel) · lo que se intentó y se retiró ·
cuánto se usa · qué papeles y Excel produce · cómo probarlo a mano · **qué lo rompe y cómo se
notaría** · lo que sobra.

| Archivo | Módulos |
|---|---|
| [01-ventas-y-clientes.md](01-ventas-y-clientes.md) | Vista General · Ventas (5 pestañas) · Cuentas por Cobrar · Clientes · Proveedores |
| [02-catalogos-y-depurador.md](02-catalogos-y-depurador.md) | Catálogos (4 marcas, pedidos, Comprobantes) · Referencia · Depurador |
| [03-multifashion-y-boston.md](03-multifashion-y-boston.md) | Multifashion · Confecciones Boston |
| [04-operacion.md](04-operacion.md) | Guías · Packing Lists · Reclamos · Marketing y Mobiliario · Caja Menuda |
| [05-asistencia-comisiones-gastos.md](05-asistencia-comisiones-gastos.md) | Asistencia y Planilla · Comisiones · Gastos |
| [06-recordatorios-usuarios-infra.md](06-recordatorios-usuarios-infra.md) | Recordatorios · Usuarios · Data Health · **y lo transversal**: entrar al sistema, la navegación, la búsqueda global, las alertas de Telegram, los crons, los backups, Switch |
| [07-prestamos.md](07-prestamos.md) | Préstamos |

---

## Lo urgente que salió de aquí

1. 🔴 **El módulo Asistencia entero está fuera del respaldo**, incluidas las **6.081 marcaciones del reloj**, que son append-only y no se pueden recuperar de ninguna otra parte. Tampoco se respaldan Gastos, Saldos de banco, `comision_exclusion`, `recordatorios` ni los catálogos de Tommy, Calvin y Joybees (Reebok sí). ~30 tablas escritas por personas, sin copia. → [06](06-recordatorios-usuarios-infra.md)
2. 🔴 **El aviso «Sincronizado» de Ventas vigila 3 de las 8 empresas** (`SWITCH_FACTURAS_EMPRESA_KEYS` quedó en `active_shoes, active_wear, american_classic`). Si Vistana o Fashion Wear se congelan, el Resumen muestra números viejos en verde. → [01](01-ventas-y-clientes.md)
3. 🔴 **`switch_clientes` de Boston lleva 37 días congelada** (`synced_at = 30-jul-2026` en las 4.915 filas) y **ningún vigía la cubre**. La pestaña Clientes de David muestra un maestro de julio. → [03](03-multifashion-y-boston.md)
4. 🔴 **Reclamos y Proveedores se unen por NOMBRE, en JavaScript, sin candado.** Cambiar una grafía deja la ficha de un proveedor en cero reclamos, en silencio. El amarre correcto es por **(empresa, código)**: el mismo proveedor tiene código distinto en cada empresa, y el `122` es dos proveedores distintos según la empresa. → [04](04-operacion.md)
5. 🔴 **`empleado_codigo` de Préstamos no se puede editar desde ninguna pantalla**, y el aviso de la planilla dice que sí («se atan en Préstamos, eligiendo la persona de la ficha»). Hoy: **$400 de deuda viva sin atar** (Martha $300, Yeritza $100). → [07](07-prestamos.md)
6. **`POST /api/ventas/referencia/actualizar` es una ruta huérfana que abre sesión en Switch** y expulsa a Daniel del panel. Su botón se borró el 11-ago-2026. → [02](02-catalogos-y-depurador.md)
7. **El literal `"Pagado"` de Reclamos vive suelto en cuatro lugares** entre SQL y TypeScript. Cambiar uno hace que reclamos ya pagados vuelvan al Excel del proveedor — o sea, cobrarle dos veces. → [04](04-operacion.md)

## Lo que la documentación tenía viejo, y ya se corrigió aquí

- Las **13 migraciones desde `20260909` están todas aplicadas**; `CLAUDE.md` marcaba siete como pendientes.
- `vercel.json` tiene **80** entradas de cron, no 79; falta documentar `cleanup-depurador-archivos` (03:20 UTC).
- El **resumen mensual del grupo** sale el **día 1** por el chat privado, no el día 3 por 📊 NEGOCIO.
- Los productos de **Reebok NO viven en otro proyecto Supabase**: `NEXT_PUBLIC_REEBOK_SUPABASE_URL` apunta al principal.
- `VE_SUELDOS_DE_BOSTON` está en **`true`** desde el 3-sep: David sí ve los sueldos de su planilla.
- La comisión de **Multifashion es 0,5% sobre las ventas de CONTADO** (`subtotal_comision`), no sobre todo el subtotal firmado.
- `switch-flujo.md` §9 nombra una RPC `comision_cobro_v3` que **no existe**.
- **Andrea tiene `multifashion` en su override** y ve el módulo completo: «Multifashion es de Jennifer» estaba incompleto.

## Decisiones que solo puede tomar Daniel

- **Favoritos ⭐ del CXC**: cero filas en toda su historia, y un vendedor que sí ve el CXC recibe **403** al tocarlos. ¿Se quitan?
- **Packing Lists**: 0 filas desde el 22-abr, un cron limpiándolo a diario, y un texto en pantalla que promete 7 días cuando la regla es 90.
- **Recordatorios**: 0 filas desde que existe; el flujo que Daniel pidió (crear tocando el día del calendario) nunca se construyó.
- **Marketing**: ningún proyecto se cerró jamás (25 abiertos), 71 de 88 facturas en «creado», y `mk_periodos.reporte` está NULL incluso en el único período cerrado — el Excel de un período «congelado» se recalcula en vivo.
- **Basura de pruebas en catálogos**: 16 pedidos de Calvin (12-ago) y 16 de Joybees con vendedor «medicion» (13-ago).
- **Una sesión `admin` sin revocar** de un usuario que no existe en `fg_users` (`medicion-t203b`, último uso 27-ago). El vínculo `user_sessions ↔ fg_users` es **por nombre**, así que ni el guard de «no dejar el sistema sin admins» ni «Revocar todas» la ven.
