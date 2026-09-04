# Eficiencia por módulo — el mapa del sistema, módulo por módulo

> Escrito el **4-sep-2026** por encargo de Daniel: *«ve módulo por módulo para que me des
> sugerencias de eficiencia. Quiero que se vea todo, se recomiende y se documente para que
> cuando abra una nueva sesión, o cambie de computadora, ya tengas todo el contexto.»*

Cuatro archivos, uno por familia de módulos. Cada módulo trae: **qué es y quién lo usa** ·
**uso medido contra producción** · **cómo funciona por dentro** (lo que hay que saber para no
romperlo) · **la tarea más frecuente con sus pasos contados** · **sugerencias** con el ahorro
estimado y el tamaño · **lo raro que se encontró**.

| Archivo | Módulos |
|---|---|
| [01-ventas-y-clientes.md](01-ventas-y-clientes.md) | Vista General · Ventas (5 pestañas) · Cuentas por Cobrar · Clientes · Proveedores |
| [02-catalogos-multifashion-boston.md](02-catalogos-multifashion-boston.md) | Catálogos (4 marcas, pedidos, Comprobantes) · Multifashion · Confecciones Boston · Referencia |
| [03-operacion-diaria.md](03-operacion-diaria.md) | Guías · Packing Lists · Reclamos · Marketing y Mobiliario · Caja Menuda · Depurador |
| [04-plata-y-administracion.md](04-plata-y-administracion.md) | Asistencia y Planilla · Comisiones · Gastos · Préstamos · Recordatorios · Usuarios y Data Health |

**Reglas con que se escribió:** cero afirmación sin dato (donde no se pudo medir, lo dice);
«nada que proponer» es una respuesta legítima; y no se propone nada que Daniel ya cerró —
notificaciones y badges (*«eso no sirve, solo crea ruido»*), presets de quincena, fusionar
Multifashion con Comisiones, Modo Viaje.

---

## Lo urgente, en una línea cada uno

1. ✅ **CERRADO el 4-sep-2026 — Depurador: el divisor ya se valida en la pantalla.** `70` en vez de `0.70` ahora marca el campo en rojo, dice «Debe estar entre 0.10 y 1.00. ¿Quisiste poner 0.70?» y apaga la descarga (el mismo `validarDivisor` de las rutas, reusado). De paso: la tasa es un select de dos («solo existen esas dos»), los precios a mano se conservan por referencia de artículo («y también consérvalos») y la config se recuerda entre corridas. Candado + 10 mutaciones cazadas. (Era: `70` descargaba un Excel con precios **100× mal** que se subía a Switch, con `validarDivisor` corriendo solo al guardar fórmulas por API; 50-60 corridas/mes.) → [03](03-operacion-diaria.md) y el postmortem de catálogos.
2. ✅ **Un cliente que Switch ya borró se sigue ofreciendo.** Cerrado el 4-sep-2026 («APROBADO»): `clientes_master.ausente_desde` (migración `20260919120000`, pendiente de aplicar), el sync marca/desmarca solo con protección en capas, los selectores dejan de ofrecerlo y la ficha dice «Ya no está en Switch» con fecha. 14/14 mutaciones cazadas. Detalle en el postmortem de [ventas-referencia](../postmortems/ventas-referencia.md). → [01](01-ventas-y-clientes.md)
3. **CXC lee el contacto de una tabla congelada** (`cxc_client_overrides`, 10 filas, sin escritor desde el 22-mar) **antes** que de la ficha del cliente: un correo corregido puede perder contra el viejo, y de ahí salen los correos de cobro. → [01](01-ventas-y-clientes.md)
4. **Préstamos — el pago individual sigue escribiendo la fecha de hoy** sin preguntar (el lote ya se arregló el 4-sep). 94 ediciones de movimientos huelen a esa corrección a mano. → [04](04-plata-y-administracion.md)
5. **Caja — la fecha se resetea a hoy en cada recibo** y la secretaria teclea ~38 de una sentada. Y el cierre exige saldo = 0 sin decirlo: hay gastos de $0,05 creados y borrados el mismo día para cuadrar. → [03](03-operacion-diaria.md)

## Decisiones que solo puede tomar Daniel

- **Packing Lists está vacío** (0 filas, último uso 22-abr-2026) y un cron lo limpia a diario para nada. ¿Se retira?
- **Reclamos:** 29 de 34 llevan 143 días en «Creado» aunque ya se les mandó correo; el estado «En proceso» **nunca se usó**. ¿El estado sirve o estorba?
- **Marketing:** los 25 proyectos están abiertos para siempre; ninguno se cerró jamás. 71 de 88 facturas siguen en «creado».
- **Recordatorios: 0 filas desde que existe.** El flujo que Daniel pidió (crear desde el calendario) no se construyó: tocar un día no hace nada.
- **La capa de escritura del CXC está muerta:** favoritos ⭐ **cero filas en toda la historia**, «marcar contactado» 140 de 141 filas en un solo mes (marzo), correos de cobro solo 2 días de julio.
- **La vía pública de pedidos casi no se usa:** 23 desde abril, 7 convertidos, el último el 15-ago.

## Correcciones a la documentación que salieron de aquí

- `CLAUDE.md` decía que los productos de Reebok viven **en otro proyecto Supabase**: hoy es falso — `NEXT_PUBLIC_REEBOK_SUPABASE_URL` apunta al proyecto principal y `products`/`inventory` están ahí.
- `CLAUDE.md` § Boston decía `VE_SUELDOS_DE_BOSTON = false`; está en **`true`** desde el 3-sep-2026.
- Los conteos de pedidos internos de `CLAUDE.md` **incluyen borrados** (67 de 121 lo están; 53 fueron pruebas del 12-13 de agosto).
- Un postmortem daba por no aplicada la migración del número de entrega de Mobiliario: **sí corrió** (entregas 1–24 secuenciales).
