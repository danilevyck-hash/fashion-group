# Guías de Transporte — Extracción para Brand It (referencia desde fashiongr)

> Documento de **referencia read-only**. Generado leyendo el repo `fashiongr/cxc` sin modificar nada.
> Molde para construir el módulo de **Guías de transporte** (envíos/entregas) en Brand It.

**Stack:** Next.js 14 App Router · Supabase (Postgres) · API routes delgadas · jsPDF + jspdf-autotable (PDF) ·
Resend (email) · firma manuscrita con HTML5 Canvas (base64).

**Qué es una "guía de transporte interior":** un documento que acompaña un despacho de mercancía a uno o
varios destinos. Tiene un **encabezado** (número, fecha, transportista o entrega directa, quién despacha)
y **N items** (uno por cliente/destino: cliente, dirección, empresa, facturas, bultos). Se crea en estado
**pendiente**, luego **bodega la despacha** capturando firmas + datos del receptor, y queda **completada**.
Se imprime / se manda por PDF.

---

## Índice
1. [Modelo de datos (tablas, SQL completo)](#1-modelo-de-datos)
2. [Lógica de negocio (numeración, estados, validaciones)](#2-lógica-de-negocio)
3. [Rutas de API](#3-rutas-de-api)
4. [Frontend: páginas, componentes y UI](#4-frontend)
5. [Integraciones externas (PDF, Email, Impresión, Firmas)](#5-integraciones-externas)
6. [Específico de fashiongr que NO aplica tal cual a Brand It](#6-específico-de-fashiongr)
7. [Checklist de port a Brand It](#7-checklist-de-port-a-brand-it)

---

# 1. Modelo de datos

Tres tablas: `guia_transporte` (encabezado), `guia_items` (líneas), `transportistas` (catálogo). Más una
tabla de errores de cron opcional. Las migraciones se aplican manual en Supabase Dashboard → SQL Editor.

## 1.1 `guia_transporte` — encabezado de la guía

Schema base (`supabase/schema.sql`):

```sql
create table if not exists guia_transporte (
  id uuid primary key default gen_random_uuid(),
  numero integer not null,
  fecha date not null,
  transportista text not null,        -- LEGACY texto libre (ver 6.2: ya nullable, reemplazado por FK)
  placa text,
  observaciones text,
  created_at timestamptz default now()
);

alter table guia_transporte enable row level security;
create policy "Allow all for anon" on guia_transporte for all using (true) with check (true);
```

Columnas agregadas por migraciones (en orden cronológico):

```sql
-- supabase/add-guias-detalle.sql
ALTER TABLE guia_transporte ADD COLUMN IF NOT EXISTS monto_total numeric(10,2) DEFAULT 0;
ALTER TABLE guia_transporte ADD COLUMN IF NOT EXISTS estado text DEFAULT 'Preparando';

-- supabase/migrations/guias-workflow.sql  (workflow 2 pasos: Secretaria → Bodega)
ALTER TABLE guia_transporte ADD COLUMN IF NOT EXISTS nombre_entregador TEXT;
ALTER TABLE guia_transporte ADD COLUMN IF NOT EXISTS cedula_entregador TEXT;

-- supabase/migrations/guias-firma.sql
ALTER TABLE guia_transporte ADD COLUMN IF NOT EXISTS firma_transportista TEXT;  -- base64 PNG

-- supabase/migrations/guias-soft-delete.sql
ALTER TABLE guia_transporte ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;

-- supabase/migrations/20260526000002_guia_transporte_add_modo_entrega.sql  (Sprint 1)
ALTER TABLE public.guia_transporte
  ADD COLUMN IF NOT EXISTS modo_entrega text NOT NULL DEFAULT 'entrega_directa',
  ADD COLUMN IF NOT EXISTS transportista_id uuid REFERENCES public.transportistas(id);

ALTER TABLE public.guia_transporte
  ADD CONSTRAINT guia_transporte_modo_entrega_valido
    CHECK (modo_entrega IN ('transportista', 'entrega_directa'));

-- CHECK de coherencia: si hay transportista, tiene que haber FK; si es directa, FK debe ser NULL
ALTER TABLE public.guia_transporte
  ADD CONSTRAINT guia_transporte_modo_coherente CHECK (
    (modo_entrega = 'transportista' AND transportista_id IS NOT NULL)
    OR
    (modo_entrega = 'entrega_directa' AND transportista_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_guia_transporte_transportista_id
  ON public.guia_transporte(transportista_id);

-- supabase/migrations/20260526000004_guia_transporte_transportista_nullable.sql  (Sprint 2)
ALTER TABLE public.guia_transporte ALTER COLUMN transportista DROP NOT NULL;
```

Columnas adicionales que el API usa al despachar (presentes en la DB de producción; se fueron
agregando con `ADD COLUMN IF NOT EXISTS` — para Brand It conviene incluirlas todas de una en el CREATE):

| Columna | Tipo | Significado |
|---|---|---|
| `id` | uuid PK | — |
| `numero` | integer (UNIQUE) | Número correlativo de guía (se muestra como `GT-042`) |
| `fecha` | date | Fecha de la guía |
| `modo_entrega` | text `'transportista' \| 'entrega_directa'` | Fuente de verdad del tipo |
| `transportista_id` | uuid FK → transportistas | Transportista (si modo = transportista) |
| `transportista` | text (legacy, nullable) | Texto libre viejo. Ya no se lee (ver 6.2) |
| `placa` | text | Placa del vehículo |
| `observaciones` | text | Notas generales |
| `monto_total` | numeric(10,2) | Monto total (default 0) |
| `estado` | text | `Pendiente Bodega` → `Completada` / `Rechazada` |
| `tipo_despacho` | text `'externo' \| 'directo'` | Tipo de despacho al confirmar |
| `nombre_chofer` | text | Chofer (cuando tipo_despacho = directo) |
| `receptor_nombre` | text | Nombre de quien recibe |
| `cedula` | text | Cédula del receptor |
| `entregado_por` | text | Quién entrega/despacha |
| `numero_guia_transp` | text | N° de guía del transportista externo |
| `firma_base64` | text | Firma del receptor/transportista (base64 PNG, ~30-100KB) |
| `firma_entregador_base64` | text | Firma del entregador/chofer (base64 PNG) |
| `firma_transportista` | text | Firma transportista (legacy) |
| `nombre_entregador`, `cedula_entregador` | text | (legacy workflow) |
| `motivo_rechazo` | text | Motivo si la guía fue rechazada |
| `deleted` | boolean default false | Soft delete |
| `created_at`, `updated_at` | timestamptz | Timestamps |

## 1.2 `guia_items` — líneas de la guía (un item por destino)

```sql
create table if not exists guia_items (
  id uuid primary key default gen_random_uuid(),
  guia_id uuid not null references guia_transporte(id) on delete cascade,
  orden integer not null,            -- 1, 2, 3… (el PUT usa orden negativo temporal, ver 3.4)
  cliente text,
  direccion text,
  empresa text,                      -- en fashiongr: una de las 8 empresas (ver 6.1)
  facturas text,                     -- "10234, 10235" (coma + espacio)
  bultos integer default 0,          -- # de bultos para este destino
  numero_guia_transp text
);

-- supabase/migrations/guias-soft-delete.sql
ALTER TABLE guia_items ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;

alter table guia_items enable row level security;
create policy "Allow all for anon" on guia_items for all using (true) with check (true);
```

> El total de bultos de una guía = `SUM(guia_items.bultos)`. No se almacena denormalizado; se calcula al leer.

## 1.3 `transportistas` — catálogo canónico

```sql
-- supabase/migrations/20260526000000_create_transportistas.sql
CREATE TABLE IF NOT EXISTS public.transportistas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transportistas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON public.transportistas;
CREATE POLICY service_role_all ON public.transportistas
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

-- supabase/migrations/20260526000001_seed_transportistas.sql
INSERT INTO public.transportistas (nombre) VALUES
  ('RedNblue'), ('Transporte Sol'), ('Mojica'), ('Edwin'), ('Sanjur'), ('Boston')
ON CONFLICT (nombre) DO NOTHING;
```

> Para Brand It: cambiá el seed por los transportistas reales de Brand It. La tabla es genérica.

## 1.4 Notas sobre RLS

Las tablas viejas (`guia_transporte`, `guia_items`) usan policy abierta `"Allow all for anon"` —
la autorización real está en la capa de API (`requireRole`), no en RLS. `transportistas` usa policy
`service_role`. El cliente server (`supabaseServer`) usa el `SERVICE_ROLE_KEY`, así que pasa RLS siempre.
**No hay RPCs ni vistas** en este módulo: toda la lógica está en los route handlers de Next.js.

---

# 2. Lógica de negocio

## 2.1 Numeración de guías (`numero`)

Auto-incremento manual con **retry por carrera** (no usa secuencia de Postgres). En `POST /api/guias`:

```typescript
let guia = null, guiaErr = null;
for (let attempt = 0; attempt < 3; attempt++) {
  const { data: last } = await supabaseServer
    .from("guia_transporte")
    .select("numero")
    .order("numero", { ascending: false })
    .limit(1)
    .single();

  const numero = (last?.numero || 0) + 1;

  const { data, error } = await supabaseServer
    .from("guia_transporte")
    .insert({ numero, fecha, modo_entrega, transportista_id: /*…*/, /*…*/ })
    .select()
    .single();

  if (!error) { guia = data; break; }
  // Reintentar si chocó con el UNIQUE(numero) por inserción concurrente
  if (error.message?.includes("unique") || error.message?.includes("duplicate") || error.message?.includes("23505")) {
    continue;
  }
  guiaErr = error; break;
}
```

> Depende de un `UNIQUE(numero)` para que el retry tenga sentido. **Para Brand It conviene agregar
> `UNIQUE (numero)` en el CREATE de `guia_transporte`** (en fashiongr vive en un migration de constraints aparte).
> Se muestra en UI como `GT-042` vía un helper `fmtGuia(numero)`.

## 2.2 Estados (`estado`)

```
Pendiente Bodega   →   Completada      (despacho confirmado con firmas + receptor)
                   →   Rechazada       (devuelta / cancelada, con motivo en observaciones)
```

- Estado inicial al crear: `"Pendiente Bodega"`.
- `"Completada"` es **terminal**: el API bloquea editar o re-despachar una guía ya completada.
- `"Rechazada"`: vía PATCH, set `estado` + motivo. (También hay `"Despachada"` como alias histórico de Completada.)

Guards de transición (en PUT y PATCH):

```typescript
// No permitir editar una guía ya despachada
if (previous?.estado === "Completada" && estado !== "Completada") {
  return NextResponse.json({ error: "Guía ya despachada, no se puede editar" }, { status: 400 });
}

// Anti-doble-despacho con condición de carrera: solo completa si NO está ya Completada
let query = supabaseServer.from("guia_transporte").update(update).eq("id", id);
if (body.estado === "Completada") query = query.neq("estado", "Completada");
const { data: updated } = await query.select("id").maybeSingle();
if (!updated) return NextResponse.json({ error: "Guía no encontrada o ya fue despachada" }, { status: 404 });
```

## 2.3 Validaciones

**Al crear/editar (encabezado + items):**
- `fecha` requerida.
- Si `modo_entrega === "transportista"` → `transportista_id` requerido. Si `"entrega_directa"` → sin transportista.
- `entregado_por` (quién despacha) requerido.
- Al menos 1 item con todos sus campos; `total bultos > 0`.
- Por item: `cliente`, `direccion`, `empresa`, `facturas`, `bultos > 0`.
- **Formato de facturas:** separar con coma+espacio (`"10234, 10235"`), mínimo 4 dígitos por factura:
  ```typescript
  if (item.facturas.includes(",") && !item.facturas.match(/^[^,]+(, [^,]+)*$/))
    errors.add(`item-${idx}-facturas-separator`);   // "Separar con coma y espacio"
  const parts = item.facturas.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.some(p => p.replace(/\D/g, "").length < 4))
    errors.add(`item-${idx}-facturas-format`);       // "Mín. 4 dígitos por factura"
  ```

**Al despachar (estado = Completada), el API exige:**
- Al menos 1 item y `total bultos > 0`.
- `receptor_nombre` y `cedula`.
- Si `tipo_despacho === "externo"` → `placa` requerida.
- Si `tipo_despacho === "directo"` → `nombre_chofer` requerido.
- Las dos firmas (canvas) requeridas en el front antes de confirmar.

## 2.4 Label del transportista (`src/lib/transportistaLabel.ts`)

Helper que resuelve el texto a mostrar desde `(modo_entrega, transportista_id JOIN transportistas)`:

```typescript
export function transportistaLabel(row: TransportistaSource): string {
  if (row.modo_entrega === "entrega_directa") return "Entrega directa";
  const joined = Array.isArray(row.transportistas) ? row.transportistas[0] : row.transportistas;
  return joined?.nombre || "";
}
```

---

# 3. Rutas de API

Ubicación: `src/app/api/guias/`. Todas exigen rol vía `requireRole`/`getSession`. Roles permitidos:

```typescript
const GUIAS_ROLES = ["admin", "secretaria", "bodega", "director", "vendedor"];
// DELETE más restrictivo: ["admin", "secretaria"]
```

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| GET | `/api/guias` | GUIAS_ROLES | Lista guías activas (sin firmas base64, para aligerar) |
| POST | `/api/guias` | GUIAS_ROLES | Crea guía (numero auto-incremental) + items |
| GET | `/api/guias/[id]` | GUIAS_ROLES | Detalle completo (con firmas + items) |
| PUT | `/api/guias/[id]` | GUIAS_ROLES | Edición completa / despacho (header + items + firmas) |
| PATCH | `/api/guias/[id]` | GUIAS_ROLES | Update parcial (despacho rápido / rechazo) |
| DELETE | `/api/guias/[id]` | admin, secretaria | Soft delete (`deleted = true`) |
| POST | `/api/guias/notify` | admin, secretaria, bodega | Email ad-hoc al crear (Resend) |
| GET | `/api/transportistas` | GUIAS_ROLES | Catálogo de transportistas activos |
| GET | `/api/cron/guias-summary` | cron secret | Resumen diario por email + PDFs (ver 5) |

## 3.1 GET /api/guias (lista)

```typescript
const { data, error } = await supabaseServer
  .from("guia_transporte")
  .select("id, numero, fecha, modo_entrega, transportista_id, transportistas(nombre), placa, observaciones, monto_total, estado, tipo_despacho, receptor_nombre, nombre_entregador, entregado_por, nombre_chofer, numero_guia_transp, created_at, deleted, guia_items(bultos, facturas, cliente)")
  .eq("deleted", false)
  .order("numero", { ascending: false });

const result = (data || []).map((g) => ({
  ...g,
  transportista: transportistaLabel(g),
  total_bultos: (g.guia_items || []).reduce((s, i) => s + (i.bultos || 0), 0),
  item_count: (g.guia_items || []).length,
}));
```

> Nota: **no trae los base64 de firmas** en la lista (cada uno pesa 30-100KB). Las firmas solo se piden en el detalle.

## 3.2 POST /api/guias (crear)

Valida modo/transportista, valida items + bultos>0, auto-incrementa `numero` (ver 2.1), inserta el header y luego los items:

```typescript
if (items && items.length > 0) {
  const rows = items.map((item, i) => ({
    guia_id: guia.id, orden: i + 1,
    cliente: item.cliente || "", direccion: item.direccion || "", empresa: item.empresa || "",
    facturas: item.facturas || "", bultos: item.bultos || 0, numero_guia_transp: item.numero_guia_transp || "",
  }));
  const { error: itemsErr } = await supabaseServer.from("guia_items").insert(rows);
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });
}
// logActivity(role, "guia_create", "guias", { guiaId, numero }, userName)
```

## 3.3 GET /api/guias/[id] (detalle)

```typescript
const { data } = await supabaseServer
  .from("guia_transporte")
  .select("*, transportistas(nombre), guia_items(*)")
  .eq("id", id).eq("deleted", false).single();
data.transportista = transportistaLabel(data);
data.guia_items = data.guia_items.filter(i => !i.deleted).sort((a,b) => a.orden - b.orden);
```

## 3.4 PUT /api/guias/[id] (editar / despachar) — reemplazo seguro de items

Lo más delicado del módulo: al editar, los items se **reemplazan** sin dejar la guía sin líneas si algo falla.
Técnica: insertar los nuevos con `orden` **negativo**, borrar los viejos (orden ≥ 0), y luego voltear los negativos a positivos.

```typescript
if (items !== undefined) {
  if (items.length > 0) {
    // 1. Insertar nuevos con orden negativo (marcador temporal)
    const rows = items.map((item, i) => ({ guia_id: id, orden: -(i + 1), /* …campos… */ }));
    const { error: itemsErr } = await supabaseServer.from("guia_items").insert(rows);
    if (itemsErr) {
      await supabaseServer.from("guia_items").delete().eq("guia_id", id).lt("orden", 0); // rollback
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }
    // 2. Borrar los viejos (orden >= 0)
    await supabaseServer.from("guia_items").delete().eq("guia_id", id).gte("orden", 0);
    // 3. Voltear negativos → positivos
    const { data: newItems } = await supabaseServer.from("guia_items").select("id, orden").eq("guia_id", id).lt("orden", 0);
    const results = await Promise.allSettled(
      newItems.map(ni => supabaseServer.from("guia_items").update({ orden: -ni.orden }).eq("id", ni.id))
    );
    // si alguno falla → 500
  } else {
    await supabaseServer.from("guia_items").delete().eq("guia_id", id); // items vacíos = borrar todo
  }
}
```

Validaciones de despacho (cuando `estado` es Completada/Despachada): bultos>0, receptor, cédula, placa
(externo) o chofer (directo). Bloquea re-editar si ya estaba Completada (ver 2.2).

## 3.5 PATCH /api/guias/[id] (despacho rápido / rechazo)

Whitelist de campos permitidos + guard anti-doble-despacho:

```typescript
const allowed = ["placa","observaciones","estado","receptor_nombre","cedula","firma_base64",
  "firma_entregador_base64","entregado_por","numero_guia_transp","nombre_entregador",
  "cedula_entregador","firma_transportista","tipo_despacho","nombre_chofer","motivo_rechazo"];
const update = {};
for (const key of allowed) if (body[key] !== undefined) update[key] = body[key];
// guard Completada (ver 2.2)
```

## 3.6 DELETE /api/guias/[id] (soft delete)

```typescript
const auth = requireRole(req, ["admin", "secretaria"]);   // más restrictivo
await supabaseServer.from("guia_transporte").update({ deleted: true }).eq("id", id);
// logActivity(role, "guia_delete", "guias", { guiaId }, userName)
```

## 3.7 GET /api/transportistas

```typescript
const { data } = await supabaseServer
  .from("transportistas")
  .select("id, nombre, activo")
  .eq("activo", true)
  .order("nombre", { ascending: true });
```

---

# 4. Frontend

## 4.1 Estructura de archivos

```
src/app/guias/
├── page.tsx                       # Lista (entrada principal)
├── nueva/page.tsx                 # Crear guía
├── [id]/editar/page.tsx           # Editar guía
├── [id]/imprimir/page.tsx         # Vista imprimible (detalle)
└── components/
    ├── GuiasList.tsx              # Tabla, búsqueda, filtros, despacho inline
    ├── GuiaForm.tsx               # Formulario header + items
    ├── DespachoForm.tsx           # Despacho: tipo + firmas + receptor
    ├── GuiaDetail.tsx             # Wrapper de impresión
    ├── PrintDocument.tsx          # Plantilla A4
    ├── SignatureCanvas.tsx        # Captura de firma (canvas)
    ├── AddNewInline.tsx           # "+ agregar nuevo" inline (cliente/dirección/empresa)
    ├── useGuiasState.ts           # Estado de la lista + despacho
    ├── useGuiaFormState.ts        # Estado del formulario + validación + draft
    ├── constants.ts              # Listas default, helpers
    ├── types.ts                  # Interfaces TS
    ├── excel-guias.ts            # Export Excel
    └── canvasUtils.ts            # Utilidades de canvas
```

## 4.2 La lista (`GuiasList.tsx`)

- **Búsqueda:** "Buscar por transportista, cliente o factura…" (match en transportista, items.cliente, items.facturas).
- **Acciones de cabecera:** `Seleccionar` (modo selección con checkboxes), `↓ Excel`, `+ Nueva Guía`.
- **Agrupación temporal:** `groupByTimePeriod()` → "Hoy / Esta semana / Vencidos", con `TimeGroupHeader` colapsable.
- **Columnas (desktop):** `GT-042` (numero, mono) · fecha · transportista · resumen de clientes ("X y 2 más") ·
  total bultos (tabular-nums) · badge "Pendiente despacho" si aplica · **StatusBadge**.
- **Mobile:** card apilada + swipe-to-action "Despachar" si está pendiente y el rol puede despachar.
- **Fila expandida:** botones Editar / Imprimir / overflow (eliminar), tabla de items
  (`# · Cliente · Dirección · Empresa · Facturas · Bultos`), observaciones. Si está despachada: grid read-only
  (tipo, placa, chofer, receptor, cédula) + imágenes de firmas. Si pendiente y el rol puede: `<DespachoForm>` inline.

Roles en el front:
```typescript
const DESPACHO_ROLES = ["admin", "secretaria", "bodega", "director"];
const CREATE_ROLES   = ["admin", "secretaria", "bodega"];
const DELETE_ROLES   = ["admin", "secretaria"];
const REJECT_ROLES   = ["admin", "secretaria"];
```

StatusBadge: el estado se mapea a `pendiente | despachada | rechazada` →
```jsx
<StatusBadge estado={g.estado === "Rechazada" ? "rechazada" : isDispatched ? "despachada" : "pendiente"} />
```

## 4.3 El formulario (`GuiaForm.tsx`)

**Encabezado:**
- `fecha` (date).
- Segmented control **Transportista | Entrega directa** (`modoEntrega`).
  - Si transportista: `<select>` poblado de `/api/transportistas`.
  - Si entrega directa: nota "se entrega directamente, sin transportista externo".
- `Despachado por` (`entregadoPor`): select de entregadores (default `["Julio", "Rodrigo"]` + custom de localStorage) + "Otro…".

**Tabla de items (Detalle de Envío):** columnas `# · Cliente* · Dirección* · Empresa* · Factura(s)* · Bultos* · ×`.
- `cliente` / `direccion`: text con `<datalist>` (historial). `empresa`: select. `facturas`: text. `bultos`: number.
- `+ Agregar fila`, botón `×` para borrar (con **undo** "Fila eliminada · Deshacer").
- `AddNewInline` permite agregar valores nuevos a las listas (cliente/dirección/empresa) que se guardan en localStorage.

**Observaciones:** textarea. **Total bultos:** se muestra sumado en vivo.

**Smart defaults (localStorage):**
```
fg_last_modo_entrega        → "transportista" | "entrega_directa"
fg_last_transportista_id    → UUID
fg_last_entregado_por       → nombre
fg_clientes / fg_direcciones / fg_empresas / fg_entregadores  → arrays custom (merge con defaults)
```

**Draft auto-save:** `useDraftAutoSave("guia", data, isEmpty)` guarda cada pocos segundos; al volver a /guias/nueva
muestra banner ámbar "Tienes un borrador guardado de hace X. ¿Restaurar?". Al editar una guía existente, **auto-save
silencioso** cada 1.5s (sin redirect ni toast). El guardado manual sí redirige a `/guias` y muestra toast.

## 4.4 El despacho (`DespachoForm.tsx`)

- Toggle **Transportista externo | Entrega directa** (`tipoDespacho`).
  - Externo: `Placa* · Nombre del receptor* · Cédula del receptor*`.
  - Directo: `Chofer* · Cliente receptor* · Cédula del cliente*`.
- **Par de firmas** (`SignatureCanvas`): externo → "Firma del transportista" + "Firma del entregador";
  directo → "Firma del chofer" + "Firma del cliente".
- Botón **Confirmar despacho** → `PUT /api/guias/[id]` con `estado: "Completada"` + campos + firmas base64.
- Las firmas se persisten en localStorage mientras el form está abierto (`guia_firma_{id}_transportista` / `_entregador`),
  y se limpian tras el despacho exitoso.

## 4.5 Constantes (`constants.ts`) — específicas de fashiongr

```typescript
export const DEFAULT_CLIENTES = ["City Mall", "La Frontera Duty Free", "Jerusalem de Panama",
  "Plaza Los Angeles", "Golden Mall", "Multi Fashion Holding", /* … */];
export const DEFAULT_DIRECCIONES = ["Paso Canoas", "David", "Santiago", "Guabito", "Changinola"];
export const DEFAULT_EMPRESAS = ["Vistana International", "Fashion Shoes", "Fashion Wear",
  "Active Shoes", "Active Wear", "Confecciones Boston", "Joystep", "MultiFashion Holding"];
```

> **Estas listas son de fashiongr.** Para Brand It se reemplazan por sus propios clientes/destinos/empresas
> (probablemente una sola empresa → ver 6.1).

---

# 5. Integraciones externas

## 5.1 PDF (jsPDF + jspdf-autotable)

La función `generateGuiaPdf()` (en `src/app/api/cron/guias-summary/route.ts`) arma el documento físico de la guía.
Esta es la referencia de layout más completa — **portala casi tal cual a Brand It**:

```typescript
function generateGuiaPdf(guia: GuiaRow): Buffer {
  const gi = guia.guia_items;
  const totalB = gi.reduce((s, i) => s + (i.bultos || 0), 0);
  const doc = new jsPDF("portrait");
  const W = 210;

  doc.setFontSize(13); doc.setTextColor(26); doc.setFont("helvetica", "bold");
  doc.text("GUÍA DE TRANSPORTE INTERIOR", W / 2, 16, { align: "center" });

  doc.setFontSize(9); doc.setTextColor(60);
  const hY = 26;
  doc.setFont("helvetica", "bold"); doc.text("N° GUÍA:", 14, hY);
  doc.setFont("helvetica", "normal"); doc.text(String(guia.numero), 42, hY);
  doc.setFont("helvetica", "bold"); doc.text("FECHA:", 110, hY);
  doc.setFont("helvetica", "normal"); doc.text(guia.fecha || "", 132, hY);
  doc.setFont("helvetica", "bold"); doc.text("TRANSPORTISTA:", 14, hY + 7);
  doc.setFont("helvetica", "normal"); doc.text(guia.transportista || "", 56, hY + 7);
  doc.setFont("helvetica", "bold"); doc.text("PLACA:", 110, hY + 7);
  doc.setFont("helvetica", "normal"); doc.text(guia.placa || "Sin placa", 132, hY + 7);
  doc.setFont("helvetica", "bold"); doc.text("ENTREGADO POR:", 14, hY + 14);
  doc.setFont("helvetica", "normal"); doc.text(guia.entregado_por || "", 56, hY + 14);
  doc.setDrawColor(200); doc.line(14, hY + 19, W - 14, hY + 19);

  autoTable(doc, {
    startY: hY + 23,
    head: [["#", "CLIENTE", "DIRECCIÓN", "EMPRESA", "FACTURA(S)", "BULTOS", "N° GUÍA TRANSP."]],
    body: [
      ...gi.map((it, idx) => [String(idx + 1), it.cliente, it.direccion || "", it.empresa, it.facturas, String(it.bultos), guia.numero_guia_transp || ""]),
      [{ content: "TOTAL DE BULTOS DESPACHADOS", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } }, String(totalB), ""],
    ],
    styles: { fontSize: 8, cellPadding: 2, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { fillColor: [240, 240, 240], textColor: [26, 26, 26], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 8 }, 5: { cellWidth: 14, halign: "center" }, 6: { cellWidth: 22 } },
  });
  let fy = (doc as any).lastAutoTable.finalY + 6;

  // Observaciones (recuadro)
  doc.setFontSize(8); doc.setTextColor(26); doc.setFont("helvetica", "bold");
  doc.text("OBSERVACIONES GENERALES DEL ENVÍO", 14, fy);
  doc.setFont("helvetica", "normal");
  doc.rect(14, fy + 2, W - 28, 12);
  if (guia.observaciones) doc.text(guia.observaciones, 16, fy + 7, { maxWidth: W - 32 });
  fy += 20;

  // Bloque de firmas (cambia según externo/directo)
  const isDirect = guia.tipo_despacho === "directo";
  doc.setFont("helvetica", "bold");
  doc.text(isDirect ? "CHOFER" : "ENTREGADO POR", 14, fy);
  doc.text(isDirect ? "RECIBIDO POR — CLIENTE" : "RECIBIDO CONFORME — TRANSPORTISTA", 110, fy);
  fy += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`NOMBRE: ${isDirect ? (guia.nombre_chofer || "________________") : (guia.entregado_por || "________________")}`, 14, fy);
  if (!isDirect) doc.text(`PLACA: ${guia.placa || "________________"}`, 110, fy);
  else doc.text(`NOMBRE: ${guia.receptor_nombre || "________________"}`, 110, fy);
  fy += 5;
  doc.text("FIRMA: ________________", 14, fy);
  if (!isDirect) doc.text(`NOMBRE: ${guia.receptor_nombre || "________________"}`, 110, fy);
  else doc.text(`CEDULA: ${guia.cedula || "________________"}`, 110, fy);
  fy += 5;
  if (!isDirect) doc.text(`CEDULA: ${guia.cedula || "________________"}`, 110, fy);
  else doc.text("FIRMA: ________________", 110, fy);
  fy += 5;
  if (!isDirect) doc.text("FIRMA: ________________", 110, fy);

  // Firmas como imagen (base64 PNG capturado del canvas)
  if (guia.firma_entregador_base64) {
    try { doc.addImage(guia.firma_entregador_base64, "PNG", 14, fy - 12, 40, 15); } catch {}
  }
  if (guia.firma_base64) {
    try { doc.addImage(guia.firma_base64, "PNG", 145, fy - (isDirect ? 12 : 7), 40, 15); } catch {}
  }
  fy += 12;

  // Texto legal
  doc.setFontSize(6); doc.setTextColor(160);
  doc.text("La firma del transportista constituye aceptación expresa de la mercancía detallada en este documento, en la cantidad y condición indicadas.", 14, fy, { maxWidth: W - 28 });
  doc.text("Cualquier faltante o daño no reportado al momento de la recepción será responsabilidad exclusiva del transportista.", 14, fy + 4, { maxWidth: W - 28 });

  return Buffer.from(doc.output("arraybuffer"));
}
```

> Nota: este PDF del cron usa solo texto/tabla (sin logo). La vista imprimible del browser
> (`PrintDocument.tsx`) sí usa el logo (`/logo.jpeg`) con CSS `@media print` A4. Hay un asset
> `src/lib/pdf-logo.ts` (`FG_LOGO_BASE64`) que otros PDFs del sistema embeben — para Brand It,
> reemplazar por el logo de Brand It si se quiere logo en el PDF.

## 5.2 Email (Resend)

**Notificación ad-hoc al crear** (`/api/guias/notify`):

```typescript
const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
  body: JSON.stringify({
    from: "Fashion Group <pedidos@fashiongr.com>",
    to: ["info@fashiongr.com"],
    subject,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px">${body}</div>`,
  }),
});
```

**Resumen diario** (`/api/cron/guias-summary`) — corre **23:00 UTC = 6pm Panamá** (`vercel.json`:
`{ "path": "/api/cron/guias-summary", "schedule": "0 23 * * *" }`). Query de guías `Completada` en ventana
de 24h por `updated_at`, arma tabla HTML + adjunta **un PDF por guía**, y envía con SDK de Resend:

```typescript
const resend = new Resend(process.env.RESEND_API_KEY);
await resend.emails.send({
  from: "Fashion Group <notificaciones@fashiongr.com>",
  to: ["daniel@fashiongr.com"],
  subject: `Resumen de Despachos — ${fechaDisplay}`,
  html,                                 // tabla: # Guía · Transportista · Placa · Cliente(s) · Bultos · Hora
  attachments,                          // [{ filename: `Guia-${numero}.pdf`, content: pdf }]
});
```

Errores de envío se persisten en `cron_email_errors` (best-effort). Horas/fechas se formatean con
`toLocaleString("es-PA", { timeZone: "America/Panama" })`.

## 5.3 Impresión (browser nativo)

`PrintDocument.tsx` renderiza el documento A4 con CSS `@media print` (márgenes ~8mm, A4 portrait,
`page-break-inside: avoid`, logo `/logo.jpeg`). El usuario hace clic en "Imprimir" → `window.print()`.

## 5.4 Firmas (HTML5 Canvas → base64 PNG)

`SignatureCanvas.tsx` captura la firma en un `<canvas>` y la exporta como base64 PNG. Se guardan en
las columnas `firma_base64` / `firma_entregador_base64`. `canvasUtils.ts` tiene helpers (`isCanvasClear`, etc.).
Persistencia temporal en localStorage mientras el form de despacho está abierto.

## 5.5 Lo que NO existe (para que no lo busques)

- **No hay** integración con WhatsApp, courier, ni tracking/API de paquetería. (`directorio_clientes` tiene un
  campo whatsapp pero las guías no lo usan.) El módulo es de despacho interno + PDF/email.

---

# 6. Específico de fashiongr

Cosas que **NO aplican tal cual a Brand It** y hay que adaptar o quitar:

## 6.1 Multi-empresa (las 8 compañías del grupo)

- `guia_items.empresa` es texto y **cada línea puede ser de una empresa distinta** (una guía consolida despachos
  de varias de las 8 empresas: Vistana, Fashion Wear/Shoes, Active Wear/Shoes, Joystep, Confecciones Boston, MultiFashion).
- `constants.ts → DEFAULT_EMPRESAS` lista esas 8.
- **Brand It es (presumiblemente) una sola empresa** → se puede:
  - eliminar la columna `empresa` de items, o
  - dejarla pero con una sola opción / valor fijo.

## 6.2 Migración histórica transportista texto → FK

- En fashiongr la columna `transportista` TEXT existía como texto libre y se migró a la tabla `transportistas`
  con `transportista_id` (Sprints 1-3, 94 filas backfilleadas). `transportistaLabel()` y los CHECK de coherencia
  son artefactos de esa migración.
- **Brand It arranca limpio:** crear directamente `transportista_id` + el catálogo `transportistas`, sin la
  columna legacy `transportista` ni los constraints de coherencia con la columna vieja. (El CHECK
  `modo_coherente` SÍ conviene mantenerlo.)

## 6.3 Sistema de roles de fashiongr

- `GUIAS_ROLES = ["admin","secretaria","bodega","director","vendedor"]`, con `bodega` como rol que despacha.
  Brand It tiene su propio set de roles → ajustar los arrays.
- El rol `bodega` auto-redirige a Guías desde el home (es su único módulo) — eso es config de fashiongr.

## 6.4 Listas de negocio hardcodeadas (fashiongr)

- `DEFAULT_CLIENTES` (City Mall, duty frees, etc.), `DEFAULT_DIRECCIONES` (Paso Canoas, David, Santiago…),
  los entregadores default (`Julio`, `Rodrigo`), y el seed de `transportistas` (RedNblue, Mojica, Edwin…) son
  todos de fashiongr. Reemplazar por los de Brand It.

## 6.5 Emails / dominios

- `from`/`to` son de fashiongr (`pedidos@fashiongr.com`, `notificaciones@fashiongr.com`, `daniel@fashiongr.com`,
  `info@fashiongr.com`). Cambiar a los dominios/destinatarios de Brand It (y configurar el dominio en Resend).

## 6.6 Otros artefactos de fashiongr

- `logActivity(...)` escribe a una tabla `activity_logs` de auditoría — opcional en Brand It.
- `cron_email_errors` — tabla de errores de cron, opcional.
- `pdf-logo.ts` (`FG_LOGO_BASE64`) — logo de Fashion Group.
- Zona horaria `America/Panama` y la ventana 23:00 UTC del cron — ajustar si Brand It opera en otro huso.
- Policy RLS abierta `"Allow all for anon"` (la auth real está en API) — Brand It debería decidir si endurece RLS.

---

# 7. Checklist de port a Brand It

1. **DB:** crear `transportistas`, `guia_transporte`, `guia_items` con el CREATE consolidado. Agregar
   `UNIQUE (numero)` a `guia_transporte` (clave para el retry de numeración). Mantener el CHECK
   `modo_coherente`. Quitar la columna legacy `transportista` TEXT. Decidir si se queda `empresa` en items.
2. **Catálogo:** seed de `transportistas` con los reales de Brand It.
3. **API:** copiar `src/app/api/guias/route.ts` + `[id]/route.ts` + `notify` + `transportistas`. Ajustar
   `GUIAS_ROLES` a los roles de Brand It. Conservar: numeración con retry, reemplazo seguro de items
   (orden negativo), guards de estado.
4. **Front:** copiar `src/app/guias/**`. Reemplazar `constants.ts` (clientes/direcciones/empresas/entregadores).
   Si Brand It es mono-empresa, simplificar la columna empresa.
5. **PDF:** portar `generateGuiaPdf()`. Cambiar textos/logo si aplica.
6. **Email:** cambiar `from`/`to` a dominios de Brand It; configurar dominio en Resend; ajustar el cron
   (`vercel.json`) y la zona horaria.
7. **Firmas:** portar `SignatureCanvas.tsx` + `canvasUtils.ts` tal cual (genérico).
8. Opcional: `logActivity`, `cron_email_errors`, endurecer RLS.

---

# 8. PrintDocument.tsx — plantilla A4 de impresión (browser) — código completo

Vista imprimible que se renderiza en `/guias/[id]/imprimir` (envuelta por `GuiaDetail.tsx`). Es un
componente React que imprime con `window.print()`: usa Tailwind para la vista en pantalla y un bloque
`<style>{ @media print … }>` que ajusta tamaños a A4 portrait al imprimir. A diferencia del PDF del cron
(sección 5.1, hecho con jsPDF), este usa el **logo** (`/logo.jpeg`) y es la versión que el usuario imprime
desde el navegador.

**Ruta exacta:** `src/app/guias/components/PrintDocument.tsx`

**Notas de port a Brand It:**
- Depende de helpers `fmtDate` y `fmtGuia` de `@/lib/format` (formato de fecha "5 abr 2026" y `GT-042`).
- El logo está hardcodeado a `/logo.jpeg` (asset en `public/`). Reemplazar por el de Brand It.
- La columna `EMPRESA` y `N GUIA TRANSP.` son de la lógica multi-empresa/transportista externo de fashiongr
  (ver §6.1) — ajustar/quitar si Brand It es mono-empresa o no usa transportista externo.
- Maneja los dos modos vía `isDirect = g.tipo_despacho === "directo"`: cambia labels de las firmas
  (Chofer/Cliente vs Despachado por/Transportista) y muestra/oculta el campo PLACA.

```tsx
import { fmtDate, fmtGuia } from "@/lib/format";
import type { Guia } from "./types";

interface PrintDocumentProps {
  guia: Guia;
}

export default function PrintDocument({ guia: g }: PrintDocumentProps) {
  const guiaItems = g.guia_items || [];
  const bultos = guiaItems.reduce((s, i) => s + (i.bultos || 0), 0);
  const isDirect = g.tipo_despacho === "directo";

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          #print-document {
            font-size: 10px !important;
            padding: 12px !important;
            position: absolute; left: 0; top: 0; width: 100%;
          }
          #print-document h1 { font-size: 13px !important; margin-bottom: 8px !important; }
          #print-document table { font-size: 9px !important; }
          #print-document table th,
          #print-document table td { padding: 2px 4px !important; }
          #print-document .print-header { margin-bottom: 6px !important; gap: 4px !important; }
          #print-document .print-header > div { gap: 2px !important; }
          #print-document .print-obs { margin-bottom: 8px !important; }
          #print-document .print-obs > div:last-child { min-height: 24px !important; padding: 4px !important; }
          #print-document .print-signatures { margin-top: 10px !important; gap: 16px !important; }
          #print-document .print-signatures > div > div:first-child { margin-bottom: 8px !important; }
          #print-document .print-signatures img { height: 30px !important; }
          #print-document .print-footer { margin-top: 8px !important; padding-top: 4px !important; }
          #print-document * { page-break-inside: avoid; }
        }
      `}</style>
      <div
        id="print-document"
        className="border border-gray-200 rounded-lg p-8"
        style={{ fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}
      >
        <div className="flex items-center justify-center gap-3 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpeg" alt="FG" className="w-9 h-9 rounded" />
          <h1 className="text-lg font-bold uppercase tracking-wide">
            Guia de Transporte Interior
          </h1>
        </div>

        <div className="print-header grid grid-cols-2 gap-4 mb-4 text-sm">
          <div className="flex gap-2">
            <span className="font-medium">N GUIA:</span>
            <span className="border-b border-gray-300 flex-1 text-center">{fmtGuia(g.numero)}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium">FECHA:</span>
            <span className="border-b border-gray-300 flex-1 text-center">{fmtDate(g.fecha)}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium">TRANSPORTISTA:</span>
            <span className="border-b border-gray-300 flex-1 text-center">{g.transportista}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium">PLACA / VEHICULO:</span>
            <span className="border-b border-gray-300 flex-1 text-center">
              {g.placa || " "}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium">DESPACHADO POR:</span>
            <span className="border-b border-gray-300 flex-1 text-center">
              {g.entregado_por || " "}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium">TIPO:</span>
            <span className="border-b border-gray-300 flex-1 text-center">
              {isDirect ? "Entrega directa" : "Transportista externo"}
            </span>
          </div>
          {g.numero_guia_transp && (
            <div className="flex gap-2">
              <span className="font-medium">N GUIA TRANSP.:</span>
              <span className="border-b border-gray-300 flex-1 text-center">
                {g.numero_guia_transp}
              </span>
            </div>
          )}
          {isDirect && g.nombre_chofer && (
            <div className="flex gap-2">
              <span className="font-medium">CHOFER:</span>
              <span className="border-b border-gray-300 flex-1 text-center">
                {g.nombre_chofer}
              </span>
            </div>
          )}
        </div>

        <hr className="border-gray-300 mb-4" />

        <table className="w-full text-xs border-collapse mb-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-1.5 font-medium w-8">#</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">CLIENTE</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">DIRECCION</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">EMPRESA</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">FACTURA(S)</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium w-16 text-center">BULTOS</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">N GUIA TRANSP.</th>
            </tr>
          </thead>
          <tbody>
            {guiaItems.map((item, i) => (
              <tr key={i}>
                <td className="border border-gray-300 px-2 py-1 text-center">{i + 1}</td>
                <td className="border border-gray-300 px-2 py-1">{item.cliente}</td>
                <td className="border border-gray-300 px-2 py-1">{item.direccion}</td>
                <td className="border border-gray-300 px-2 py-1">{item.empresa}</td>
                <td className="border border-gray-300 px-2 py-1">{item.facturas}</td>
                <td className="border border-gray-300 px-2 py-1 text-center">{item.bultos || ""}</td>
                <td className="border border-gray-300 px-2 py-1">{g.numero_guia_transp || " "}</td>
              </tr>
            ))}
            <tr className="font-bold bg-gray-50">
              <td colSpan={5} className="border border-gray-300 px-2 py-1.5 text-right uppercase text-xs">
                Total de bultos despachados
              </td>
              <td className="border border-gray-300 px-2 py-1.5 text-center">{bultos}</td>
              <td className="border border-gray-300"></td>
            </tr>
          </tbody>
        </table>

        <div className="print-obs mb-8 text-xs">
          <div className="font-medium uppercase mb-1">Observaciones Generales del Envio</div>
          <div className="border border-gray-300 rounded p-2 min-h-[40px] whitespace-pre-wrap">
            {g.observaciones || ""}
          </div>
        </div>

        <div className="print-signatures grid grid-cols-2 gap-12 mt-12 text-xs">
          {/* Left column */}
          <div>
            <div className="font-medium uppercase mb-6">
              {isDirect ? "Chofer" : "Despachado por"}
            </div>
            <div className="mb-4">
              NOMBRE:{" "}
              <span className="ml-1 font-medium">
                {isDirect ? (g.nombre_chofer || "") : (g.entregado_por || "")}
              </span>
              {!(isDirect ? g.nombre_chofer : g.entregado_por) && (
                <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>
              )}
            </div>
            <div>
              FIRMA:{" "}
              {g.firma_base64 ? (
                <img src={g.firma_base64} alt="Firma" style={{ height: 40 }} className="inline-block ml-1" />
              ) : (
                <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>
              )}
            </div>
            <div className="text-gray-400 mt-2 italic">Nombre y firma</div>
          </div>
          {/* Right column */}
          <div>
            <div className="font-medium uppercase mb-6">
              {isDirect ? "Recibido por — Cliente" : "Recibido Conforme — Transportista"}
            </div>
            {!isDirect && (
              <div className="mb-4">
                PLACA:{" "}
                <span className="ml-1 font-medium">{g.placa || ""}</span>
                {!g.placa && <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>}
              </div>
            )}
            <div className="mb-4">
              NOMBRE:{" "}
              <span className="ml-1 font-medium">{g.receptor_nombre || ""}</span>
              {!g.receptor_nombre && <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>}
            </div>
            <div className="mb-4">
              CEDULA:{" "}
              <span className="ml-1 font-medium">{g.cedula || ""}</span>
              {!g.cedula && <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>}
            </div>
            <div>
              FIRMA:{" "}
              {g.firma_entregador_base64 ? (
                <img src={g.firma_entregador_base64} alt="Firma" style={{ height: 40 }} className="inline-block ml-1" />
              ) : (
                <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>
              )}
            </div>
            <div className="text-gray-400 mt-2 italic">Nombre, cedula y firma</div>
          </div>
        </div>

        <div className="print-footer mt-8 pt-4 border-t border-gray-200 text-[9px] text-gray-400 text-center leading-relaxed">
          La firma del transportista constituye aceptacion expresa de la mercancia detallada en este
          documento, en la cantidad y condicion indicadas. Cualquier faltante o dano no reportado al
          momento de la recepcion sera responsabilidad exclusiva del transportista.
        </div>
      </div>
    </>
  );
}
```

---

*Fin del documento. Read-only — generado leyendo fashiongr sin commits.*
