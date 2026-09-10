// ─────────────────────────────────────────────────────────────────────────────
// EL CUADRITO DE UNA NOVEDAD — SVG EN LÍNEA (9-sep-2026).
//
// Daniel: *«yo dibujo un cuadrito simple — la flechita, el botón nuevo — sin
// captura real»*. Esto lo dibuja.
//
// 🔴 QUÉ se dibuja lo dice `src/lib/novedades/dibujos.ts` (dato puro). Acá solo
// se pinta. Dos archivos y no uno para que el catálogo se pruebe sin React.
//
// 🔴 SE SIENTE DEL SISTEMA (Daniel, 9-sep-2026: *«que se sienta como si fuese
// del sistema»*), y por dos cosas DERIVADAS, no escritas a mano:
//   · el acento es EL COLOR DE SU MÓDULO (`src/lib/moduleColors.ts`), el mismo
//     filete que ya pinta el encabezado: un aviso de Guías sale esmeralda y uno
//     de Préstamos, rosa. 🩸 Antes los catorce salían del MISMO `teal`, un color
//     que la paleta de Fashion Group no usa en ningún módulo. Un módulo que no
//     está en ese mapa (Comisiones, Asistencia) cae al GRIS de siempre — no se
//     le inventa un tono.
//   · el botón principal se dibuja NEGRO RELLENO con letra blanca, que es como
//     se ve en la app (`bg-black text-white`). 🩸 Antes «Cobrar» se dibujaba con
//     borde, o sea igual que un campo de texto: quien buscara el botón negro no
//     lo iba a reconocer.
//
// 🔴 NI UN `#hex`. Todo sale de las CLASES que ya usa la app —`stroke-current`,
// `fill-current`, `fill-white` y el `text-…` del módulo—, así el dibujo se ve
// donde se vea la app. Un color clavado es un dibujo negro sobre negro el día
// que la pantalla cambie de fondo. Hay candado que lo exige.
//
// 🔴 SIN DIBUJO, LA NOVEDAD SE VE COMO SIEMPRE: `clave` vacía o desconocida →
// no se dibuja nada, y el renglón queda idéntico al de antes.
//
// ⚠️ Nada se mueve: no hay animación, así que `prefers-reduced-motion` no tiene
// nada que apagar.
// ─────────────────────────────────────────────────────────────────────────────
import { getModuleColorByKey } from "@/lib/moduleColors";
import {
  ALTO,
  CAJA_H,
  CAJA_Y,
  CARET_W,
  DIBUJOS,
  FLECHITA_W,
  FUENTE,
  PESTANA_GAP,
  PESTANA_W,
  anchoDePieza,
  anchoTotal,
  esDibujoConocido,
  posicionesDe,
  type Pieza,
} from "@/lib/novedades/dibujos";

/** El gris de siempre, para el módulo que no tiene color propio. */
export const ACENTO_SIN_COLOR = "text-gray-700";

/**
 * El negro del botón principal de la casa (`bg-black text-white`).
 *
 * ⚠️ Lleva su variante oscura aunque hoy la tira viva siempre sobre claro
 * (`bg-gray-50`): un relleno negro clavado es exactamente lo que desaparece el
 * día que la pantalla cambie de fondo. Se invierte, no se apaga.
 */
const NEGRO = "text-black dark:text-white";
/** La letra de adentro del botón negro, que va al revés que el relleno. */
const LETRA_DEL_BOTON = "fill-white dark:fill-black";

/**
 * 🔴 EL ACENTO SALE DEL MÓDULO, NUNCA SE ESCRIBE. Es la misma clase que pinta
 * el filete del encabezado, así que el cuadrito y la pantalla que describe
 * andan del mismo color. Sin color en el mapa, gris.
 */
export function acentoDelModulo(modulo?: string): string {
  return getModuleColorByKey(modulo)?.text ?? ACENTO_SIN_COLOR;
}

/**
 * El redondeo de una caja. El botón de la app es `rounded-md` (6 px) sobre unos
 * 25 px de alto; acá la caja mide 16, así que la MISMA proporción da 4 — y
 * mirado en pantalla, 3 se veía más cuadrado que todo lo demás del sistema.
 */
export const RADIO = 4;

/** Una caja: el control con su rótulo adentro. */
function Caja({ x, p, acento }: { x: number; p: Extract<Pieza, { t: "caja" }>; acento: string }) {
  const w = anchoDePieza(p);
  const medio = CAJA_Y + CAJA_H / 2;
  // El rótulo se corre a la izquierda cuando hay flechita o cursor a la derecha.
  const reservado = (p.flechita ? FLECHITA_W : 0) + (p.caret ? CARET_W : 0);
  const color = p.boton ? NEGRO : p.fuerte ? acento : undefined;
  return (
    <g className={color} opacity={p.apagado ? 0.45 : 1}>
      <rect
        x={x} y={CAJA_Y} width={w} height={CAJA_H} rx={RADIO}
        className={p.boton ? "fill-current" : "stroke-current"}
        strokeWidth={p.fuerte ? 1.6 : 1}
        fill={p.boton ? undefined : "none"}
      />
      <text
        x={x + (w - reservado) / 2} y={medio + FUENTE / 3}
        textAnchor="middle" fontSize={FUENTE}
        fontWeight={p.fuerte || p.boton ? 600 : 400}
        className={p.boton ? LETRA_DEL_BOTON : "fill-current"}
      >
        {p.texto}
      </text>
      {p.caret && (
        <line
          x1={x + w - 8} y1={CAJA_Y + 4} x2={x + w - 8} y2={CAJA_Y + CAJA_H - 4}
          className="stroke-current" strokeWidth={1.2} strokeLinecap="round"
        />
      )}
      {p.flechita && (
        <text
          x={x + w - 8} y={medio + FUENTE / 3} textAnchor="middle"
          fontSize={FUENTE + 1} className="fill-current" opacity={0.6}
        >
          ↓
        </text>
      )}
      {p.tachado && (
        <line
          x1={x + 2} y1={CAJA_Y + CAJA_H - 2} x2={x + w - 2} y2={CAJA_Y + 2}
          className="stroke-current" strokeWidth={1.2} strokeLinecap="round"
        />
      )}
    </g>
  );
}

/** La flecha del «pasó a ser». */
function Flecha({ x }: { x: number }) {
  const y = CAJA_Y + CAJA_H / 2;
  return (
    <g
      className="stroke-current" strokeWidth={1.2} fill="none"
      strokeLinecap="round" strokeLinejoin="round" opacity={0.7}
    >
      <line x1={x} y1={y} x2={x + 11} y2={y} />
      <polyline points={`${x + 7},${y - 3.5} ${x + 11},${y} ${x + 7},${y + 3.5}`} />
    </g>
  );
}

/** Una tira de pestañas; las que se fueron llevan su raya encima. */
function Pestanas({ x, p, acento }: { x: number; p: Extract<Pieza, { t: "pestanas" }>; acento: string }) {
  const paso = PESTANA_W + PESTANA_GAP;
  return (
    <g className={p.fuerte ? acento : undefined}>
      {Array.from({ length: p.n }, (_, i) => {
        const se_fue = p.tachadasDesde !== undefined && i >= p.tachadasDesde;
        const px = x + i * paso;
        return (
          <g key={i} opacity={se_fue ? 0.45 : 1}>
            <rect
              x={px} y={CAJA_Y} width={PESTANA_W} height={CAJA_H} rx={RADIO - 1}
              className="stroke-current" strokeWidth={p.fuerte ? 1.6 : 1} fill="none"
            />
            {se_fue && (
              <line
                x1={px + 1} y1={CAJA_Y + CAJA_H - 1} x2={px + PESTANA_W - 1} y2={CAJA_Y + 1}
                className="stroke-current" strokeWidth={1.1} strokeLinecap="round"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Tres renglones: «una sola lista». */
function Lista({ x, acento }: { x: number; acento: string }) {
  const w = 40;
  return (
    <g className={acento}>
      <rect
        x={x} y={CAJA_Y} width={w} height={CAJA_H} rx={RADIO}
        className="stroke-current" strokeWidth={1.6} fill="none"
      />
      {[0, 1, 2].map((i) => (
        <line
          key={i}
          x1={x + 5} y1={CAJA_Y + 4.5 + i * 3.5} x2={x + w - 5} y2={CAJA_Y + 4.5 + i * 3.5}
          className="stroke-current" strokeWidth={1} strokeLinecap="round" opacity={0.8}
        />
      ))}
    </g>
  );
}

/** Caja de línea cortada: un lugar donde soltar algo. */
function Punteada({ x, p, acento }: { x: number; p: Extract<Pieza, { t: "punteada" }>; acento: string }) {
  const w = anchoDePieza(p);
  return (
    <g className={acento}>
      <rect
        x={x} y={CAJA_Y} width={w} height={CAJA_H} rx={RADIO}
        className="stroke-current" strokeWidth={1.3} strokeDasharray="3 2.5" fill="none"
      />
      <text
        x={x + w / 2} y={CAJA_Y + CAJA_H / 2 + FUENTE / 3}
        textAnchor="middle" fontSize={FUENTE} className="fill-current"
      >
        {p.texto}
      </text>
    </g>
  );
}

/** Texto subrayado: esto se toca. */
function Enlace({ x, p, acento }: { x: number; p: Extract<Pieza, { t: "enlace" }>; acento: string }) {
  const w = anchoDePieza(p);
  const base = CAJA_Y + CAJA_H / 2 + FUENTE / 3;
  return (
    <g className={acento}>
      <text x={x} y={base} fontSize={FUENTE} className="fill-current">
        {p.texto}
      </text>
      <line
        x1={x} y1={base + 2.5} x2={x + w} y2={base + 2.5}
        className="stroke-current" strokeWidth={1} strokeLinecap="round"
      />
    </g>
  );
}

/** El ⚙ de configuración: un círculo con sus dientes. */
function Engranaje({ x, acento }: { x: number; acento: string }) {
  const cx = x + 9;
  const cy = CAJA_Y + CAJA_H / 2;
  return (
    <g className={`${acento} stroke-current`} strokeWidth={1.3} fill="none" strokeLinecap="round">
      {/* Aro grueso + dientes CORTOS y un hueco adentro: medido en pantalla,
          un círculo fino con rayas largas se lee como un sol, no como un ⚙. */}
      <circle cx={cx} cy={cy} r={5} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={1.8} />
      {[0, 60, 120, 180, 240, 300].map((grados) => {
        const rad = (grados * Math.PI) / 180;
        return (
          <line
            key={grados}
            x1={cx + Math.cos(rad) * 5.5} y1={cy + Math.sin(rad) * 5.5}
            x2={cx + Math.cos(rad) * 7.2} y2={cy + Math.sin(rad) * 7.2}
            strokeWidth={2.2}
          />
        );
      })}
    </g>
  );
}

function dibujarPieza(p: Pieza, x: number, i: number, acento: string) {
  switch (p.t) {
    case "caja": return <Caja key={i} x={x} p={p} acento={acento} />;
    case "flecha": return <Flecha key={i} x={x} />;
    case "pestanas": return <Pestanas key={i} x={x} p={p} acento={acento} />;
    case "lista": return <Lista key={i} x={x} acento={acento} />;
    case "punteada": return <Punteada key={i} x={x} p={p} acento={acento} />;
    case "enlace": return <Enlace key={i} x={x} p={p} acento={acento} />;
    case "engranaje": return <Engranaje key={i} x={x} acento={acento} />;
  }
}

/**
 * El cuadrito de una novedad. Sin `clave` —o con una que no conoce— no dibuja
 * nada: la novedad se ve exactamente como antes de que existieran los dibujos.
 */
export default function DibujoNovedad({ clave, modulo }: { clave?: string; modulo?: string }) {
  if (!esDibujoConocido(clave)) return null;
  const { alt, piezas } = DIBUJOS[clave];
  const ancho = anchoTotal(piezas);
  const xs = posicionesDe(piezas);
  const acento = acentoDelModulo(modulo);

  return (
    <svg
      role="img"
      aria-label={alt}
      width={ancho}
      height={ALTO}
      viewBox={`0 0 ${ancho} ${ALTO}`}
      preserveAspectRatio="xMinYMid meet"
      // En el celular, si no cabe al lado del texto se achica sin deformarse.
      className="max-w-full text-gray-500"
      data-dibujo={clave}
    >
      <title>{alt}</title>
      {piezas.map((p, i) => dibujarPieza(p, xs[i], i, acento))}
    </svg>
  );
}
