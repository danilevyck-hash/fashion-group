---
name: asi-se-construye
description: Las reglas de construcción de Fashion Group — cómo se arma cualquier cosa nueva en este sistema para que se sienta uno solo. Úsala ANTES de escribir código de una pantalla, un formulario, una lista, un Excel, un PDF o un aviso; y al recomendarle algo a Daniel. Se aplica sin que nadie la pida.
user-invocable: true
---

# Así se construye aquí

Daniel, textual (7-sep-2026):

> *«¿Cómo hacemos una skill o algo que cada vez que en esta sesión o en una nueva ya sepa todo, y que cuando me recomiende o construyamos algo lo haga con estos principios de eficiencia, así no tengo que repetir y que se sienta que todo el sistema es uno solo?»*

Esto es esa lista. **No es teoría**: cada regla nació de un defecto medido contra producción o de una decisión suya. Se aplica **sin preguntar** — preguntarle a Daniel si quiere que un botón mida 44 px es hacerle repetir.

⚠️ Si una regla choca con un invariante de `cxc/CLAUDE.md`, **manda el invariante**. Si choca con lo que Daniel acaba de pedir, **manda Daniel** — y se anota aquí la excepción con su cita.

---

## 1. La identidad es el CÓDIGO, nunca el nombre

Vale para clientes, colaboradores, proveedores, vendedores y transportistas. El nombre se escribe distinto en cada lugar; el código no.

| Quién | Dónde vive su código |
|---|---|
| Cliente | `clientes_master.codigo` (D-24) |
| Colaborador | `asistencia_personas.empleado_codigo` (Angela = 7, Julio = 11, Rodrigo = 13, Andrea = 16) |
| Proveedor | `proveedor_amarre` |
| Vendedor de comisiones | `comision_vendedor_alias` |

**Nunca** se ata por parecido: ni distancia de edición, ni trigramas, ni fonética. Pareo **exacto y normalizado**, y cuando dos cosas son la misma pero se escriben distinto, va una **lista escrita a mano** que revisa Daniel.

🩸 Lo que cuesta romperla: un JOIN por nombre publicó **$2,55 millones de venta que no existió**. Caja guardó el nombre como texto al lado del identificador y quedaron **tres «Angelas»** («Angela Garcia» 59 · «Angela garcia» 17 · «Angela garciia» 1) que el papel lista como tres personas.

**Y un dato no se guarda dos veces.** Si el período ya tiene dueño, el gasto no lleva responsable: dos nombres para lo mismo solo pueden contradecirse. Daniel: *«no deberían de haber 2 nombres en un gasto, solo uno»*.

## 2. Lo que alguien agrega, queda para todos

Daniel: *«lo de solo ver en mi pantalla no tiene lógica, el sistema debe de trabajar todo igual»*.

Nada que una persona escriba se guarda solo en su navegador. `localStorage` sirve para **comodidades de esa persona** — qué pestaña dejó abierta, qué filtro tenía, un borrador a medio escribir. **Nunca** para datos que otro necesita ver.

🩸 El `+` de destinos de Guías guardaba en `localStorage`: un destino agregado por Angela no lo veía nadie más, y **no se podía borrar desde ninguna pantalla** — se podía agregar, no quitar. Así quedó un destino de prueba llamado «hola» vivo para siempre en un solo navegador.

**Y si se puede agregar, se tiene que poder quitar.** Con soft delete, nunca con un DELETE.

## 3. Un solo cuadro para subir archivos, y la lista SUMA

Daniel: *«¿no se puede hacer un solo campo? … y al volver a tocarlo selecciono otra foto sin que se me borre la anterior»*.

- **UN cuadro**, no uno por tipo de archivo. Reconoce qué le soltaron.
- **Arrastrar Y tocar**, siempre las dos.
- **La lista SUMA, nunca reemplaza.** Volver a elegir agrega; el mismo archivo dos veces no entra dos veces.
- Se puede **quitar uno sin perder los demás**.
- **Sin botón de guardar**: se sube solo apenas cae. El sistema no pide confirmación para guardar.
- Lo que no se pudo emparejar **no se descarta**: se queda y se le puede resolver a mano.

## 4. Avisar, nunca bloquear

La regla es del negocio, no del código: el sistema no sabe más que la persona.

Se **avisa** (con salida): una factura que ya salió en otra guía · un gasto igual el mismo día · un recibo con fecha fuera del período · un pedido parecido a otro. Todos con «Guardar igual».

Se **bloquea** solo cuando el error no tiene vuelta atrás: mandar dos veces el mismo pedido a Switch, un divisor 100× mal que sale al Excel, editar una guía ya firmada.

⚠️ **Un aviso que sale siempre deja de avisar.** Si algo se marca en el 99% de los casos, no se marca. Daniel: *«un color que sale siempre deja de avisar»*.

## 5. Nada se borra

Soft delete firmado (`deleted` + quién + cuándo). Las columnas de una función retirada **no se dropean**: quedan sin lectores, con su `COMMENT`, y con candado que pone el build ROJO si una migración las borra.

⚠️ **Y no se puede eliminar algo que tiene cosas adentro.** Daniel: *«no se debería eliminar un período con gastos, no es normal»*.

## 6. Un control que no ofrece nada, no se dibuja

- Un botón que el servidor va a rechazar **no se muestra** («Duplicar» en los pedidos que no están en Switch).
- Un chip en cero **no aparece** («Cotizaciones 0»).
- Una sugerencia igual a lo que ya está escrito **no se dibuja** (el destino repetido de Guías).
- Un botón que baja un archivo vacío **se apaga** («Excel sin foto» con 0 sin foto).
- Una función con **0 usos** en toda la historia se retira de la pantalla, midiéndolo primero.

## 7. Los números se calculan, nunca se escriben a mano

Los contadores de los chips, los totales, las listas de empresas o de marcas: **derivados**. Una lista escrita a mano es la que deja fuera a la quinta marca el día que nace.

🩸 `["/catalogo-publico", "/pedido-reebok"]` escrito a mano dejó a Tommy, Calvin y Joybees con 224 px de franja vacía en el iPad.

**Y los chips cuentan lo que se está mirando**, no todo el listado.

## 8. Una sola función para el mismo número

Si la pantalla y el Excel muestran el mismo total, **llaman a la misma función**. No se le pasa el dato que le falta a uno: se une a los dos.

🩸 El Excel de Comprobantes cobró **$1.516 de más** porque se arregló en la pantalla y quedó vivo en el Excel — y era la **segunda vez** que pasaba con el mismo cálculo.

## 9. Se usa en iPad y en celular

- **44 px mínimo** para todo lo que se toca. Sin excepción.
- **Nada que dependa de pasar el mouse por encima**: en iPad no hay mouse. Si algo se edita, se tiene que ver que se edita.
- **Tablas anchas → ficha** por debajo de 1024 px. La tabla se queda de ahí para arriba.
- **Ningún arrastre lateral** para llegar a un botón.
- **Texto de datos: 14 px mínimo.**
- Si algo solo funciona en computadora (elegir una carpeta, por ejemplo), **la pantalla lo dice**.

## 10. Una pantalla no abre en vacío

Abre en **lo más reciente que tenga datos**, no en el mes del calendario. Si la pestaña por defecto está en cero, no es la pestaña por defecto.

Y **la lista abre con lo reciente** (30 o 90 días según el módulo), el resto detrás de «Ver más» — sin texto explicativo.

## 11. Un cero grande se lee como dato roto

Nunca `$0.00` en letra grande. Se dice qué pasó: «Sin comprar en 2026», «No debe nada», «Nunca ha pagado», «Todavía no hay gastos registrados».

⚠️ Y **un cero con algo adentro sí muestra su número**: tapar una celda en cero que tiene un descuento adentro esconde plata.

## 12. Una palabra por cosa

`docs/diccionario.md` manda. **Descargar** (no bajar ni exportar) · **Correo** (no email) · **período** con tilde · nombre de empresa **corto** · plata negativa `−$100.00` con menos tipográfico y con centavos · porcentajes sin decimal.

**Español latinoamericano neutro, tuteo, NUNCA voseo** — en pantalla, PDF, Excel, Telegram, correo **y comentarios de código**. Candado: `nada-de-voseo.test.ts`.

## 13. Los errores dicen qué hacer

Nunca el mensaje crudo de una librería, nunca inglés, nunca un código HTTP. Tres partes: **qué pasó · qué significa · qué hacer**. El detalle va a la consola.

Ejemplo: «No pude leer este archivo. Revisa que sea el Excel del proveedor y que no esté protegido con contraseña.»

## 14. Todo número se mide contra producción

No se afirma un número que no se midió, y **no se diseña alrededor de un dato ausente sin buscarlo primero**. La documentación envejece: se remide.

Cuando se afirma algo de una pantalla, **se mira la pantalla**, no solo el código.

## 15. Cómo se entrega

- **Un archivo no pasa de 800 líneas.** Las decisiones, en módulos PUROS sin I/O.
- **Candado con verificación por mutación**: se rompe cada regla a propósito, se comprueba que el test se pone ROJO, y se reporta «N mutaciones, N cazadas» con al menos 2 CONTROLES que NO deben cazarse.
- **Un candado nunca se borra.** Si ahora apunta al revés, **cambia de dirección con nota fechada** y conserva el **control al revés**, para que siga cazando el defecto original.
- Migraciones **aditivas y acotadas**. Nunca un `LIKE` suelto, nunca un UPDATE amplio.
- **Detrás de un interruptor** lo que cambia una pantalla que se usa a diario: en `false`, la pantalla es la de hoy.

## 16. Cómo se le habla a Daniel

- **Resumido.** Es el dueño, no programador. Sin nombres de tabla ni jerga.
- **Dónde estamos parados, cómo está hoy y cómo quedaría.**
- **Mapear → definir juntos → ejecutar.** Nunca al revés.
- Toda sugerencia **numerada**, con **ahora vs recomendación** lado a lado, y las opciones **a·b·c** cuando hay que elegir. Él aprueba una por una.
- **Mockup visual** cuando hace falta verlo; nunca datos inventados en un mockup.
- **Se dice el riesgo, no las horas.** Cuánto se toca y qué puede romperse, no cuánto tarda.
