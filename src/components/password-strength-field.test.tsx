import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { scorePassword, isPasswordValid, PasswordStrengthField, DEFAULT_MIN_LENGTH } from "./password-strength-field";

describe("scorePassword", () => {
  it("retorna score 0 sem senha", () => {
    expect(scorePassword("")).toMatchObject({ score: 0, label: "" });
  });

  it("classifica senhas fracas, razoáveis, boas e fortes", () => {
    expect(scorePassword("abcdefgh").label).toBe("Fraca");
    expect(scorePassword("abcdefG1").label).toBe("Boa");
    expect(scorePassword("abcdefG1!").label).toBe("Forte");
    expect(scorePassword("aB1").label).toBe("Razoável");
  });

  it("respeita minLength customizado", () => {
    expect(scorePassword("aB1!", 4).label).toBe("Forte");
    expect(scorePassword("aB1!", DEFAULT_MIN_LENGTH).label).toBe("Boa");
  });
});

describe("isPasswordValid", () => {
  it("exige todos os requisitos", () => {
    expect(isPasswordValid("Abcdef1!")).toBe(true);
    expect(isPasswordValid("abcdef1!")).toBe(false);
    expect(isPasswordValid("Abcdef1")).toBe(false);
    expect(isPasswordValid("Abcdefg!")).toBe(false);
    expect(isPasswordValid("Abc1!")).toBe(false);
    expect(isPasswordValid("Abc1!", 5)).toBe(true);
  });
});

describe("PasswordStrengthField", () => {
  it("propaga alterações e alterna visibilidade", async () => {
    const onChange = vi.fn();
    render(<PasswordStrengthField value="" onChange={onChange} showConfirm={false} />);
    const input = screen.getByLabelText("Senha");
    expect(input).toHaveAttribute("type", "password");
    await userEvent.type(input, "A");
    expect(onChange).toHaveBeenCalledWith("A");
    await userEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "text");
  });

  it("mostra requisitos e força quando há valor", () => {
    render(<PasswordStrengthField value="Abcdef1!" onChange={() => {}} showConfirm={false} />);
    expect(screen.getByText("Forte")).toBeInTheDocument();
    expect(screen.getByText(/Pelo menos 8 caracteres/)).toBeInTheDocument();
  });

  it("avisa quando a confirmação diverge", () => {
    render(
      <PasswordStrengthField value="Abcdef1!" onChange={() => {}} confirmValue="Abcdef1" onConfirmChange={() => {}} />,
    );
    expect(screen.getByText("As senhas não conferem.")).toBeInTheDocument();
  });

  it("não avisa quando a confirmação confere", () => {
    render(
      <PasswordStrengthField value="Abcdef1!" onChange={() => {}} confirmValue="Abcdef1!" onConfirmChange={() => {}} />,
    );
    expect(screen.queryByText("As senhas não conferem.")).not.toBeInTheDocument();
  });
});
