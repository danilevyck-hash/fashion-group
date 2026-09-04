# Eficiencia — Catálogos · Multifashion · Confecciones Boston · Referencia

> Auditoría del 4-sep-2026. Solo lectura: repo + producción (PostgREST / Management API).
> Método del brief: mapear → medir → recomendar. Cero afirmación sin dato.

---

## Catálogos y pedidos (`/catalogos/marcas` hub · `/catalogo/[marca]` por marca, key `catalogos`)

**Qué es y quién lo usa.** Las 4 marcas (Reebok, Joybees, Tommy, Calvin) con catálogo interno para armar pedidos, catálogo público compartible, y el panel «Comprobantes». Lo usan los vendedores (sobre todo **Reinaldo**: 31 sesiones en agosto), Daniel, y la secretaria administra fotos/badges. David (Boston) solo VE.

**Uso medido (al 4-sep-2026).**
- Pedidos internos VIVOS por mes: jul **17** (Reebok 14, Joybees 3) · ago **31** (Tommy 26, Calvin 4, Joybees 1) · sep al día 3: **6**. ~1 pedido por día hábil, y el motor es **Tommy**.
- Por persona (vivos): Reinaldo **31** (25 Tommy + 6 Reebok) · Daniel ~6 · «DEFAULT» 6 · sin vendedor 3.
- Enviados a Switch: **50 en total, TODOS en «verificado», cero en error** (Tommy 27 —24 pedidos + las únicas 3 cotizaciones—, Reebok 16, Joybees 4, Calvin 3).
- Tamaño típico: **13,5 líneas por pedido** en Tommy y 13,7 en Reebok (máx 84). Joybees/Calvin son chicos (2-3 líneas).
- Pedidos PÚBLICOS (sin login): **23 desde abril**, solo **7 convertidos**, el último el **15-ago**. La vía pública casi no se usa.
- Fotos faltantes: Reebok **1**/391 · Joybees 2/83 · Tommy 8/552 · Calvin 6/81. El trabajo de fotos está hecho; el cron semanal de los lunes alcanza.

**Cómo funciona por dentro** (lo nuevo; invariantes en CLAUDE.md § Catálogos y `docs/postmortems/catalogos-pedidos.md`):
- Flujo vendedor: catálogo (grid con «Agregar» por producto, en bultos) → barra de carrito → checkout único (`CheckoutClient.tsx`) → confirmación. El vendedor viene PUESTO del login; el cliente arranca vacío (regla del 14-ago, `cliente-elegido.ts`); las dos salidas (Pedido / Cotización) van directo.
- Selector de cliente: `ClienteSwitchPicker` (único en el sistema, candado `un-solo-selector-de-cliente.test.ts`). Abre listando los primeros del directorio + «Contado» arriba; **no tiene «recientes»**.
- «Duplicar» (lista y detalle, `DuplicarPedidoModal`) cubre el pedido repetido y el cotizar→vender.
- Comprobantes: `/catalogo/<marca>/pedidos` para los 3 roles que arman pedidos; el panel de fotos (`/catalogos/admin/<marca>`) es admin+secretaria.
- 🔴 **Los productos de Reebok NO viven en «otro proyecto Supabase»** — ver «Lo raro» abajo. `products` (391) e `inventory` (391) están en la base principal.

**La tarea más frecuente, hoy.** Reinaldo arma un pedido Tommy de ~13 líneas: entrar a la marca (2 toques desde el home) → por línea: buscar/scroll + «Agregar» (+ ajustar bultos) ≈ 2 toques × 13 → carrito → checkout → elegir cliente (abrir selector + escribir + tocar = 3) → «Pedido a Switch» (1). ≈ **35 toques**, y la mayoría es elegir mercancía — eso ES el trabajo, no desperdicio. El flujo ya está pulido (119 commits jul-ago).

**Sugerencias.**
1. **«Recientes» arriba del selector de cliente** · Quién: Reinaldo — sus clientes se repiten (Contado 6, City Mall Paso Canoa 4, Wolf Mall 3, Multi Fashion 3 en 30 pedidos Tommy) · Hoy: abrir selector → escribir 3-6 letras → esperar la búsqueda → tocar (≈15 s) · Después: abrir → tocar el cliente en una fila «Tus últimos clientes» (≈3 s) · Ahorra ~10 s × ~30 pedidos/mes ≈ **5 min/mes** — chico y honesto: es comodidad, no un cuello de botella · Tamaño: **chico** · Riesgo: NO toca la regla «el cliente se elige, nunca viene puesto» — solo se muestra más arriba, el toque sigue siendo la elección y Contado sigue aparte.

Fuera de eso, **nada más que proponer**: el desperdicio grande de este módulo (cliente preseleccionado, dos selectores, 4 toques hasta los comprobantes, papel que mentía pedido/cotización) ya se eliminó entre el 14 y el 25 de agosto, y los 50 envíos a Switch salieron sin un solo error.

**Lo raro que encontré.**
- 🔴 **CLAUDE.md dice que los productos Reebok viven «en otro proyecto Supabase (reebokServer)» y es FALSO hoy**: `NEXT_PUBLIC_REEBOK_SUPABASE_URL` apunta al MISMO proyecto (`rspocgqhtpveytgbtler`) en el env de Vercel (variables de hace ~161 días), y `products`/`inventory` (391 filas cada una) están en la base principal. `reebok-supabase-server.ts` cae al proyecto principal por fallback igual. Corregir el doc para que nadie «busque» el proyecto fantasma.
- **67 de 121 pedidos internos están borrados**, y 53 fueron pruebas del 12-13-ago (Joybees 35, Calvin 16) creadas y borradas el mismo día. Ojo: los conteos de CLAUDE.md («joybees_orders 41») incluyen borrados — vivos son 4.
- **El nombre del vendedor en los pedidos está sucio**: `daniel` / `DANIEL LEVY` / `DANIEL LEVY ` (espacio final) / `rey` / `REINALDO ESPINOSA` / `DEFAULT` / null. Es el mismo problema de grafías que Comisiones acaba de resolver con alias — si algún día se agrupa pedidos por vendedor, pasar por `comision_vendedor_canonico`.
- **11 de 18 pedidos públicos de Reebok nunca se convirtieron** y no entra uno público desde el 15-ago. No es un bug — es un dato para Daniel: la vía pública hoy funciona más de vitrina que de canal de pedidos.

---

## Multifashion (`/multifashion`, key `multifashion`)

**Qué es y quién lo usa.** El tablero de la tienda American Classic: venta de hoy, resumen mensual, vendedoras, productos, clientes wholesale, caja y metas. Lo usan **Jennifer** (gerente_acs, su ÚNICO módulo) y Daniel.

**Uso medido (al 4-sep-2026).** Jennifer: **32 sesiones en agosto** (~diaria), 9 en julio, 40 logins en total. Es un módulo de LECTURA: la única escritura es Metas — **1 meta con 4 participantes, editada por última vez el 14-ago**. Sync manual de ventas ACS («Actualizar»): 6 veces en agosto, 5 en julio — la cadencia automática de 2 h alcanza casi siempre.

**Cómo funciona por dentro** (invariantes en CLAUDE.md § Multifashion y `docs/postmortems/multifashion.md`):
- `MultifashionShell` (año + overview) → `MultifashionView` con 6 sub-pestañas: Resumen · Vendedoras · Productos · Clientes · Caja · Metas.
- La venta de HOY sale de `retail-dia.ts` (la misma función del Telegram de las 8pm) y es lo PRIMERO en pantalla, arriba de las pestañas.
- Caja lee EN VIVO de Switch (`/apireporte/diarioventas` con caché) — para el cuadre físico del cierre.
- Todo lo demás sale de RPCs (`multifashion_mensual_v7`, `multifashion_vendedoras_v3`) sobre `switch_facturas` / `_multifashion_sf_vw`; escrituras solo en `multifashion_metas` + `_participantes`.
- Vendedoras compara contra el MES ANTERIOR a propósito (rótulo «Δ vs …», decisión de Daniel 3-sep).

**La tarea más frecuente, hoy.** Jennifer entra → el login la aterriza directo en `/multifashion` → la venta de hoy ya está en pantalla. **0 pasos extra.** Ver un mes: 1 toque de pestaña + flechas ‹ ›.

**Sugerencias.** **Nada que proponer.** El módulo es lectura pura, la usuaria entra a diario y lo que va a ver primero (venta de hoy) ya la recibe sin tocar nada; la única escritura (Metas) se usó una vez en 3 semanas y no genera fricción. Subir la frecuencia del sync no se propone: cada corrida expulsa al usuario `daniel` del panel de Switch de ACS (sesión por usuario) y las 6 pulsadas manuales al mes no lo justifican.

**Lo raro que encontré.** Nada. Los 22 commits de jul-ago dejaron el módulo estable y no hay datos sucios en sus tablas propias (1 meta, 4 participantes).

---

## Confecciones Boston (`/boston`, key `boston`)

**Qué es y quién lo usa.** El módulo de **David** (gerente_boston, hermano de Daniel): toda la operación de Confecciones Boston sin ver nada de Fashion Group. También lo ve admin.

**Uso medido (al 4-sep-2026).** Módulo nuevo (27-ago). David: **5 logins en total** (3 sesiones en agosto, 2 en septiembre; último 2-sep). Todo es lectura — no hay escrituras que medir. Con una semana de uso real, todavía no hay patrón de desperdicio medible.

**Cómo funciona por dentro** (invariantes DUROS en CLAUDE.md § Boston y `docs/postmortems/boston-cxc.md` — leer ANTES de tocar):
- 6 pestañas (`PESTANAS_BOSTON` en `src/lib/boston/rol.ts`, la fuente única del rol): Inicio · Por cobrar · Ventas · Clientes · Planilla · Préstamos.
- **Ninguna cuenta se reimplementó**: Por cobrar = el mismo `/api/cxc/boston` (vista `switch_estadocuenta_aging_boston`), Planilla = el mismo motor de `/api/asistencia/planilla` (la empresa la FUERZA el servidor), Ventas = el mismo rollup, Préstamos = GET puro con `calcularSaldoPrestamo`.
- 🔴 Dos reglas opuestas y las dos valen: Boston no se mezcla con el grupo, Y David no ve el grupo (14 rutas ajenas le contestan 403, candado `boston-acceso.test.ts`, 23 mutaciones cazadas).
- **`VE_SUELDOS_DE_BOSTON = true` desde el 3-sep** (commits «David ve los sueldos de su planilla»): el recorte de dinero en el servidor sigue existiendo como mecanismo, pero hoy está apagado para David.
- Catálogos: David VE las 4 marcas (solo `CATALOGO_ROLES`), sin comprobantes ni administrar; su casa sigue siendo `/boston` (`MODULO_CASA_POR_ROL`).

**La tarea más frecuente, hoy.** David entra → aterriza directo en `/boston` (Inicio: cartera, ventas, planilla, préstamos en una pantalla) → 1 toque a la pestaña que quiera. No hay pasos que recortar.

**Sugerencias.** **Nada que proponer todavía.** El módulo tiene una semana de uso real (5 entradas), es 100% lectura, y cada pestaña reusa un motor ya cuadrado. Cualquier «mejora» hoy sería inventar sin dato y rozaría invariantes con candados de mutación. Volver a medir en octubre: si David entra a diario, ahí se verá qué pestaña usa y si le falta algo.

**Lo raro que encontré.**
- **CLAUDE.md § Boston quedó viejo**: dice «los sueldos se recortan en el SERVIDOR (`VE_SUELDOS_DE_BOSTON = false`)» pero el flag está en `true` desde el 3-sep. El mecanismo sigue; el valor documentado no. Actualizar el doc (hay trabajo en curso sin commitear en asistencia/roles — coordinar con esa sesión).
- Pendiente que ya estaba anotado y sigue abierto: la lista de comprobantes para David (hoy 403 a propósito) es decisión de Daniel, no un refactor.

---

## Referencia (`/referencia`, key `referencia`)

**Qué es y quién lo usa.** El buscador de artículos del grupo: pegar 1-50 códigos y ver qué llegó, qué se vendió y qué hay en stock. Roles: admin, **vendedor y bodega** (desde el 12-ago; ellos lo ven SIN margen). Ya NO es pestaña de Ventas: `/ventas?tab=referencia` redirige aquí.

**Uso medido (al 4-sep-2026).** **No medible**: es lectura pura y `activity_logs` no registra pantallas. Lo que sí se midió: el botón «Actualizar datos de Switch» (sync manual de `articulo_info`) se usó **1 vez en agosto** — el cron de 3 pasadas nocturnas cubre la frescura.

**Cómo funciona por dentro** (invariantes en CLAUDE.md § Ventas/Referencia):
- `/referencia/page.tsx` (guard propio, `ROLES_REFERENCIA`) reusa `ReferenciaView` — el mismo componente, cero lógica propia; el gate del margen vive en `/api/ventas/referencia` (`margenVisible: false` para vendedor/bodega — **costos y precios SÍ los ven**, decisión de Daniel: «quita margen, lo demás déjalo»).
- Tres fuentes: `switch_ingresos_mercancia` (compras), `switch_articulo_diario` (ventas, NC restadas), `switch_articulo_info` (stock y etiqueta). Un solo buscador: prefijo para 1 y para 50 códigos (el bug de las dos semánticas ya se pagó el 12-ago).

**La tarea más frecuente, hoy.** Pegar la lista de códigos (desde el Excel de Daniel) → una tarjeta por modelo. **2 pasos.** No hay nada que recortar.

**Sugerencias.** **Nada que proponer.** La pantalla es un buscador de 2 pasos que ya absorbió su rediseño (un solo buscador, sin pestaña de lista aparte); sin datos de uso no hay base para proponer más.

**Lo raro que encontré.** Nada en el módulo. (El detalle de las reglas de tandas/FIFO/VENDIDO pertenece a la auditoría de Ventas.)
