// Tests del escape RFC 4180 de los exports CSV (I11).
// Cubre escapeCsvField/buildCsv y un round-trip (generar → parsear con papaparse)
// que verifica que valores con ";" y comillas llegan EXACTOS, sin mutación.
import { describe, it, expect } from "vitest";
import Papa from "papaparse";
import { escapeCsvField, buildCsv } from "@/lib/csv-export";

describe("escapeCsvField", () => {
  it("deja intacto un valor normal sin caracteres especiales", () => {
    expect(escapeCsvField("Juan Pérez", ",")).toBe("Juan Pérez");
    expect(escapeCsvField("Juan Pérez", ";")).toBe("Juan Pérez");
  });

  it("envuelve en comillas un valor que contiene el delimitador", () => {
    expect(escapeCsvField("Pérez, Juan", ",")).toBe('"Pérez, Juan"');
    expect(escapeCsvField("nota; con punto y coma", ";")).toBe('"nota; con punto y coma"');
  });

  it("NO envuelve si el valor contiene el OTRO delimitador (cada export conserva el suyo)", () => {
    // Con delimitador ",", un ";" interno no requiere comillas — y viceversa.
    expect(escapeCsvField("nota; interna", ",")).toBe("nota; interna");
    expect(escapeCsvField("Pérez, Juan", ";")).toBe("Pérez, Juan");
  });

  it("DOBLA las comillas internas y envuelve (bug original de CXC: no doblaba)", () => {
    expect(escapeCsvField('Almacén "El Ahorro"', ",")).toBe('"Almacén ""El Ahorro"""');
  });

  it("envuelve valores con saltos de línea (\\n y \\r)", () => {
    expect(escapeCsvField("línea 1\nlínea 2", ";")).toBe('"línea 1\nlínea 2"');
    expect(escapeCsvField("línea 1\r\nlínea 2", ";")).toBe('"línea 1\r\nlínea 2"');
  });

  it("convierte null/undefined en campo vacío y números en string sin tocarlos", () => {
    expect(escapeCsvField(null, ";")).toBe("");
    expect(escapeCsvField(undefined, ",")).toBe("");
    expect(escapeCsvField(1234.5, ",")).toBe("1234.5");
  });
});

describe("buildCsv", () => {
  it("une filas con \\n y campos con el delimitador dado", () => {
    const csv = buildCsv(
      [
        ["a", "b"],
        ["c", "d"],
      ],
      ";"
    );
    expect(csv).toBe("a;b\nc;d");
  });

  it("escapa solo los campos que lo necesitan", () => {
    const csv = buildCsv([["normal", "con,coma", 'con"comilla']], ",");
    expect(csv).toBe('normal,"con,coma","con""comilla"');
  });
});

describe("round-trip: generar CSV → parsear → valores EXACTOS", () => {
  it('fila con ";" y comillas en campos (delimitador ";", como reclamos/directorio)', () => {
    const original = [
      "CLIENTE; CON PUNTO Y COMA",
      'Nota con "comillas" y; ambos',
      "línea 1\nlínea 2",
      "normal",
      "",
    ];
    const csv = buildCsv([original], ";");
    const parsed = Papa.parse<string[]>(csv, { delimiter: ";" });
    expect(parsed.errors).toEqual([]);
    expect(parsed.data[0]).toEqual(original);
  });

  it('filas tipo directorio con header (el valor con ";" ya NO se muta a ",")', () => {
    const header = ["nombre", "empresa", "telefono", "celular", "correo", "contacto", "notas"];
    const row = ["ALMACEN \"LA ECONOMIA\"; S.A.", "Fashion Wear", "225-1234", null, "a@b.com", "María; ventas", "cobra lunes\ny martes"];
    const csv = buildCsv([header, row], ";");
    const parsed = Papa.parse<string[]>(csv, { delimiter: ";" });
    expect(parsed.errors).toEqual([]);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data[0]).toEqual(header);
    // null → "" ; el resto llega byte a byte idéntico (sin reemplazos)
    expect(parsed.data[1]).toEqual(["ALMACEN \"LA ECONOMIA\"; S.A.", "Fashion Wear", "225-1234", "", "a@b.com", "María; ventas", "cobra lunes\ny martes"]);
  });

  it('fila tipo CXC con "," y comillas en el nombre (delimitador ",")', () => {
    const row = ['TIENDA "MI BEBE", S.A.', "100.00", "0.00", "Por vencer"];
    const csv = buildCsv([row], ",");
    const parsed = Papa.parse<string[]>(csv, { delimiter: "," });
    expect(parsed.errors).toEqual([]);
    expect(parsed.data[0]).toEqual(row);
  });
});
