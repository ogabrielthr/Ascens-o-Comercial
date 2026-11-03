# Ascensão Comercial — Plataforma Comercial

Cópia independente dos arquivos do sistema, com os módulos CRM, Performance e Financeiro. O nome da empresa foi aplicado no acesso, no menu, nos títulos, nos arquivos exportados e nos dados iniciais. O logo fornecido foi aplicado ao acesso, ao menu e aos arquivos de marca. O laranja é a cor principal, com fundo navy quase preto no tema escuro.

## Abrir o sistema

Execute `servidor.ps1` com PowerShell, ou abra um terminal nesta pasta:

```powershell
npm ci
npm run dev
```

Acesse **http://127.0.0.1:5174/**. Use sempre esse endereço: trocar o domínio, a porta ou o navegador abre outro armazenamento local. A porta é exclusiva desta cópia.

O ambiente começa em **demonstração**, com registros fictícios. Na tela de acesso, use o e-mail já preenchido `admin@ascensao.example.test` e a senha `demonstracao`. Esses dados servem apenas para a demonstração local.

## Financeiro local

O financeiro está configurado para uso local, conforme solicitado. Inclui contas a pagar e receber, baixas parciais, parcelamento, recorrência, contas e transferências gerenciais, conciliação CSV/OFX, DRE, fluxo de caixa, orçamento, aprovações, anexos, relatórios e fechamento mensal. Consulte o passo a passo em **[docs/FINANCEIRO.md](docs/FINANCEIRO.md)**.

Os registros financeiros ficam no IndexedDB do navegador (`ascensao.finance.v2`), e os comprovantes em uma base separada (`ascensao.finance.attachments.v1`). Eles permanecem após fechar e abrir o sistema, mas não são compartilhados entre computadores. Não limpe os dados do navegador sem conservar seus backups. O backup financeiro fica em **Financeiro › Histórico e fechamento**; o backup geral de Configurações não o substitui. O JSON financeiro não contém os arquivos dos comprovantes.

A base inicial contém exemplos fictícios, identificados na tela. **Iniciar base própria** baixa um backup e pede confirmação antes de limpar esses exemplos e zerar os saldos iniciais. Faça isso apenas quando decidir começar a operação da empresa.

## Ativar acesso compartilhado futuramente

1. Crie um projeto Supabase exclusivo da Ascensão Comercial.
2. Configure a estrutura de banco e as funções conforme `supabase/README.md` e `supabase/FINANCEIRO.md`.
3. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com a conexão desse novo projeto.
4. Configure o primeiro administrador da Ascensão Comercial. Os e-mails com domínio `.example.test` são exemplos e não representam contas de acesso real.
5. Preencha razão social, CNPJ, telefone, endereço e site em **Configurações › Geral › Empresa**.

As chaves, o vínculo de publicação e o vínculo do banco da empresa de origem não fazem parte desta cópia. Os dados gerais usam a chave própria `ascensao.db.v1`; o financeiro usa as bases descritas acima. Esta cópia não reutiliza a base da outra empresa no navegador. A ativação do banco remoto exige uma transferência planejada dos dados locais; preencher as variáveis não transfere automaticamente esses registros.

## Validar e gerar a versão de publicação

```powershell
npm test
npm run build
npm run preview
```

O último comando abre um servidor de revisão em **http://127.0.0.1:4174**. O resultado da compilação fica em `dist/`. A publicação deve ser configurada como uma aplicação separada.

## Organização

- `assets/brand/`: monograma e assinaturas provisórias da Ascensão Comercial em SVG.
- `assets/css/tokens.css`: cores e estilos gerais.
- `assets/js/core/seed.js`: dados fictícios da demonstração.
- `supabase/`: estrutura de banco, regras de acesso, funções e testes herdados do sistema-base.
- `tests/`: verificações dos recursos da aplicação.

O histórico de conversas do Codex e o histórico Git do projeto de origem não são copiados junto com os arquivos. Para continuar o trabalho no Codex, use o projeto **Ascensão Comercial**, que corresponde à pasta onde esta cópia foi criada.
