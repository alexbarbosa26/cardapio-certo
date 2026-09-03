import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

const auth = { profile: null as { role: string | null } | null, isSuperAdmin: false };
const branding = {
  enableTables: true,
  enableTabs: true,
  enableKitchen: true,
  plan: { allowTables: true, allowTabs: true, allowKitchen: true, allowAdvancedDashboard: true },
};

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/use-tenant-branding", () => ({ useTenantBranding: () => branding }));

import { PermissionsProvider, usePermissions, Can, type Permission } from "./use-permissions";

const wrapper = ({ children }: { children: ReactNode }) => <PermissionsProvider>{children}</PermissionsProvider>;
const perms = () => renderHook(() => usePermissions(), { wrapper }).result.current;

const ADMIN_ONLY: Permission[] = [
  "manage_company",
  "manage_users",
  "manage_products",
  "manage_cash_register",
  "view_reports",
];

beforeEach(() => {
  auth.profile = null;
  auth.isSuperAdmin = false;
  Object.assign(branding, {
    enableTables: true,
    enableTabs: true,
    enableKitchen: true,
    plan: { allowTables: true, allowTabs: true, allowKitchen: true, allowAdvancedDashboard: true },
  });
});

describe("usePermissions", () => {
  it("lança erro fora do provider", () => {
    expect(() => renderHook(() => usePermissions())).toThrow(/fora do PermissionsProvider/);
  });

  it("super admin tem todas as permissões", () => {
    auth.isSuperAdmin = true;
    branding.plan.allowAdvancedDashboard = false;
    branding.enableTables = false;
    const p = perms();
    expect(p.isSuperAdmin).toBe(true);
    for (const perm of [...ADMIN_ONLY, "view_advanced_dashboard", "use_tables"] as Permission[]) {
      expect(p.has(perm)).toBe(true);
    }
  });

  it("admin da empresa acessa as áreas administrativas", () => {
    auth.profile = { role: "admin" };
    const p = perms();
    expect(p.isAdmin).toBe(true);
    for (const perm of ADMIN_ONLY) expect(p.has(perm)).toBe(true);
    expect(p.has("view_advanced_dashboard")).toBe(true);
  });

  it("staff não acessa áreas administrativas", () => {
    auth.profile = { role: "staff" };
    const p = perms();
    expect(p.isAdmin).toBe(false);
    for (const perm of ADMIN_ONLY) expect(p.has(perm)).toBe(false);
    expect(p.has("view_advanced_dashboard")).toBe(false);
  });

  it("dashboard avançado depende do plano", () => {
    auth.profile = { role: "admin" };
    branding.plan.allowAdvancedDashboard = false;
    expect(perms().has("view_advanced_dashboard")).toBe(false);
  });

  it("módulos exigem plano e configuração habilitados", () => {
    auth.profile = { role: "staff" };
    expect(perms().has("use_tables")).toBe(true);

    branding.enableTables = false;
    expect(perms().has("use_tables")).toBe(false);

    branding.enableTables = true;
    branding.plan.allowTables = false;
    expect(perms().has("use_tables")).toBe(false);

    branding.plan.allowTabs = false;
    expect(perms().has("use_tabs")).toBe(false);

    branding.enableKitchen = false;
    expect(perms().has("use_kitchen")).toBe(false);
  });

  it("nega permissão desconhecida", () => {
    auth.profile = { role: "admin" };
    expect(perms().has("permissao_inexistente" as Permission)).toBe(false);
  });
});

describe("Can", () => {
  it("mostra o conteúdo quando a permissão existe", () => {
    auth.profile = { role: "admin" };
    render(
      <PermissionsProvider>
        <Can permission="manage_users">
          <span>gerenciar usuários</span>
        </Can>
      </PermissionsProvider>,
    );
    expect(screen.getByText("gerenciar usuários")).toBeInTheDocument();
  });

  it("usa o fallback quando a permissão é negada", () => {
    auth.profile = { role: "staff" };
    render(
      <PermissionsProvider>
        <Can permission="manage_users" fallback={<span>sem acesso</span>}>
          <span>gerenciar usuários</span>
        </Can>
      </PermissionsProvider>,
    );
    expect(screen.getByText("sem acesso")).toBeInTheDocument();
    expect(screen.queryByText("gerenciar usuários")).toBeNull();
  });

  it("renderiza nada por padrão quando negado", () => {
    auth.profile = { role: "staff" };
    const { container } = render(
      <PermissionsProvider>
        <Can permission="view_reports"><span>relatórios</span></Can>
      </PermissionsProvider>,
    );
    expect(container.textContent).toBe("");
  });
});
