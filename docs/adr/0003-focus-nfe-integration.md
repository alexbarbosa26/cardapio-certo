# 0003 — Integração Focus NFe restrita à homologação

## Status
Proposed — contratos oficiais consultados; implementação operacional pendente de conexão autorizada.

## Contexto
O MesaChef já separa documentos, metadados de certificados e preferências por empresa. O usuário escolheu Focus NFe e proibiu emissão em produção, exposição de credenciais e substituição destrutiva em caso de falha.

## Decisão
Usar uma camada de integração exclusivamente no servidor. A API de empresas opera somente em `https://api.focusnfe.com.br/v2`; isso não autoriza emissões nesse ambiente. Emissões e consultas de documentos emitidos devem usar exclusivamente `https://homologacao.focusnfe.com.br/v2` e o token de homologação correspondente à empresa. Autenticação oficial: Basic Auth, token como usuário e senha vazia.

O cadastro administrativo precisa de uma conexão autorizada. A solicitação de conexão foi recusada; não foi criado conector e nenhuma credencial foi fornecida. Não implementar alternativa de credenciais sem decisão do usuário.

Certificados A1 são enviados como PFX/P12 em base64 com senha em campo separado. Usar `certificado_especifico=true` para evitar propagação para matriz/filiais. Executar pré-validação `dry_run=1` antes da atualização efetiva e só confirmar metadados locais após confirmação do provedor. O comportamento atômico de uma atualização efetiva com falha ainda precisa ser verificado; dry-run sozinho não comprova preservação remota.

CSC de homologação usa `csc_nfce_homologacao` e `id_token_nfce_homologacao`. O contrato declara o identificador como inteiro: guardar a representação textual original no MesaChef e converter somente na fronteira com o provedor, com validação de faixa. Nunca devolver CSC ou tokens presentes nas respostas administrativas.

## Recursos separados
- NF-e: envio assíncrono; consultar referência antes de reenviar em caso de resultado incerto.
- NFC-e: processamento síncrono; não inferir autorização apenas pelo status HTTP.
- Consulta: o resultado autorizado contém status fiscal e chave; caminhos de XML/DANFE precisam de acesso mediado e privado.
- NF-e recebidas: API de distribuição própria, cursor `versao`, até 100 notas por resposta, cabeçalhos `X-Max-Version` e `X-Total-Count`. Resumo não equivale a XML completo.
- Manifestação: operação fiscal separada, não consequência automática de uma consulta. Habilitação da empresa, certificado, contrato da conta e ambiente devem ser confirmados antes de ativar. Não foi executada manifestação nem ativada distribuição.

## Consequências
Uma conexão administrativa não basta para declarar a emissão pronta: faltam token de homologação por empresa, cadastro fiscal, A1 válido, CSC quando necessário e dados tributários dos produtos. Não houve cadastro de empresa, upload de certificado nem emissão real nesta sessão.

## Compliance/Fitness Function
Testar bloqueio de produção, identidade da empresa no servidor, proibição de retorno de segredos, preservação da configuração após falha e consulta antes de reenvio. Validar posteriormente com credenciais autorizadas; nenhuma chamada autenticada à Focus foi realizada.

## Fontes oficiais consultadas
- https://doc.focusnfe.com.br/reference/ambiente
- https://doc.focusnfe.com.br/reference/autenticacao
- https://doc.focusnfe.com.br/reference/criar_empresa
- https://doc.focusnfe.com.br/reference/atualizar_empresa
- https://doc.focusnfe.com.br/reference/consultar_empresa_por_id
- https://doc.focusnfe.com.br/reference/emitir_nfe
- https://doc.focusnfe.com.br/reference/consultar_nfe
- https://doc.focusnfe.com.br/reference/emitir_nfce
- https://doc.focusnfe.com.br/reference/consultar_nfce
- https://doc.focusnfe.com.br/reference/consultar_nfes_recebidas
- https://doc.focusnfe.com.br/reference/manifestar_nfe_recebida