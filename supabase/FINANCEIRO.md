# Financeiro da Ascensão Comercial — banco compartilhado

O código está preparado para um projeto Supabase exclusivo da Ascensão Comercial. Esta entrega não cria nem vincula um banco remoto e não contém credenciais. Enquanto `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` estiverem vazias, a aplicação opera com os dados locais do navegador; esse modo não compartilha dados entre computadores.

## Ativação no banco da empresa

1. Crie o projeto Supabase exclusivo e siga `supabase/README.md` para aplicar a sequência completa de migrações e cadastrar o administrador.
2. Confira o destino e aplique também `supabase/migrations/202610280001_finance_workspace.sql`. A migração cria as tabelas financeiras, as duas funções públicas e o bucket privado de comprovantes. Não aplique a migração na base de outra empresa.
3. Configure a URL e a chave pública do novo projeto em `.env.local`, reinicie a aplicação e entre com o usuário real. A chave de serviço nunca deve aparecer em variáveis `VITE_` ou no navegador.
4. O usuário precisa de associação ativa à organização com papel `admin` ou `finance`; seu perfil e a organização também precisam estar ativos. Gestores comerciais, usuários externos e associações desativadas não têm acesso.
5. Abra o Financeiro. O primeiro acesso importa as quatro tabelas financeiras herdadas apenas se o novo espaço financeiro estiver vazio. Revise as contas, os saldos iniciais e as datas antes de operar. A conta de migração começa com saldo zero: não se inventa saldo bancário.
6. Confirme a operação com duas sessões: um lançamento salvo na primeira deve aparecer após recarregar a segunda. Se ambas alterarem a mesma revisão, a segunda gravação recebe conflito e precisa recarregar.

Quando existe conexão remota e a migração não foi aplicada, o Financeiro apresenta um erro de atualização necessária. Não retorna silenciosamente ao armazenamento local. Falhas de rede, autorização ou validação também impedem o commit local.

## Persistência e integridade

- `finance_workspaces` guarda um espaço por organização com `schemaVersion: 2`, revisão e snapshot JSONB. Valores canônicos são números inteiros em centavos, dentro do intervalo seguro do JavaScript.
- `finance_workspace_load(p_organization_id)` devolve o estado confirmado ou `null` quando ainda não há estado. O retorno inclui os últimos 500 eventos da auditoria; o histórico integral permanece no banco.
- `finance_workspace_save(p_organization_id, p_state, p_expected_revision, p_request_id)` valida o estado, bloqueia a linha da organização e compara a revisão. A revisão proposta precisa ser exatamente a esperada mais um. Toda a operação, incluindo histórico, ocorre na mesma transação.
- Um conflito retorna `PT409`. Uma mesma chave UUID de operação, com mesmo autor, payload e revisão esperada, não grava novamente e devolve o estado confirmado mais recente. Reutilizar a chave com outro conteúdo é recusado.
- O banco valida datas, categorias, centros, contas, contatos, pagamentos, principal quitado, transferências e conciliações. Uma linha de extrato e um pagamento não podem ter duas conciliações ativas; conta, valor e sinal precisam corresponder.
- Evidências existentes não são apagadas: títulos são cancelados, pagamentos e transferências são estornados, conciliações são desfeitas conservando o registro. Principal, data e conta de um pagamento histórico não podem ser reescritos. O extrato importado é imutável.
- Fechamentos bloqueiam alterações nos títulos, orçamento, pagamentos, transferências e saldos iniciais que afetem o mês fechado. Reabrir exige motivo registrado.
- O limite por snapshot é 5 MiB e por coleção é 50 mil registros. Ao alcançar esse volume, planeje uma migração para escrituração normalizada/paginada antes de ampliar a operação.

O repositório é exportado por `assets/js/core/finance-repository.mjs`, com `createFinanceRepository({client, organizationId, userId})`. O `userId` é somente contexto local: o banco usa `auth.uid()` para autorização e autoria. O motor publica as alterações somente depois de receber o snapshot confirmado.

## Auditoria

`finance_workspace_audit` registra autor autenticado, horário do servidor, revisão, hashes anterior/novo e diferenças de cada coleção com valores antes e depois. A coleção `auditoria` enviada pelo navegador é ignorada como prova: o retorno é montado a partir do histórico do servidor. Usuários da aplicação não podem inserir, atualizar ou excluir a auditoria; um gatilho também bloqueia atualização/exclusão direta pelo proprietário comum das tabelas. Administradores da infraestrutura com privilégios de superusuário continuam tendo controle da infraestrutura, como em qualquer banco PostgreSQL.

Exemplo de consulta administrativa, executada apenas no banco correto por operador autorizado:

```sql
select revision, actor_id, occurred_at, action, details
from public.finance_workspace_audit
where organization_id = 'UUID_DA_ORGANIZACAO'::uuid
order by revision desc;
```

Os hashes MD5 são verificadores de conteúdo e encadeamento operacional, não assinaturas criptográficas nem certificação contábil. Mantenha backups do banco e a retenção necessária à empresa.

## Comprovantes privados

O bucket `ascensao-finance-documents` permanece privado. Aceita arquivos PDF, PNG, JPEG, WebP, texto, CSV, XLS e XLSX com até 10 MiB. Os caminhos seguem `organizationId/entryId/fileId.ext`; as regras de armazenamento exigem acesso financeiro à organização. Não há acesso público nem política de sobrescrita: novos arquivos recebem novos identificadores. Os metadados no título são `{id,name,size,type,path,createdAt}` e são validados pelo servidor.

O upload do arquivo e o commit do título usam serviços distintos. Se a vinculação falhar depois de um upload, o cliente pode limpar o arquivo órfão; não remova um comprovante vinculado antes de confirmar a alteração do título. Em modo local os anexos ficam no navegador e também precisam ser conservados em backup próprio: um JSON de lançamentos contém metadados, não os binários dos comprovantes.

## Dados herdados e restauração

Na importação inicial, `chart_of_accounts`, `cost_centers`, `financial_entries` e `budgets` são lidas com filtro de organização e paginação. Valores em reais são convertidos pelo motor para centavos; lançamentos realizados viram pagamentos históricos na conta de migração. Os registros legados permanecem nas tabelas originais. Depois da migração, alterações feitas por clientes antigos nessas tabelas não sincronizam para o novo Financeiro: atualize as sessões antes do início da operação.

A restauração que remover evidências já existentes em um banco compartilhado é recusada. Para recuperação integral de desastre, restaure o backup do banco em um ambiente controlado e confira a organização de destino. Restaurar um JSON na interface não substitui backups do PostgreSQL e do Storage.

Integrações de movimentação real, emissão de boleto, Pix, DDA, Open Finance ou sincronização automática com bancos exigem provedores e credenciais próprios. O módulo registra, importa e concilia a gestão financeira; não executa transferências bancárias reais.

## Verificação local

`node --test tests/finance-backend.test.js` executa PostgreSQL real em WebAssembly com PGlite, sem rede ou credenciais. Cobre autorização e isolamento entre empresas, revisão concorrente, idempotência, auditoria, rollback de validações, fechamento e privacidade dos comprovantes. A suíte não aplica nenhuma migração remota.
