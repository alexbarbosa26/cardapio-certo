# Módulo Fiscal

- [x] Inspecionar estrutura, cadastros e controles de acesso existentes.
- [x] Incorporar o mapeamento funcional completo às instruções da versão 2.
- [x] Aprovar o plano da Etapa 1.
- [x] Implementar navegação, consultas, detalhes e exportação com isolamento por empresa.
- [x] Validar testes, privilégios, isolamento de empresa e navegação autenticada em computador e celular.
- [ ] Validar documentos preenchidos e downloads reais — bloqueado pela ausência de documentos fiscais; fixtures locais testadas sem criar notas em produção.

## Configuração fiscal — etapa 3

- [x] Revisar todos os caminhos fiscais e impedir que uma edição pendente acompanhe a troca de empresa.

- [x] Adicionar acesso a Configuração fiscal > Certificados e CSC.
- [x] Permitir configuração não secreta de ambiente e antecedência de alerta, com auditoria e isolamento por empresa.
- [x] Consultar metadados seguros de certificados e mostrar pendências de integração sem simular validação.
- [x] Validar acesso, configuração e layout em computador e celular.
- [ ] Habilitar upload, validação e armazenamento de certificado/CSC — bloqueado pela ausência do serviço fiscal e seu contrato; não presumir formatos ou ativação.

Etapas seguintes: importação XML e integração operacional.

## Focus NFe — homologação
- [x] Confirmar contratos oficiais de empresas, A1, CSC, emissão, consulta e documentos.
- [ ] Integrar operações fiscais no servidor com isolamento, auditoria, idempotência e produção bloqueada.
- [ ] Habilitar configuração segura e indicar credenciais ou cadastros pendentes — conexão não autorizada; aguardando decisão sobre credenciais.
- [x] Verificar separadamente documentos recebidos e manifestação.
- [ ] Testar regras e fluxo autenticado sem emitir documentos reais durante a construção.