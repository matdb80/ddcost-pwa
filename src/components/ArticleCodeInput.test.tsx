// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ArticleCodeInput from "./ArticleCodeInput";

afterEach(() => cleanup());

const field = (seen: string[], value = "TRN0000037B") =>
  render(<ArticleCodeInput aria-label="Codice articolo" value={value} protectedPrefix="TRN0000037B" onChange={v => seen.push(v)} />);

describe("ArticleCodeInput con prefisso protetto (codice temporaneo ottone/alluminio)", () => {
  it("converte in maiuscolo il suffisso digitato", () => {
    const seen: string[] = [];
    field(seen);
    fireEvent.change(screen.getByLabelText("Codice articolo"), { target: { value: "TRN0000037Bz" } });
    expect(seen).toEqual(["TRN0000037BZ"]);
  });

  it("converte in maiuscolo il suffisso incollato", () => {
    const seen: string[] = [];
    field(seen);
    const input = screen.getByLabelText("Codice articolo");
    fireEvent.focus(input);
    fireEvent.paste(input, { clipboardData: { getData: () => "z" } });
    expect(seen).toEqual(["TRN0000037BZ"]);
  });

  it("rifiuta modifiche non valide e incolla multi-carattere", () => {
    const seen: string[] = [];
    field(seen);
    const input = screen.getByLabelText("Codice articolo");
    fireEvent.change(input, { target: { value: "TRN0000037Bzz" } });
    fireEvent.change(input, { target: { value: "TRN0000038Bz" } });
    fireEvent.paste(input, { clipboardData: { getData: () => "zz" } });
    expect(seen).toEqual([]);
  });

  it("rifiuta «ß»: in maiuscolo diventerebbe «SS» e il codice avrebbe 13 caratteri", () => {
    const seen: string[] = [];
    field(seen);
    const input = screen.getByLabelText("Codice articolo");
    // digitazione: «…Bß» → maiuscolo «…BSS» → non valido, nessuna emissione
    fireEvent.change(input, { target: { value: "TRN0000037Bß" } });
    // incolla: «ß» non è un suffisso valido, il gestore non interviene
    fireEvent.focus(input);
    fireEvent.paste(input, { clipboardData: { getData: () => "ß" } });
    expect(seen).toEqual([]);
  });

  it("senza prefisso protetto non converte nulla", () => {
    const seen: string[] = [];
    render(<ArticleCodeInput aria-label="Codice articolo" value="abc" onChange={v => seen.push(v)} />);
    fireEvent.change(screen.getByLabelText("Codice articolo"), { target: { value: "abcz" } });
    expect(seen).toEqual(["abcz"]);
  });
});

describe("ArticleCodeInput: i primi 11 caratteri restano protetti", () => {
  const setup = (value = "TRN0000037B") => {
    const seen: string[] = [];
    render(<ArticleCodeInput aria-label="Codice articolo" value={value} protectedPrefix="TRN0000037B" onChange={v => seen.push(v)} />);
    const input = screen.getByLabelText("Codice articolo") as HTMLInputElement;
    fireEvent.focus(input); // il focus porta il cursore dopo il prefisso
    return { input, seen };
  };

  it("blocca Backspace/Delete/digitazione dentro il prefisso", () => {
    const { input } = setup();
    input.setSelectionRange(11, 11); // cursore subito dopo «B»: Backspace cancellerebbe il prefisso
    expect(fireEvent.keyDown(input, { key: "Backspace" })).toBe(false);
    input.setSelectionRange(4, 4); // cursore nel mezzo del prefisso
    expect(fireEvent.keyDown(input, { key: "Backspace" })).toBe(false);
    expect(fireEvent.keyDown(input, { key: "Delete" })).toBe(false);
    expect(fireEvent.keyDown(input, { key: "x" })).toBe(false);
    input.setSelectionRange(0, 11); // selezione dell'intero prefisso
    expect(fireEvent.keyDown(input, { key: "Backspace" })).toBe(false);
    expect(fireEvent.cut(input)).toBe(false);
  });

  it("lascia liberi i tasti sul dodicesimo carattere e la copia dal prefisso", () => {
    const { input } = setup("TRN0000037BZ");
    input.setSelectionRange(12, 12); // dopo il suffisso
    expect(fireEvent.keyDown(input, { key: "Backspace" })).toBe(true);
    expect(fireEvent.keyDown(input, { key: "y" })).toBe(true);
    input.setSelectionRange(11, 11); // prima del suffisso: Delete lo cancella
    expect(fireEvent.keyDown(input, { key: "Delete" })).toBe(true);
    input.setSelectionRange(0, 11); // copia del prefisso resta consentita
    expect(fireEvent.keyDown(input, { key: "c", ctrlKey: true })).toBe(true);
  });

  it("incolla accetta il codice intero solo con il prefisso intatto", () => {
    const { input, seen } = setup();
    fireEvent.paste(input, { clipboardData: { getData: () => "trn0000037Bz" } });
    fireEvent.change(input, { target: { value: "trn0000037Bz" } });
    expect(seen).toEqual([]);
    fireEvent.paste(input, { clipboardData: { getData: () => "TRN0000037Bz" } });
    fireEvent.paste(input, { clipboardData: { getData: () => "TRN0000038BZ" } });
    fireEvent.paste(input, { clipboardData: { getData: () => "TRN0000037BSS" } });
    expect(seen).toEqual(["TRN0000037BZ"]);
  });
});
