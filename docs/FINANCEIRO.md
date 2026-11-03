# Financeiro — Ascensão Comercial

## Acesso e armazenamento

Abra `servidor.ps1` na pasta do projeto e use **http://127.0.0.1:5174/#/financeiro/visao**. O servidor precisa permanecer aberto enquanto o sistema estiver em uso. Se já estiver funcionando, basta abrir o endereço.

O modo atual é local: cada navegador, perfil, endereço e porta tem sua própria base. Use sempre o mesmo navegador e o endereço acima. Os dados persistem após recarregar ou fechar a janela. Limpar dados do site, usar navegação privada ou trocar de computador pode deixar a base indisponível. Neste modo, o acesso demonstrativo não representa autenticação corporativa nem compartilhamento entre a equipe.

## Começar a base da empresa

1. O aviso **Base com exemplos** identifica os registros fictícios iniciais. Eles servem para conhecer as telas.
2. Quando decidir iniciar a operação, selecione **Iniciar base própria**. O sistema baixa o backup atual e solicita confirmação antes de limpar os exemplos. Conserve o arquivo baixado.
3. Cadastre clientes e fornecedores, categorias e centros de custo em **Cadastros**.
4. Em **Contas bancárias**, revise as contas e informe o saldo inicial e a data correspondente ao extrato. Registre os movimentos posteriores a essa data para evitar duplicidade no saldo.
5. Cadastre os títulos reais. Confira o dashboard, o DRE e o fluxo após os primeiros registros.

O início de base própria preserva categorias, centros e políticas; remove os movimentos de exemplo e zera os saldos iniciais. Não execute essa ação depois de inserir dados reais sem revisar o backup e a confirmação exibida.

## Rotina de lançamentos

Em **Novo lançamento**, informe tipo, descrição, valor total, categoria, competência, vencimento e conta prevista. Cliente/fornecedor e centro de custo ajudam a filtrar os relatórios.

- **Competência** define o mês do resultado no DRE.
- **Vencimento** define quando o título entra no caixa previsto.
- **Liquidação** registra a data e a conta do dinheiro efetivamente movimentado.
- **Parcelas** divide o total com distribuição exata dos centavos entre os meses.
- **Repetir por quantos meses?** gera o valor completo em cada mês. Use 1 para um título único. Não confunda recorrência com parcelamento.

Em **Contas a pagar** ou **Contas a receber**, use **Pagar** ou **Receber** para registrar uma baixa total ou parcial. Informe o principal liquidado, juros, multa e desconto. O título mantém o saldo restante; o caixa reflete o valor efetivo. Os detalhes mostram as baixas e permitem estorno com motivo. Cancelamentos e estornos conservam o histórico.

Essas ações registram sua gestão. Não enviam pagamentos, Pix ou transferências a instituições financeiras.

## Contas e conciliação

Cadastre cada conta em **Contas bancárias**. Use a transferência interna para movimentar o saldo entre duas contas gerenciais: ela não vira receita ou despesa no DRE. Evite cadastrar também dois títulos para a mesma transferência.

Em **Conciliação**, selecione a conta e importe um extrato CSV ou OFX. Confira a prévia e as instruções do formato antes de confirmar. A importação detecta movimentos repetidos. Vincule cada linha ao pagamento/recebimento correspondente ou registre uma baixa compatível. Conta, data, valor e direção do movimento precisam corresponder; uma baixa e uma linha de extrato não podem ser conciliadas duas vezes.

## Análise e controle

- **Dashboard:** saldos, resultado, contas em aberto, alertas e evolução anual.
- **DRE:** resultado por competência, categorias, margens e detalhamento das origens. Transferências entre contas não alteram o lucro.
- **Fluxo de caixa:** valores realizados, previstos, saldo diário e simulação de cenário. Simular não grava lançamentos.
- **Orçamento:** metas mensais por categoria/centro e comparação com o realizado.
- **Aprovações:** política de limite e fila de aprovação dos títulos abrangidos.
- **Relatórios:** filtros e exportação CSV, Excel real (.xlsx) e impressão. Para PDF, escolha **Salvar como PDF** na janela de impressão.
- **Análise financeira:** indicadores e explicações calculados a partir dos registros. Não utiliza um serviço externo de inteligência artificial.

Use **Atualizar dados** para buscar a versão gravada, especialmente ao trabalhar com várias abas. Se duas abas tentarem salvar sobre a mesma versão, o sistema recusa a segunda alteração e orienta a atualização.

## Fechamento, auditoria e backups

Em **Histórico e fechamento**, revise os eventos e feche a competência após conferir títulos, baixas e saldos. Um mês fechado bloqueia alterações que o afetem. A reabertura exige motivo.

Exporte regularmente o **backup financeiro JSON**, especialmente antes de importações ou mudanças de computador. A restauração substitui a base financeira local após validação e confirmação; confira o arquivo e conserve uma cópia atual antes de restaurar. O backup geral de **Configurações** trata os outros módulos e não substitui esse backup financeiro.

Os anexos aceitam PDF, imagens, texto e planilhas, até 10 MiB por arquivo. O JSON contém apenas as referências dos anexos: **não inclui os arquivos dos comprovantes**. Conserve os originais em pasta de backup; antes de migrar de navegador, baixe também os anexos necessários pelos detalhes dos títulos. Restaurar o JSON em outro navegador não recupera esses arquivos automaticamente.

## Limites do modo atual

A base funciona neste dispositivo e navegador. Compartilhamento entre usuários, autenticação corporativa e comprovantes remotos dependem da ativação do banco exclusivo da Ascensão Comercial, descrita em `supabase/FINANCEIRO.md`. Nenhum banco remoto foi conectado nesta entrega.

Integrações com bancos, Pix, boletos, DDA e Open Finance exigem provedores e configuração próprios. A conciliação atual funciona por importação de extratos. O DRE é gerencial; a classificação contábil e tributária deve seguir a configuração adotada pela empresa.

## Validação da entrega

A suíte automatizada passou com **187 testes** e a versão de produção foi gerada sem erros. A conferência na interface também verificou parcelamento de R$ 100,01 em três títulos, baixa parcial com juros/desconto e persistência após recarregar, em uma base de teste separada da porta 5174.

## Painéis visuais e identidade navy

O tema escuro utiliza fundo navy e superfícies azuis em níveis de profundidade. Os painéis visuais acompanham o período, a conta e os filtros de sua tela. Valores e legendas permanecem visíveis, inclusive para leitura sem distinguir cores.

- Pagar, receber e lançamentos: principal liquidado, saldo a vencer, saldo vencido e distribuição por categoria.
- Dashboard e análise: composição de receitas e despesas, além da evolução anual existente.
- Aprovações: valores por situação e categorias aguardando decisão, considerando o período e a conta selecionados. A fila de decisões usa o mesmo recorte.
- Orçamento: consumo, disponibilidade, excesso e desvios por categoria.
- Conciliação: quantidade conciliada e pendente, entradas e saídas importadas.
- Contas: saldos atuais por conta; esses saldos podem incluir movimentos fora do mês selecionado.
- DRE e caixa: formação do resultado e volumes realizados/previstos, além dos gráficos e tabelas detalhados.
- Relatórios: painel adaptado ao relatório escolhido; cadastros: valores vinculados a centros e contatos; histórico: quantidade de eventos por tipo no mês.

Gráficos sem valores exibem um estado vazio. Não são preenchidos com valores fictícios adicionais. A rosca de liquidação usa principal; juros, multas e descontos continuam separados nas baixas e no caixa. Os painéis de distribuição não substituem os totais contábeis ou o detalhamento das tabelas.

## Realizado e projetado no dashboard

A comparação anual **Receitas e despesas · realizado × projetado** usa a base de caixa, em quatro séries:

- Receitas e despesas realizadas: liquidações efetivas na data de movimentação, incluindo juros, multa e desconto. Estornos, cancelamentos e transferências internas não compõem esses valores.
- Receitas e despesas projetadas: realizado daquele mês mais o principal atualmente em aberto com vencimento original naquele mês. Uma baixa parcial aparece no realizado pela data de liquidação; somente o saldo restante fica previsto no vencimento. O mesmo título vencido não é repetido nos meses seguintes.

Barras sólidas representam realizado; contornos tracejados representam projeção total. A legenda permite mostrar/ocultar séries. **Conferir valores por mês** abre os mesmos números em tabela. Os quatro totais abaixo do gráfico correspondem ao ano selecionado, respeitando a conta bancária. O realizado segue a conta efetivamente movimentada; o principal em aberto segue a conta prevista.

Esse gráfico é diferente do resultado por competência: pagar em novembro uma despesa de outubro movimenta o caixa em novembro, mantendo a despesa gerencial em outubro. Os dois painéis são identificados separadamente. A projeção retrata os registros atuais e não conserva previsões históricas de períodos anteriores às baixas.

O tema escuro agora utiliza navy quase preto, com o laranja do logo como destaque principal no financeiro. Os cartões principais também têm gráficos compactos: saldo diário, resultado anual por competência ou distribuição dos valores por categoria/vencimento, conforme a legenda de cada cartão. Sem registros, o cartão informa a ausência de dados.


O logo enviado substitui o monograma provisório. Gráficos de distribuição usam uma escala de laranjas, percentuais de participação e total do filtro. Na comparação anual, o laranja identifica receitas e o azul acinzentado distingue despesas; realizado continua sólido e projetado, tracejado. Verde e vermelho são reservados para estados financeiros. Os eixos também acomodam resultados e saldos negativos dentro da área do gráfico.

## Categorias de despesas da agência de marketing

O catálogo padrão reúne 27 categorias de despesas. Em **Cadastros**, a visualização inicial destaca **Despesas**; as abas permitem consultar receitas ou todas as categorias.

- Entregas e campanhas: freelancers de design, copywriting, audiovisual, sites e landing pages, creators/UGC, impressão, locação de estúdio, hospedagem, direitos de imagem/trilhas e deslocamentos.
- Aquisição e mídia: marketing e mídia da própria agência, prospecção de leads, comissões comerciais e uma categoria distinta para verba de mídia de clientes.
- Estrutura e equipe: salários/encargos, benefícios, escritório/coworking, comunicação, ferramentas e assinaturas, manutenção de TI, capacitação e administração.
- Demais controles: impostos sobre serviços, estornos contratuais, tarifas bancárias e juros/multas.

A adaptação renomeia somente as categorias padrão reconhecidas, preservando seus identificadores e grupos do DRE. Categorias personalizadas não são sobrescritas, e lançamentos, pagamentos, orçamentos e saldos permanecem vinculados aos registros existentes. Novas categorias ficam disponíveis nos formulários, filtros e orçamentos; não são criados lançamentos de despesas automaticamente. A aplicação do modelo é registrada no histórico e não duplica categorias ao ser repetida.

## Receitas e contexto comercial da agência

As receitas padrão são **Contratos mensais de marketing**, **Criação e produção de conteúdo**, **Gestão de tráfego pago**, **Sites e projetos digitais**, **Branding e identidade visual**, **Consultoria e planejamento de marketing** e **Produção audiovisual**. Outras receitas continuam disponíveis separadamente.

Em bases locais antigas, **Cadastros → Atualizar contexto para agência** converte nomes de categorias e descrições herdadas de crédito para serviços de marketing. O comando preserva identificadores, vínculos, valores, vencimentos, pagamentos, conciliações, orçamentos e fechamentos; o histórico registra os nomes anteriores e posteriores. É uma atualização administrativa e atômica: uma falha de gravação não publica alterações parciais. Repetir a aplicação não duplica categorias.

A base de demonstração comercial também usa serviços de marketing, segmentos de clientes e parceiros de execução. Os exemplos existentes são atualizados ao carregar, mantendo dados personalizados e registros históricos. Identificadores internos antigos são preservados para compatibilidade. Contas bancárias reais e documentos anexados permanecem como foram cadastrados. As colunas antigas de importação continuam reconhecidas, embora os modelos novos usem os nomes da agência.

## Materiais e gráficos

Os painéis financeiros usam vidro navy com bordas iluminadas, reflexos discretos e degradês nas áreas, barras e distribuições. O laranja permanece como identidade principal; despesas usam azul acinzentado e situações financeiras mantêm suas cores semânticas. Realizado continua sólido e projetado permanece tracejado.

As curvas usam interpolação monotônica para não introduzir picos entre os valores observados. Preenchimentos negativos desaparecem em direção à linha zero. Mini gráficos, legendas, filtros e tabelas mantêm os mesmos dados. As preferências de redução de movimento, transparência e aumento de contraste têm alternativas específicas; impressões usam superfícies opacas.

## Cadastros padrão de gestão financeira

O catálogo `finance-catalog.js` inclui receitas, despesas e centros de custo gerais, com serviços, contratos recorrentes, projetos e vendas. Marketing permanece como uma área opcional da operação.

No primeiro acesso autorizado ao financeiro, o catálogo versão 1 é aplicado ao espaço financeiro pela mesma persistência transacional usada pelos lançamentos, com comparação de revisão e auditoria. IDs existentes são preservados; somente nomes padrão conhecidos são adaptados. Valores, pagamentos e documentos não são modificados. Nomes personalizados permanecem intactos. O marcador de versão impede a recriação automática após exclusões voluntárias. Em Cadastros, a opção Completar cadastros padrão permite recuperar os itens ausentes.
