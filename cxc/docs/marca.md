# Marca Fashion Group

Hasta el 6-oct-2026 no existía un brandbook escrito de Fashion Group: los colores vivían sueltos en el código (el logo, el azul de los Excel y de algunos PDF, la paleta de pantallas de `docs/diseno.md`). Este archivo los junta en un solo lugar.

Daniel, 6-oct-2026: *«PDF me gusta en estilo azul, son nuestros colores, ¿no? ¿Cuál es nuestro brandbook? Usa ese».*

## 1. Colores

### Los colores del papel (PDF)

🔴 **Esta tabla ES la paleta de los PDF.** La revisión automática (`src/__tests__/lib/papeles-paleta-unica.test.ts` y `scripts/revisar-papeles.ts`) la lee de aquí, y exige que `PAPEL` de `src/lib/pdf-estilo.ts` tenga exactamente estos colores. Un color nuevo en un PDF se agrega primero aquí.

<!-- paleta:inicio -->
| Color | Hex | Uso |
|---|---|---|
| Azul de la casa | `#1B3A5C` | Encabezado de tabla (lleno, letra blanca) y título del papel. **Un solo azul**: ningún PDF usa otro tono. |
| Dorado del logo | `#C9A96E` | Solo la raya fina bajo la cabecera. Detalle, nunca relleno ni texto. |
| Negro | `#000000` | Reservado (raya gruesa de las firmas). |
| Tinta | `#111827` | Texto, cifras y totales. |
| Gris oscuro | `#4B5563` | Datos secundarios (línea de datos del reclamo, notas). |
| Gris | `#6B7280` | Subtítulos y rótulos. |
| Gris claro | `#9CA3AF` | Pie de página y filas apagadas. |
| Línea | `#D1D5DB` | Bordes de campos y cajas. |
| Separador | `#E5E7EB` | Raya entre filas. |
| Fondo | `#F9FAFB` | Fondo de grupos y bloques. |
| Blanco | `#FFFFFF` | Papel y letra sobre el azul. |
| Rojo | `#DC2626` | Negativos y notas de crédito. |
<!-- paleta:fin -->

### De dónde sale cada uno

- **Azul `#1B3A5C`**: el `pri` de `CASA_PALETTE` (`src/lib/excel-export.ts`), el encabezado de todos los Excel del grupo, y el `NAVY` que ya usaban los PDF de CxC, Comisiones, Reclamos y Marketing. Es el azul que el equipo ya reconoce como «el de la casa».
- **Dorado `#C9A96E`** y **fondo del logo**: medidos sobre `public/logo.jpeg`. El dorado del logo es un degradado (del `#CEB483` al `#D4B979`); para una raya fina sobre papel blanco se usa un tono un poco más hondo, `#C9A96E`, que se lee. El fondo del logo es un negro azulado, casi negro (≈ `#16131A`); no se usa en el papel.
- **Grises, tinta y rojo**: los mismos de las pantallas (`docs/diseno.md` › «La paleta estándar»: familia `gray`, `red-600`).

### En las pantallas

Las pantallas siguen la paleta de `docs/diseno.md` (botón principal negro, enlaces `blue-600`, estados `emerald` · `amber` · `red`). El azul de la casa **no** entra a las pantallas: es del papel y del Excel.

## 2. Tipografías

- **Pantallas**: Inter (la del sistema). Montos con `tabular-nums`, nunca `font-mono` (`docs/diseno.md`).
- **Títulos de marca** (contadas pantallas): Playfair Display (`font-display`).
- **PDF**: Helvetica (la que trae jsPDF). Sus cifras ya son del mismo ancho: las columnas de montos alinean solas.
- **Excel**: la de Excel por omisión.

## 3. El logo

- Archivo: `public/logo.jpeg` (monograma «FG» y «FASHION GROUP» en dorado sobre negro azulado). En los PDF va en base64 desde `src/lib/pdf-logo.ts`.
- Lugar en el papel: arriba a la izquierda, 11 mm, sin marco ni sombra.
- No se recolorea, no se estira y no se pone sobre otro fondo de color.
- Confecciones Boston firma como Boston: su papel sale **sin** el logo del grupo y sin `fashiongr.com` en el pie (`casa-del-papel.ts`).
- Las marcas que distribuimos (Reebok, Joybees, Tommy Hilfiger, Calvin Klein) usan su logo y su color solo en las piezas que ve el cliente de esa marca (catálogo y franja del pedido).

## 4. El estilo de los PDF

Vive en `src/lib/pdf-estilo.ts` y `src/lib/pdf-tabla.ts` (interruptor `PAPELES_ESTILO_UNICO_2026_10`, prendido el 6-oct-2026).

- **Cabecera**: logo a la izquierda; título en el azul de la casa y subtítulo gris al lado; número o fecha arriba a la derecha; una raya fina dorada debajo.
- **Tabla**: encabezado lleno en azul `#1B3A5C` con letra blanca en negrita; sin rayas verticales ni cebra; una raya finísima gris entre filas; números a la derecha; negativos en rojo; totales en negrita con raya arriba.
- **Pie**: «Confidencial · Página N de M · fashiongr.com», igual en todos.
- **Margen**: 16 mm en todos.
- **Excepciones**: las etiquetas de la Zebra térmica (blanco y negro, letra grande) y las piezas de marca (catálogo Reebok y la franja del pedido de catálogo). La tabla del pedido sí es la de la casa.
