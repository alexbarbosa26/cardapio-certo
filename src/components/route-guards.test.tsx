import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

type AuthState = {
  user: { id: string } | null;
  loading: boolean;
  profile: { role: string | null; company_id: string } | null;
  isSuperAdmin: boolean;
  isCompanyAccessAllowed: boolean;
};

const state: AuthState = {
  user: null,
  loading: false,
  profile: null,
  isSuperAdmin: false,
  isCompanyAccessAllowed: true,
};

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => state }));

import { RequireAuth, RequireSuperAdmin, RequireCompanyAccess, RequireAdmin } from "./route-guards";

function renderGuard(Guard: () => React.ReactNode, initial = "/protegido") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/protegido" element={<Guard />}>
          <Route index element={<div>conteúdo protegido</div>} />
        </Route>
        <Route path="/login" element={<div>tela de login</div>} />
        <Route path="/" element={<div>início</div>} />
        <Route path="/mesas" element={<div>mesas</div>} />
        <Route path="/global/dashboard" element={<div>painel global</div>} />
        <Route path="/assinatura-suspensa" element={<div>assinatura suspensa</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.assign(state, {
    user: null,
    loading: false,
    profile: null,
    isSuperAdmin: false,
    isCompanyAccessAllowed: true,
  });
});

describe("RequireAuth", () => {
  it("não renderiza nada enquanto carrega", () => {
    state.loading = true;
    const { container } = renderGuard(RequireAuth);
    expect(container.textContent).toBe("");
  });

  it("redireciona anônimo para o login", () => {
    renderGuard(RequireAuth);
    expect(screen.getByText("tela de login")).toBeInTheDocument();
  });

  it("libera usuário autenticado", () => {
    state.user = { id: "u1" };
    renderGuard(RequireAuth);
    expect(screen.getByText("conteúdo protegido")).toBeInTheDocument();
  });
});

describe("RequireSuperAdmin", () => {
  it("aguarda o carregamento", () => {
    state.loading = true;
    const { container } = renderGuard(RequireSuperAdmin);
    expect(container.textContent).toBe("");
  });

  it("manda anônimo para o login", () => {
    renderGuard(RequireSuperAdmin);
    expect(screen.getByText("tela de login")).toBeInTheDocument();
  });

  it("bloqueia usuário comum devolvendo para a home", () => {
    state.user = { id: "u1" };
    state.profile = { role: "admin", company_id: "c1" };
    renderGuard(RequireSuperAdmin);
    expect(screen.getByText("início")).toBeInTheDocument();
  });

  it("libera super admin", () => {
    state.user = { id: "u1" };
    state.isSuperAdmin = true;
    renderGuard(RequireSuperAdmin);
    expect(screen.getByText("conteúdo protegido")).toBeInTheDocument();
  });
});

describe("RequireCompanyAccess", () => {
  it("aguarda carregamento e exige login", () => {
    state.loading = true;
    const { container, unmount } = renderGuard(RequireCompanyAccess);
    expect(container.textContent).toBe("");
    unmount();

    state.loading = false;
    renderGuard(RequireCompanyAccess);
    expect(screen.getByText("tela de login")).toBeInTheDocument();
  });

  it("envia super admin para o painel global", () => {
    state.user = { id: "u1" };
    state.isSuperAdmin = true;
    renderGuard(RequireCompanyAccess);
    expect(screen.getByText("painel global")).toBeInTheDocument();
  });

  it("espera o perfil do tenant antes de decidir", () => {
    state.user = { id: "u1" };
    const { container } = renderGuard(RequireCompanyAccess);
    expect(container.textContent).toBe("");
  });

  it("bloqueia empresa sem assinatura ativa", () => {
    state.user = { id: "u1" };
    state.profile = { role: "admin", company_id: "c1" };
    state.isCompanyAccessAllowed = false;
    renderGuard(RequireCompanyAccess);
    expect(screen.getByText("assinatura suspensa")).toBeInTheDocument();
  });

  it("libera empresa com assinatura válida", () => {
    state.user = { id: "u1" };
    state.profile = { role: "staff", company_id: "c1" };
    renderGuard(RequireCompanyAccess);
    expect(screen.getByText("conteúdo protegido")).toBeInTheDocument();
  });
});

describe("RequireAdmin", () => {
  it("aguarda o carregamento", () => {
    state.loading = true;
    const { container } = renderGuard(RequireAdmin);
    expect(container.textContent).toBe("");
  });

  it("redireciona staff e perfil ausente para mesas", () => {
    state.profile = { role: "staff", company_id: "c1" };
    const { unmount } = renderGuard(RequireAdmin);
    expect(screen.getByText("mesas")).toBeInTheDocument();
    unmount();

    state.profile = null;
    renderGuard(RequireAdmin);
    expect(screen.getByText("mesas")).toBeInTheDocument();
  });

  it("libera admin da empresa", () => {
    state.profile = { role: "admin", company_id: "c1" };
    renderGuard(RequireAdmin);
    expect(screen.getByText("conteúdo protegido")).toBeInTheDocument();
  });
});
