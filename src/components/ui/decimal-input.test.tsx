import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DecimalInput } from "./decimal-input";

describe("DecimalInput", () => {
  it("começa vazio para null e undefined", () => {
    const { rerender } = render(<DecimalInput value={null} onChange={() => {}} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("");
    rerender(<DecimalInput value={undefined} onChange={() => {}} />);
    expect(input.value).toBe("");
    expect(input).toHaveAttribute("inputmode", "decimal");
  });

  it("mostra o valor externo com vírgula", () => {
    render(<DecimalInput value={12.5} onChange={() => {}} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("12,5");
  });

  it("emite números ao digitar com vírgula e descarta caracteres inválidos", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DecimalInput value={null} onChange={onChange} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;

    await user.type(input, "a1b2,5");
    expect(input.value).toBe("12,5");
    expect(onChange).toHaveBeenLastCalledWith(12.5);
  });

  it("bloqueia negativo por padrão e permite com allowNegative", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<DecimalInput value={null} onChange={onChange} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.type(input, "-5");
    expect(input.value).toBe("5");

    rerender(<DecimalInput value={null} onChange={onChange} allowNegative />);
    await user.clear(input);
    await user.type(input, "-5");
    expect(input.value).toBe("-5");
    expect(onChange).toHaveBeenLastCalledWith(-5);
  });

  it("emite NaN quando o campo fica vazio", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DecimalInput value={3} onChange={onChange} />);
    await user.clear(screen.getByRole("textbox"));
    expect(onChange).toHaveBeenLastCalledWith(Number.NaN);
  });

  it("formata no blur e chama o onBlur recebido", async () => {
    const user = userEvent.setup();
    const onBlur = vi.fn();
    render(<DecimalInput value={1234.5} onChange={() => {}} onBlur={onBlur} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.click(input);
    await user.tab();
    expect(input.value).toBe("1.234,50");
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("respeita fractionDigits e mantém vazio inválido no blur", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DecimalInput value={9.987} onChange={() => {}} fractionDigits={1} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.click(input);
    await user.tab();
    expect(input.value).toBe("10,0");

    rerender(<DecimalInput value={null} onChange={() => {}} fractionDigits={1} />);
    await user.click(input);
    await user.tab();
    expect(input.value).toBe("");
  });

  it("sincroniza quando o valor externo muda", () => {
    const { rerender } = render(<DecimalInput value={1} onChange={() => {}} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    rerender(<DecimalInput value={7.25} onChange={() => {}} />);
    expect(input.value).toBe("7,25");
    rerender(<DecimalInput value={null} onChange={() => {}} />);
    expect(input.value).toBe("");
  });
});
