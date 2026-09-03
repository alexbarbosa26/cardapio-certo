import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RankingList } from "./RankingList";
import { Section, Panel } from "./Section";
import { StatCard } from "./StatCard";
import { InstagramIcon } from "@/components/icons/instagram-icon";

describe("RankingList", () => {
  const items = [
    { name: "Coxinha", primary: "R$ 100,00", secondary: "20 un", ratio: 1 },
    { name: "Refri", primary: "R$ 20,00", ratio: 0.2 },
  ];

  it("mostra mensagem padrão quando não há dados", () => {
    render(<RankingList items={[]} />);
    expect(screen.getByText("Sem dados no período.")).toBeInTheDocument();
  });

  it("aceita mensagem vazia customizada", () => {
    render(<RankingList items={[]} emptyMessage="Nada por aqui" />);
    expect(screen.getByText("Nada por aqui")).toBeInTheDocument();
  });

  it("numera os itens na ordem recebida e exibe o detalhe opcional", () => {
    render(<RankingList items={items} />);
    expect(screen.getByText(/1\. Coxinha/)).toBeInTheDocument();
    expect(screen.getByText(/2\. Refri/)).toBeInTheDocument();
    expect(screen.getByText("20 un")).toBeInTheDocument();
  });

  it("limita a largura da barra entre 2% e 100%", () => {
    const { container } = render(
      <RankingList items={[{ name: "A", primary: "x", ratio: 5 }, { name: "B", primary: "y", ratio: 0 }]} />,
    );
    const bars = container.querySelectorAll<HTMLElement>(".bg-accent");
    expect(bars[0].style.width).toBe("100%");
    expect(bars[1].style.width).toBe("2%");
  });
});

describe("Section e Panel", () => {
  it("renderiza título, descrição, ação e conteúdo", () => {
    render(
      <Section title="Resumo" description="Do mês" action={<button>Ação</button>}>
        <p>conteúdo</p>
      </Section>,
    );
    expect(screen.getByRole("heading", { name: "Resumo" })).toBeInTheDocument();
    expect(screen.getByText("Do mês")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ação" })).toBeInTheDocument();
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });

  it("omite a descrição quando não informada", () => {
    const { container } = render(<Section title="Só título"><span /></Section>);
    expect(container.querySelector("p")).toBeNull();
  });

  it("Panel esconde o cabeçalho sem título nem ação", () => {
    const { container } = render(<Panel><span>corpo</span></Panel>);
    expect(container.querySelector("h3")).toBeNull();
    expect(screen.getByText("corpo")).toBeInTheDocument();
  });

  it("Panel exibe o cabeçalho quando há título", () => {
    render(<Panel title="Vendas" action={<span>ver</span>}><span>corpo</span></Panel>);
    expect(screen.getByRole("heading", { name: "Vendas" })).toBeInTheDocument();
    expect(screen.getByText("ver")).toBeInTheDocument();
  });
});

describe("StatCard", () => {
  it("exibe rótulo e valor", () => {
    render(<StatCard label="Faturamento" value="R$ 1.000,00" />);
    expect(screen.getByText("Faturamento")).toBeInTheDocument();
    expect(screen.getByText("R$ 1.000,00")).toBeInTheDocument();
  });

  it("mostra variação positiva com uma casa decimal", () => {
    render(<StatCard label="Vendas" value="10" delta={12.34} deltaLabel="vs ontem" />);
    expect(screen.getByText("12.3%")).toBeInTheDocument();
    expect(screen.getByText("vs ontem")).toBeInTheDocument();
  });

  it("mostra variação negativa em valor absoluto", () => {
    render(<StatCard label="Vendas" value="10" delta={-8} />);
    expect(screen.getByText("8.0%")).toBeInTheDocument();
  });

  it("omite a variação quando é nula ou inválida", () => {
    const { container, rerender } = render(<StatCard label="Vendas" value="10" delta={null} />);
    expect(container.textContent).not.toContain("%");
    rerender(<StatCard label="Vendas" value="10" delta={Number.NaN} />);
    expect(container.textContent).not.toContain("%");
  });

  it("prefere o hint ao rótulo de comparação", () => {
    render(<StatCard label="Vendas" value="10" hint="ontem: 8" deltaLabel="vs ontem" delta={5} />);
    expect(screen.getByText("ontem: 8")).toBeInTheDocument();
    expect(screen.queryByText("vs ontem")).toBeNull();
  });
});

describe("InstagramIcon", () => {
  it("é decorativo por padrão e aceita sobrescrita de props", () => {
    const { container, rerender } = render(<InstagramIcon className="h-5 w-5" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("h-5");

    rerender(<InstagramIcon aria-hidden={undefined} aria-label="Instagram" role="img" />);
    expect(screen.getByRole("img", { name: "Instagram" })).toBeInTheDocument();
  });
});
