# Fiscal do MesaChef — Etapa 1: consultas e navegação

## Entrega proposta
Criar **Fiscal > Entradas e Saídas**, mantendo o visual atual e sem alterar pedidos, caixa, comandas ou dados existentes. Esta entrega é somente de consulta: não emite, cancela, manifesta, importa documentos nem envia e-mails.

Referências recebidas: instruções e mapeamento funcional da versão 2. O mapeamento distingue observações de interface, comandos não executados, propostas e pendências; essas classificações serão preservadas. Não acessar o Pratika nem copiar seus dados. As pendências de inspeção externa do documento não autorizam novas consultas.

### Navegação e listagens
- Substituir “Notas Fiscais — em breve” por Fiscal, com acesso a Entradas e Saídas.
- Proteger as rotas por sessão, empresa e permissão de consulta. Inicialmente, conceder consulta e exportação aos administradores da própria empresa; staff não recebe acesso por padrão. As permissões fiscais ficam separadas para futura concessão explícita.
- **Saídas:** período, destinatário, série, número, chave, modelo NF-e/NFC-e e situação; categorias Transmitidas, Pendentes, Canceladas, Inutilizadas e Offline.
- **Entradas:** período, emitente/fornecedor, série, número, chave e situação; categorias Autorizadas e Excluídas.
- Mostrar todas as colunas solicitadas, seleção explícita, total de resultados, primeira/anterior/próxima/última página, páginas numeradas e tamanhos 10, 25, 50 e 100. Não replicar a opção 11 da referência. Filtros, contagem e exportação compartilham consulta e autorização, sem limite silencioso.
- Persistir filtros apenas como preferência de navegação, separados por empresa e direção; não persistir documentos ou permissões no navegador. Oferecer avanço/retorno de período e cópia integral da chave abreviada na tabela, tratando falha de cópia.
- Preservar distinção entre transmissão e autorização: registrar ambos separadamente. “Transmitidas” não significa “Autorizadas”; sem contrato de integração, não inferir estado por envio. Categorias serão baseadas em estados explícitos registrados, com mapeamento definitivo dependente do serviço fiscal.
- Estados de carregamento, erro recuperável e vazio sem notas fictícias. Explicar no estado vazio que ainda não há documentos e que a importação será disponibilizada na próxima etapa.
- Exportar CSV dos resultados autorizados, com identificadores textuais, valores exatos e prevenção de fórmulas em planilhas. Oferecer relatório imprimível; indicar filtros ou seleção, quantidade e total do escopo, nunca o total da página como total geral.

### Detalhes e ações
- Painel do documento com Resumo, Participantes, Itens, Valores e Tributos, Pagamentos/Parcelas, Documentos e Eventos. Mostrar Transporte apenas quando aplicável.
- Datas de emissão, entrada/saída e criação/lançamento independentes; participantes históricos não dependem do cadastro atual.
- Saídas: mostrar vínculo real com pedido, última consulta e mensagem fiscal original quando existirem; não deduzir modelo pelo texto da mensagem. Entradas: distinguir situação fiscal, recebimento físico e financeiro; filtros operacionais somente quando houver informação confiável, sem presumir lançamentos.
- XML e documento auxiliar somente quando existir arquivo correspondente e o usuário tiver permissão; gerar acesso temporário autorizado a arquivos privados, nunca links públicos permanentes.
- Apresentar as ações solicitadas para entradas e saídas. As operações não implementadas permanecem indisponíveis com motivo acessível por texto/tooltip, inclusive em celular. Nenhuma ação indisponível chama serviços fiscais.
- Certificados/CSC e emissão não serão habilitados nesta etapa. Não solicitar nem armazenar credenciais fiscais agora.

## Reutilização e limites encontrados
- Existem empresas, produtos, clientes de fiado, pedidos/itens, pagamentos e financeiro operacional. Reutilizar esses registros quando houver vínculo real; cliente de fiado não equivale automaticamente a destinatário fiscal.
- Não foram encontrados cadastros de fornecedores, compras, estoque ou contas a pagar no esquema fornecido. Não inventar nem duplicar esses módulos na etapa de consulta.
- A autenticação já oferece papéis admin/staff/super_admin e proteção por empresa. Reutilizar os mecanismos existentes, verificando autorização também no servidor.
- O superadmin atualmente usa área global e é redirecionado fora das rotas operacionais; não criar acesso fiscal global implícito ou seleção arbitrária de empresa.

## Detalhes técnicos
### Modelo e camadas
- Contexto **Fiscal**: documentos fiscais e seus eventos são distintos de vendas, recebimento físico e financeiro. Vendas continuam no contexto operacional existente.
- Raiz: documento fiscal com participantes, itens, tributos, parcelas, transporte, arquivos e eventos históricos.
- Identificadores como chave, série, número e documento do participante são texto. Dinheiro usa `numeric` no banco e representação decimal textual nas fronteiras; evitar cálculos financeiros com ponto flutuante.
- Persistência aditiva: documentos por empresa, conteúdo histórico, metadados de arquivos e eventos. Adiar movimentos, tentativas e certificados.
- Separar domínio, consultas e apresentação; hooks coordenam carregamento, sem presumir elegibilidade fiscal.
- Centralizar filtros/paginação; buscar detalhe por `id` **e** `company_id`, negando empresa ausente.
- Migrações com GRANTs, RLS, índices por empresa/período e integridade dos vínculos. Permissões separadas para consulta, entrada, recebimento, financeiro, emissão, eventos, exportação/envio e configuração; somente consulta/exportação serão utilizadas nesta etapa.
- Sem acesso anônimo ou escrita fiscal direta para usuários. Qualquer futura escrita exige autorização própria e auditoria. Exportações devem registrar autor, empresa, ação e escopo sem conteúdo sensível ou credenciais.
- Armazenamento privado autorizado por documento/empresa, sem segredos ou certificados.

### Nomes e linguagem do domínio
| Termo ambíguo | Nome proposto | Motivo |
|---|---|---|
| data/info | FiscalDocumentSummary | Explicita documento e finalidade da listagem |
| status | authorizationStatus / transmissionStatus | Separa autorização de comunicação |
| handle/process | listFiscalDocuments / getFiscalDocument | Explicita consulta sem efeito colateral |
| deleted/canceled | excludedAt / fiscalCancellationStatus | Separa exclusão lógica de evento fiscal |

Glossário: **entrada** = documento recebido; **saída** = documento emitido pelo estabelecimento; **autorização** = retorno conclusivo fiscal; **transmissão** = comunicação com serviço.

### Trade-offs
| Critério | Consultas incrementais no app atual | Módulo fiscal completo agora | Observação |
|---|---|---|---|
| Performance | Índices e paginação no servidor | Mais fluxos e estados para operar | Evitar carregar todos os documentos no navegador |
| Manutenção | Poucas responsabilidades novas | Maior acoplamento inicial | Preserva pedidos e dinheiro |
| Custo | Sem provedor fiscal nesta etapa | Exige serviço, credenciais e operação | Não emitir em demonstração |
| Riscos | Integração futura pode exigir adaptação | Regras fiscais presumidas e retrabalho | Separar estados desde o início |
| Funcionalidades existentes | Sem efeitos em vendas/caixa | Risco de movimentos duplicados | Consulta não modifica documento |

**Veredito:** implementar primeiro consultas isoladas e persistência aditiva.
**Quando mudar:** após escolha do serviço fiscal e definição das integrações de compras/estoque/financeiro.
**Próximo passo seguro:** concluir a Etapa 1 e seus testes antes de importação ou emissão.

### ADR 0001 — Consultas fiscais isoladas dos efeitos operacionais
**Status:** Proposed.
**Contexto:** o módulo deve preservar dados e começar sem operações fiscais reais; fornecedor de integração e mapeamento complementar ainda não estão definidos.
**Decisão:** implementar Fiscal como contexto de consulta separado, com vínculos aos cadastros existentes e autorização por empresa no servidor.
**Consequências:** reduz risco de emissão e movimentos repetidos; exige contrato e evolução incremental nas etapas seguintes.
**Compliance/Fitness Function:** testes negam acesso cruzado, comprovam ausência de escrita em consultas e mantêm ações fiscais indisponíveis. Salvar o ADR aceito em `docs/adr/` e registrar as regras estruturais em `AGENTS.md`.

## Validação e revisão
- Testes rápidos, independentes e comportamentais: filtros combinados, datas de fronteira, paginação/contagem/exportação no mesmo escopo, preservação de zeros e valores monetários, detalhe e arquivos do documento correto.
- Testes P0: sem sessão, staff sem permissão, empresa ausente, documento de outra empresa, exportação sem permissão, consultas sem alteração de pedidos/financeiro.
- Verificar isolamento real nas políticas além dos mocks. Testar navegação autenticada, listagens e detalhes em desktop e celular; dados sintéticos claramente identificados somente em testes, não como notas iniciais. Cobrir AC-01, AC-02, AC-03 e AC-16 nesta etapa; AC-04 a AC-15 e AC-17 a AC-25 pertencem às etapas futuras, sem declarar aprovação antecipada.
- Executar testes relevantes e lint dos arquivos alterados; conferir resultado da compilação automática. Não reduzir cobertura, excluir código produtivo ou modificar arquivos gerados de autenticação.
- Revisão Clean Code: funções pequenas, nomes fiscais pesquisáveis, filtros sem duplicação, erros explícitos e separação domínio/consulta/interface. Nota de saúde e riscos serão relatados a partir do código entregue, não presumidos antes da implementação.

## Próximas etapas — não incluídas nesta entrega
1. **XML:** prévia sem efeitos, validação, associações/conversões e confirmação idempotente; depende de compras/estoque/contas a pagar.
2. **Configuração:** escolher serviço, contrato de certificados/CSC e ambiente; segredos no servidor e renovação auditada.
3. **Saídas:** vínculos com vendas, idempotência, recuperação de timeout e eventos autorizados no servidor.

**Entrega final da etapa:** mudanças implementadas, evidências locais de validação e pendências explicitadas; emissão fiscal continuará indisponível.
