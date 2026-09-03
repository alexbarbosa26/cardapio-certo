import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BusyButton } from "./busy-button";

describe("BusyButton", () => {
  it("executa o handler uma única vez em cliques repetidos", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const onClick = vi.fn(() => new Promise<void>((r) => { release = r; }));

    render(<BusyButton onClick={onClick}>Salvar</BusyButton>);
    const btn = screen.getByRole("button", { name: /salvar/i });

    await user.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn).toHaveAttribute("aria-busy", "true");

    await user.click(btn).catch(() => undefined);
    expect(onClick).toHaveBeenCalledTimes(1);

    release();
    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(btn).toHaveAttribute("aria-busy", "false");
  });

  it("mostra o texto alternativo quando loading é forçado", () => {
    render(<BusyButton loading busyText="Enviando...">Enviar</BusyButton>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveTextContent("Enviando...");
    expect(btn).toBeDisabled();
  });

  it("permanece desabilitado quando disabled é passado", async () => {
    const onClick = vi.fn();
    render(<BusyButton disabled onClick={onClick}>Pagar</BusyButton>);
    expect(screen.getByRole("button", { name: /pagar/i })).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("não quebra sem handler de clique", async () => {
    const user = userEvent.setup();
    render(<BusyButton>Fechar</BusyButton>);
    await user.click(screen.getByRole("button", { name: /fechar/i }));
    expect(screen.getByRole("button", { name: /fechar/i })).not.toBeDisabled();
  });
});
