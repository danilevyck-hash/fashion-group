# Nombres de ERP — glosario obligatorio

> Daniel, 1-oct-2026: «no los raros que inventas, no se ve profesional».

**Regla:** en pantallas, pestañas, columnas, botones, modales, chips, avisos, PDF y Excel van **nombres normales de un ERP**: sustantivos cortos y estándar. Nada inventado, narrativo ni coloquial («Lo que va en el camión», «Quiénes deben», «Pierde plata»). **Mayúscula solo en la primera palabra** («Cuentas por cobrar», no «Cuentas por Cobrar»), salvo nombres propios (Switch, Fashion Group, Boston). Tuteo, nunca voseo.

Complementa [docs/diccionario.md](diccionario.md) (formatos y las diez decisiones del 5-sep-2026: fechas, plata, porcentajes, nombres de empresa). Decidido el 1-oct-2026: el rótulo de frescura es «Actualizado hace X» (diccionario §1.7), nunca «sincronizar». ⚠️ Queda un choque por confirmar: Marketing › Mobiliario «Tienda» (audit 1-oct) vs «Cliente» (diccionario §0 n.º 2).

🔴 **Esto se revisa con una máquina** (6-oct-2026). `npx tsx scripts/revisar-nombres.ts [carpeta]` saca todos los textos que se VEN en pantalla y frena por FORMA —pregunta · primera o segunda persona · verbo con el pronombre pegado · imperativo · y un rótulo que no sea un sustantivo corto— además de hacer cumplir las dos tablas de abajo. **Este documento es la única fuente**: se agrega una fila «mal → bien» y el revisor la hace cumplir sola, sin tocar código. 🔴 **Ningún agente reporta una pantalla sin `revisar-nombres` en verde** (candado `src/__tests__/lib/revisar-nombres.test.ts`, con un techo por archivo que solo baja). Daniel: *«¿cómo hago para que apliques nombres como ERP profesional sin tener que decírtelo cada vez?»*.

Antes de nombrar algo nuevo, busca aquí el término. Si el concepto no está, usa el nombre que usaría SAP/Odoo en español y agrégalo a esta tabla.

## Cómo agregar un término nuevo

Cuando Daniel corrija un nombre («eso no se dice así»), para que quede atrapado para siempre:

1. **Decide la vara.** ¿La palabra mala NUNCA es correcta en ningún contexto (nombre de proveedor, identificador, color del catálogo)? Va en «Palabras prohibidas en textos visibles» (CERO en todo el código). ¿Puede aparecer legítimamente en otro lado? Va en «Formas coloquiales» (techo por archivo, solo sobre lo que se VE en pantalla).
2. **Agrega la fila** «Prohibido | Reemplazo» en la tabla que corresponda, con el nombre de ERP correcto a la derecha. Si además define un concepto nuevo, suma también una fila en «Un término por concepto».
3. **No se toca código.** `scripts/revisar-nombres.ts` (`glosario()`) lee este documento en cada corrida; el candado (`nombres-erp-prohibidos.test.ts` y `revisar-nombres.test.ts`) la hace cumplir sola.
4. **Corre `npm test`.** Si la palabra ya estaba en pantalla, el candado falla con el archivo y la línea exactos: arregla ESE texto (nunca el candado). El techo de un archivo solo baja.

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
| Texto libre / razón | Observaciones · Motivo (también en Caja menuda; la columna de la base no cambia) | Nota, Por qué, Qué pasó |
| Columna de cantidad | Cantidad (en texto: «unidades»; junto a bultos: «Bultos · Cantidad», «Unidades por bulto», «Bulto de 12») | Piezas, Pzas, Unidades (como encabezado). Excepción: la línea del Telegram del pedido sigue «12 piezas» (Daniel: «deja piezas») |
| Mandar algo | Enviar | Mandar |
| Escoger filas, opciones o fechas | Seleccionar · Seleccionar período · Seleccionar empresa · N seleccionados · Selecciona … (en avisos y validaciones, tuteo) | Elegir, Elige, N elegidos |
| Quitar un registro | Eliminar (Anular: documentos con número y metas · «Anular / Sí, anular») | Borrar, Retirar |
| Correo electrónico / URL | Correo · Enlace | email, link |
| Relacionar dos registros | Vincular · Sin vincular | Atar, Sin atar |
| Apuntar un pago | Registrar abono | Anotar abono |
| Estado de una persona/cliente | Activo · Inactivo | Trabaja aquí, Ya no trabaja, Dormidos |
| Producto no visible | Oculto · Ocultar | Escondido, Esconder |
| Cheque no pagado | Devuelto · Motivo de devolución | Rebotado, rebote |
| Dato traído de Switch | Actualizado hace X · Actualizado el {fecha} | Última sincronización, sincronizado, sync |
| Venta media | Ticket promedio · Tickets | Ticket prom., tkt prom, tiquetes |
| Rol con acceso total | Administrador | Admin |
| Sacar de una lista sin borrar el dato | Quitar (Eliminar es definitivo) | Borrar |
| Cancelar una acción | Cancelar | Mejor no |
| Fechas | Fecha · Fecha de ingreso · Fecha de salida | Día (como columna de fecha), Empezó, Su último día |
| Aviso de que algo se hizo | «<Cosa> guardado / cobrado / quitado / actualizado» («Reclamo cobrado») | «Listo, …» |
| Título del ⓘ de ayuda | Cómo se calcula · Información · Leyenda · Contenido del correo · Prioridad de precios · Origen de… | Frases o preguntas («Qué hace esta lista», «De dónde salen…», «Para qué sirve») |
| Antigüedad de saldos (CxC, Boston, ficha, PDF, Excel) | Solo rangos: 0-90 días · 91-120 días · +120 días (angosto: 0-90 d · 91-120 d · +120 d) | Por vencer, Vencido reciente, Vencido crítico, Al día (en cartera) |
| Zona de borrado definitivo | Acciones irreversibles | Zona de acciones peligrosas |
| Rango de fechas | Desde · Hasta | A partir de, Entre |
| Destinatario de un correo | Para · Copia | A quién, Enviar a |
| Cambiar un registro | Editar | Modificar, Arreglar |
| Bajar un archivo | Descargar (Descargar Excel · Descargar PDF) | Bajar, Exportar |
| Lo que se le debe a un proveedor | Por pagar (CLAUDE.md › Proveedores: «Pendiente X · Saldo a favor Y · Por pagar Z») | Deuda, Falta pagar |
| Quitar un acceso, un permiso o una sesión | Quitar acceso · Quitar permiso · Cerrar sesión | Revocar |
| Estado de algo que ya terminó | Completado · Entregado · Recibido (un solo estado por cosa, nunca «Terminado») | Terminado, Listo, Ya está |
| Respaldo de un gasto | Comprobante | Foto o factura, Papel |
| Dónde se gastó | Tienda | De una tienda, La tienda esa |
| Tipo de gasto: mobiliario que sale de la bodega a una tienda (Marketing) | Entrega de mobiliario | Mueble de la bodega |
| Agrupar mercancía para despacho | Bultos · Unidades por bulto | Poner en bulto, Embultar |
| Pasos de un pedido en Despachos › Pedidos | Pendiente · En preparación · Preparado · Recibido (botón: «Iniciar preparación») | Armando, En proceso, Recibí la hoja, Listo |
| Pedido detenido porque faltan piezas que se traen de otro lado | En espera de muestra (una marca sobre En preparación; botones «En espera de muestra» · «Quitar espera») | Esperando pieza, Falta muestra, Parado |
| Módulo de envíos a clientes (pedidos + bultos + la guía) | Despachos (adentro: Pedidos · Bultos · Guías de despacho) | Envíos, Logística |
| Poner una línea del pedido en un bulto | Asignar bulto · Quitar bulto · «N artículos asignados» | Poner en bulto, Poner en el bulto, Quitar del bulto, Marcar artículos |
| A quién se le cobra un gasto (Marketing) | Se cobra a (las 5 marcas, o «No recuperable») · Se cobra (Completo · Mitad) | A quién se le pasa, mi costo, costo propio, inventario propio, porcentajes en pantalla |
| Adjunto de un gasto | Comprobante · Adjuntar comprobante | Foto o factura, Subir foto o factura |
| Gasto sin tienda | Sin tienda (en el formulario; el cajón del reporte y del ZIP sigue siendo «General») | De una tienda, General (como botón) |
| Rótulos de formulario | Sustantivo («Pago por planilla», «Marcación en reloj») | Preguntas («¿Qué…?», «¿Quién…?», «¿A quién…?»), salvo «¿Es X (D-25)?», que Daniel aprobó textual |

## Palabras prohibidas en textos visibles

Candado: `src/__tests__/lib/nombres-erp-prohibidos.test.ts`, que **lee esta tabla** (barre los `.tsx` de `src/app` y `src/components`, y los textos entre comillas de `src/lib` y de los `.ts` de `src/app` y `src/components`, sin comentarios). Aquí la regla es **CERO en todo el código**; lo que admite un techo va en «Formas coloquiales», al final.

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
| Voseo (elegí, podés, tenés, tocá…) | Tuteo (selecciona, puedes, tienes, toca…) |
| «Listo, …» (avisos) | «<Cosa> guardado / cobrado / …» |
| Elige … | Selecciona … · Seleccionar … |
| Por vencer · Vencido reciente · Vencido crítico | 0-90 días · 91-120 días · +120 días |
| Última sincronización · sincronizado · el próximo sync | Actualizado hace X · próxima actualización de Switch |
| ¿Qué…? · ¿Quién…? · ¿A quién…? como rótulo | El sustantivo («Notificar a», «Cliente del pedido nuevo») |
| No encontramos nada para · Tal vez buscas · Algo salió mal · Ya lo intentamos | Sin resultados para · Ir a · Ocurrió un error · Intenta de nuevo |
| Nada vencido · Nada abierto · Nada es gasto · Ojo: | Sin saldos a +90 días · Sin gastos abiertos · Sin gastos · Atención: |
| Tú decides · Sí a todo · Sin nada pendiente · Nunca ha entrado | Pago por definir · Aprobar pendientes · Sin saldo · Sin sesiones |
| Ya le avisé · Entró sola · Lo despedimos · Escribirle a · Llenar la ficha · Editando su información | Notificado a Daniel · Alta automática · Despido · Enviar correo a · Crear ficha · Editar colaborador |
| No encontré · No pude · No detecté (primera persona) | No se encontró · No se pudo · No se detectó |
| a medias · se llena solo | Parcial · Productos con existencia en Switch |
| Guías de Despacho · Asistencia y Planilla · Estado de Cuenta · Guardar Cambios | mayúscula solo en la primera palabra |
| `titulo="(Qué\|De dónde\|Cada cuánto\|Para qué\|Por qué)` | Cómo se calcula · Información |
| `(del\|el\|próximo) sync\b` | la próxima actualización de Switch |
| Terminado (como estado) | Completado · Entregado |
| Foto o factura | Comprobante |
| De una tienda | Tienda |
| A quién se le pasa | Se cobra a |
| costo propio · inventario propio | No recuperable |
| A cargo de la empresa | No recuperable |
| Subir foto o factura | Adjuntar comprobante |
| Poner en bulto | Bultos |
| Revocar | Quitar acceso |
| Mueble de la bodega | Entrega de mobiliario |
| Lo que va en el camión | Detalle de envío |
| El viaje | Envío |

## Formas coloquiales (techo por archivo)

Misma idea, vara más blanda: estas las hace cumplir `scripts/revisar-nombres.ts`
sobre los textos que se VEN en pantalla, con un techo por archivo que solo baja
(`src/__tests__/lib/revisar-nombres.test.ts`). Van aquí y no arriba porque la
palabra puede aparecer legítimamente en un identificador, en un color del
catálogo o en un mensaje interno; arriba la regla es CERO en todo el código.

| Prohibido | Reemplazo |
|---|---|
| flechita · ratito · cosita · numerito · cuadrito · poquito · rapidito · ahorita (diminutivos) | la palabra entera |
| chance · vaina · bulla · regado · un rato · al rato · jalar · pelado (coloquialismos; «plata» ya está arriba en «Pierde plata», y «Plata» a secas es un COLOR del catálogo) | el término del glosario (Oportunidad · Error · un momento…) |
| mi costo · mi plata · mis cosas (posesivos en un rótulo) | Costo · Monto · el sustantivo solo |
