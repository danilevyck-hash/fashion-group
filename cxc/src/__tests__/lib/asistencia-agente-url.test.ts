// ─────────────────────────────────────────────────────────────────────────────
// La dirección a la que el agente del reloj le manda las marcaciones.
//
// 🩸 POR QUÉ EXISTE ESTE CANDADO (medido el 7-ago-2026 en la PC de la oficina).
// El agente recién instalado repetía cada 3 minutos:
//
//     No se pudo consultar fashiongr: No se pudo leer el estado: No autorizado.
//
// La llave estaba PERFECTA — el mismo pedido con la misma llave desde otra
// máquina daba HTTP 200. Lo que fallaba era la dirección: `https://fashiongr.com`
// (sin `www`) contesta **307** hacia `https://www.fashiongr.com`, y en un
// redirect hacia otro origen `fetch` **descarta el encabezado `Authorization`**.
// Lo manda el estándar, no es un bug de Node: la credencial no se reenvía a un
// host que no la pidió. El servidor recibía un pedido sin credencial y contestaba
// lo único que podía.
//
// Lo caro no fue el redirect: fue que el síntoma apunta al lugar equivocado.
// "No autorizado" hace revisar la llave, y la llave no se puede mirar por chat.
// Por eso la corrección vive en el código y no en el `.env` — el archivo lo
// llena a mano quien instale el agente, puede copiar un ejemplo viejo, y el
// error se le va a ver otra vez como "la llave está mal".
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
// El agente es JS puro sin tipos: corre en la PC de la oficina con Node pelado,
// sin `npm install` y sin build.
import { normalizarBase } from "../../../scripts/agente-reloj/config.mjs";

const leer = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const CARPETA = "scripts/agente-reloj";

describe("🔴 la dirección de fashiongr SIEMPRE lleva www y https", () => {
  it("el caso real que falló: sin www se corrige solo", () => {
    expect(normalizarBase("https://fashiongr.com")).toBe("https://www.fashiongr.com");
  });

  it("http también se corrige — cambiar de esquema también es otro origen", () => {
    // `http://www.fashiongr.com` redirige a `https://`, y ahí la llave se pierde
    // igual que con el `www`. Arreglar solo el host habría dejado media puerta.
    expect(normalizarBase("http://fashiongr.com")).toBe("https://www.fashiongr.com");
    expect(normalizarBase("http://www.fashiongr.com")).toBe("https://www.fashiongr.com");
  });

  it("tolera lo que alguien escribe a mano: sin esquema, con barra al final, con espacios", () => {
    for (const escrito of [
      "fashiongr.com",
      "https://fashiongr.com/",
      "  https://FASHIONGR.com  ",
      "https://fashiongr.com///",
    ]) {
      expect(normalizarBase(escrito)).toBe("https://www.fashiongr.com");
    }
  });

  it("vacío o ausente cae en la dirección buena, no en una a medias", () => {
    for (const nada of ["", "   ", null, undefined]) {
      expect(normalizarBase(nada)).toBe("https://www.fashiongr.com");
    }
  });

  it("⚠️ NO se mete con otras direcciones — un ambiente de prueba tiene que poder apuntar a otro lado", () => {
    expect(normalizarBase("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizarBase("https://cxc-git-rama.vercel.app")).toBe("https://cxc-git-rama.vercel.app");
  });
});

describe("🔴 el ejemplo que se copia no puede enseñar el error", () => {
  it(".env.ejemplo trae la dirección con www", () => {
    const env = leer(`${CARPETA}/.env.ejemplo`);
    expect(env).toContain("FASHIONGR_URL=https://www.fashiongr.com");
    // Y no puede quedar la vieja suelta en un comentario: se copia igual.
    expect(env).not.toMatch(/FASHIONGR_URL=https:\/\/fashiongr\.com/);
  });

  it("la config usa el normalizador y no arma la dirección a mano", () => {
    const src = leer(`${CARPETA}/config.mjs`);
    expect(src).toContain("base: normalizarBase(env.FASHIONGR_URL)");
  });
});

describe('⚠️ "No autorizado" tiene que decir dónde mirar', () => {
  it("la pista aparece en las dos formas de correr el agente", () => {
    // 🩸 El mensaje pelado mandó a revisar la llave, que era lo único correcto.
    // Ahora dice las DOS causas posibles y en qué archivo están.
    const src = leer(`${CARPETA}/agente.mjs`);
    expect(src).toContain("function pistaLlave(");
    // En `--probar` (la prueba de instalación) y en el bucle normal.
    expect(src.match(/pistaLlave\(config\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("🔒 la pista NUNCA imprime la llave, solo su largo", () => {
    // Un log se termina mandando por WhatsApp. Se muestra el largo y los dos
    // extremos: alcanza para cazar el espacio pegado o el "PONER-LA-LLAVE-AQUI"
    // sin dejar el secreto escrito en ningún lado.
    const src = leer(`${CARPETA}/agente.mjs`);
    const cuerpo = src.slice(src.indexOf("function pistaLlave("));
    expect(cuerpo).toMatch(/s\.length/);
    expect(cuerpo).not.toMatch(/\$\{s\}|\$\{config\.secret\}|\$\{secret\}/);
  });

  it("se explica UNA vez, no en cada vuelta", () => {
    // Con vueltas de 3 minutos, repetirla deja el log ilegible justo cuando
    // hace falta leerlo.
    expect(leer(`${CARPETA}/agente.mjs`)).toContain("yaExpliqueLaLlave = true");
  });
});
