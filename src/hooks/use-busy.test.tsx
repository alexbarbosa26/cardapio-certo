import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useBusy } from "./use-busy";

describe("useBusy", () => {
  it("começa livre e libera após a ação concluir", async () => {
    const { result } = renderHook(() => useBusy());
    expect(result.current.busy).toBe(false);

    await act(async () => {
      await result.current.run(async () => "ok");
    });
    expect(result.current.busy).toBe(false);
  });

  it("ignora cliques concorrentes enquanto processa", async () => {
    const { result } = renderHook(() => useBusy());
    let release!: (v: string) => void;
    const fn = vi.fn(() => new Promise<string>((r) => { release = r; }));
    const second = vi.fn(async () => "segundo");

    let first!: Promise<string | undefined>;
    act(() => { first = result.current.run(fn); });
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => {
      await expect(result.current.run(second)).resolves.toBeUndefined();
    });
    expect(second).not.toHaveBeenCalled();

    await act(async () => {
      release("primeiro");
      await expect(first).resolves.toBe("primeiro");
    });
    expect(result.current.busy).toBe(false);
  });

  it("libera o guard quando a ação falha", async () => {
    const { result } = renderHook(() => useBusy());
    await act(async () => {
      await expect(result.current.run(async () => { throw new Error("falhou"); })).rejects.toThrow("falhou");
    });
    expect(result.current.busy).toBe(false);

    await act(async () => {
      await expect(result.current.run(async () => 42)).resolves.toBe(42);
    });
  });
});
