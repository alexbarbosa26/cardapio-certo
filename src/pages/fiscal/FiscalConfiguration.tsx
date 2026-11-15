import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  FileKey,
  Settings,
  ArrowDownLeft,
  ArrowUpRight,
  Save,
  AlertTriangle,
  Plus,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  certificateAvailability,
  loadFiscalConfiguration,
  saveFiscalConfiguration,
  type FiscalConfiguration as Preferences,
  type FiscalEnvironment,
} from "@/lib/fiscal/certificates";
import { fiscalDate } from "@/lib/fiscal/domain";
export default function FiscalConfiguration() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? "";
  const query = useQuery({
    queryKey: ["fiscal-configuration", companyId],
    queryFn: () => loadFiscalConfiguration(companyId),
    enabled: !!companyId,
  });
  const cache = useQueryClient();
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<string | null>(null);
  const preferences = draft ??
    query.data?.preferences ?? {
      environment: "test" as FiscalEnvironment,
      expiry_warning_days: 30,
    };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveFiscalConfiguration(companyId, preferences);
      await cache.invalidateQueries({ queryKey: ["fiscal-configuration", companyId] });
      setDraft(null);
      toast.success("Preferências fiscais salvas. A emissão continua bloqueada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };
  const certificates =
    query.data?.certificates.filter((c) => c.environment === preferences.environment) ?? [];
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">Fiscal / Configuração fiscal</p>
          <h1 className="text-2xl font-semibold">Certificados e CSC</h1>
        </div>
        <Badge variant="outline" className="gap-2">
          <ShieldCheck className="h-4 w-4" />
          Emissão não habilitada
        </Badge>
      </header>
      <nav aria-label="Área Fiscal" className="flex flex-wrap gap-2 border-b pb-4">
        <Button asChild variant="ghost">
          <Link to="/fiscal/entradas">
            <ArrowDownLeft />
            Entradas
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/fiscal/saidas">
            <ArrowUpRight />
            Saídas
          </Link>
        </Button>
        <Button asChild>
          <Link to="/fiscal/configuracao">
            <Settings />
            Configuração fiscal
          </Link>
        </Button>
      </nav>
      <div role="status" className="flex items-start gap-3 border-l-4 border-warning bg-muted p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" />
        <div>
          <h2 className="font-medium">Serviço fiscal pendente</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            O serviço fiscal e seu contrato de certificados/CSC ainda não foram definidos. Não envie
            arquivos ou credenciais agora. Upload, validação, substituição e ativação estão
            indisponíveis.
          </p>
        </div>
      </div>
      {query.isPending && <p role="status">Carregando configuração…</p>}
      {query.isError && (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {query.data && (
        <>
          <section className="space-y-4 border-b pb-6">
            <h2 className="text-lg font-semibold">Ambiente e alertas</h2>
            <div className="grid max-w-xl gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fiscal-environment">Ambiente</Label>
                <select
                  id="fiscal-environment"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={preferences.environment}
                  onChange={(e) =>
                    setDraft({ ...preferences, environment: e.target.value as FiscalEnvironment })
                  }
                >
                  <option value="test">Testes / Homologação</option>
                  <option value="production">Produção</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="warning-days">Alertar antes do vencimento (dias)</Label>
                <Input
                  id="warning-days"
                  type="number"
                  min={1}
                  max={365}
                  value={preferences.expiry_warning_days}
                  onChange={(e) =>
                    setDraft({ ...preferences, expiry_warning_days: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Selecionar Produção não ativa emissão, certificado ou conexão fiscal.
            </p>
            <Button disabled={saving || !draft} onClick={save}>
              <Save />
              {saving ? "Salvando…" : "Salvar preferências"}
            </Button>
          </section>
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                Certificados · {preferences.environment === "test" ? "Testes" : "Produção"}
              </h2>
              <Button variant="outline" onClick={() => setDialog("Cadastrar certificado")}>
                <Plus />
                Cadastrar certificado
              </Button>
            </div>
            {!certificates.length ? (
              <div className="flex flex-col items-center gap-3 border-y py-12 text-center">
                <FileKey className="h-10 w-10 text-muted-foreground" />
                <h3 className="font-medium">Nenhum certificado cadastrado neste ambiente</h3>
                <p className="max-w-lg text-sm text-muted-foreground">
                  O cadastro será liberado após configurar o serviço fiscal. Titular, CNPJ, série e
                  validade serão extraídos e verificados no servidor antes da confirmação.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1000px] w-full text-left text-sm">
                  <thead className="bg-muted">
                    <tr>
                      {[
                        "Titular",
                        "CNPJ",
                        "Série",
                        "Validade",
                        "Estado / Verificação",
                        "CSC",
                        "Ações",
                      ].map((h) => (
                        <th key={h} className="p-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {certificates.map((c) => {
                      const availability = certificateAvailability(
                        c,
                        preferences.expiry_warning_days,
                      );
                      return (
                        <tr key={c.id} className="border-b">
                          <td className="p-3">{c.holder_name}</td>
                          <td className="p-3 font-mono">{c.holder_document}</td>
                          <td className="max-w-48 break-all p-3 font-mono">{c.serial_number}</td>
                          <td className="p-3">{fiscalDate(c.valid_until)}</td>
                          <td className="p-3">
                            <Badge variant="outline">{availability.label}</Badge>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Última verificação: {fiscalDate(c.last_verified_at)}
                            </p>
                          </td>
                          <td className="p-3">
                            {c.csc_configured ? "Já configurado" : "Não configurado"}
                            {c.csc_identifier && (
                              <p className="text-xs">ID: ••••{c.csc_identifier.slice(-2)}</p>
                            )}
                          </td>
                          <td className="p-3">
                            <Button
                              variant="outline"
                              size="icon"
                              title="Renovar / Substituir — integração pendente"
                              aria-label="Renovar ou substituir certificado"
                              onClick={() => setDialog("Renovar / Substituir certificado")}
                            >
                              <RefreshCw />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="space-y-3 border-t pt-6">
            <h2 className="text-lg font-semibold">Código de Segurança do Contribuinte (CSC)</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              O identificador e o segredo CSC são distintos do arquivo e da senha do certificado. A
              configuração será vinculada à empresa e ao ambiente; segredos já configurados nunca
              serão devolvidos à tela.
            </p>
            <Button variant="outline" onClick={() => setDialog("Configurar CSC")}>
              <Settings />
              Configurar CSC
            </Button>
          </section>
        </>
      )}
      <Dialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog}</DialogTitle>
            <DialogDescription>
              {dialog === "Configurar CSC"
                ? "A configuração do identificador e do segredo CSC depende do contrato do serviço fiscal. O identificador preservará zeros iniciais e o segredo será protegido no servidor. Não há campos de credenciais ativos nesta etapa."
                : "Upload e validação de certificado dependem do serviço fiscal escolhido. Formatos e tipos aceitos não serão presumidos. Uma substituição só poderá confirmar o novo certificado após validação, preservando a configuração anterior em caso de falha."}
            </DialogDescription>
          </DialogHeader>
          <Button variant="outline" onClick={() => setDialog(null)}>
            Entendi
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
