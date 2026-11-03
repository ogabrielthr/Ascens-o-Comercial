/* Standard financial management catalogs. Never changes ledger values or references. */
(function (global) {
  'use strict';
  var A = global.AGIR = global.AGIR || {};
  var categories = [
    ['pc_com_inss','Contratos recorrentes','receita','Receita operacional',['Contratos mensais de marketing','Comissão — Consignado INSS']],
    ['pc_com_serv','Prestação de serviços','receita','Receita operacional',['Criação e produção de conteúdo','Comissão — Servidor/Militar']],
    ['pc_com_fgts','Gestão e execução de projetos','receita','Receita operacional',['Gestão de tráfego pago','Comissão — FGTS e Cartão']],
    ['pc_com_port','Projetos e entregas pontuais','receita','Receita operacional',['Sites e projetos digitais','Comissão — Portabilidade']],
    ['pc_std_sales','Venda de produtos','receita','Receita operacional'],
    ['pc_ag_consult','Consultoria e assessoria','receita','Receita operacional',['Consultoria e planejamento de marketing']],
    ['pc_std_other_income','Outras receitas operacionais','receita','Receita operacional'],
    ['pc_std_fin_income','Rendimentos e receitas financeiras','receita','Receita não operacional'],
    ['pc_imposto','Impostos sobre faturamento','despesa','Deduções',['Impostos sobre serviços de marketing','Impostos sobre receita']],
    ['pc_estorno','Estornos, cancelamentos e devoluções','despesa','Deduções',['Estornos e cancelamentos de contratos','Estornos e cancelamentos']],
    ['pc_comissao','Comissões comerciais e indicações','despesa','Custo variável',['Comissionamento do time']],
    ['pc_mkt','Marketing, publicidade e mídia própria','despesa','Custo variável',['Marketing e mídia da agência','Marketing e tráfego pago']],
    ['pc_lead','Prospecção e aquisição de clientes','despesa','Custo variável',['Prospecção e aquisição de leads','Compra de mailing / leads']],
    ['pc_std_direct','Custos diretos de serviços e projetos','despesa','Custo variável'],
    ['pc_std_goods','Mercadorias e insumos','despesa','Custo variável'],
    ['pc_std_outsource','Prestadores e serviços terceirizados','despesa','Custo variável'],
    ['pc_folha','Salários e encargos','despesa','Custo fixo',['Equipe fixa, salários e encargos','Folha e encargos']],
    ['pc_std_partners','Pró-labore','despesa','Custo fixo'],
    ['pc_ag_benefits','Benefícios da equipe','despesa','Custo fixo',['Benefícios e bem-estar da equipe']],
    ['pc_alug','Aluguel, condomínio e coworking','despesa','Custo fixo',['Escritório, coworking e condomínio','Aluguel e condomínio']],
    ['pc_tel','Internet e telefonia','despesa','Custo fixo',['Internet, telefonia e comunicação','Telefonia e discador']],
    ['pc_soft','Softwares, ferramentas e assinaturas','despesa','Custo fixo',['Ferramentas e assinaturas da agência','Software e sistemas']],
    ['pc_admin','Contabilidade, jurídico e administração','despesa','Custo fixo',['Administrativo e contabilidade']],
    ['pc_ag_office','Energia, limpeza e materiais de escritório','despesa','Custo fixo'],
    ['pc_ag_it','Manutenção e suporte de TI','despesa','Custo fixo',['Manutenção de equipamentos e suporte de TI']],
    ['pc_ag_training','Treinamento e desenvolvimento','despesa','Custo fixo',['Cursos, capacitação e eventos do setor']],
    ['pc_ag_travel','Viagens e deslocamentos','despesa','Custo variável',['Deslocamentos e viagens de produção']],
    ['pc_std_insurance','Seguros e licenças','despesa','Custo fixo'],
    ['pc_std_other_cost','Outras despesas operacionais','despesa','Custo fixo'],
    ['pc_ag_fees','Tarifas bancárias e meios de pagamento','despesa','Despesas financeiras'],
    ['pc_ag_interest','Juros e multas financeiras','despesa','Despesas financeiras']
  ];
  var centers = [
    ['cc_admin','Administrativo e financeiro'],['cc_com','Comercial e vendas'],
    ['cc_mkt','Marketing e comunicação'],['cc_std_ops','Operações e prestação de serviços'],
    ['cc_std_projects','Projetos'],['cc_std_people','Pessoas e gestão'],
    ['cc_std_tech','Tecnologia e infraestrutura'],['cc_std_direction','Diretoria e estratégia']
  ];
  var centerAliases = {cc_admin:['Administrativo','Administrativo / Financeiro'],cc_com:['Comercial'],cc_mkt:['Marketing']};
  function key(v) { return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase(); }
  function plan(state) {
    var result = {added:[],renamed:[],centersAdded:[],centersRenamed:[]};
    categories.forEach(function (item) {
      var found = state.planoContas.find(function (c) { return c.id === item[0]; });
      if (found) {
        if (found.tipo === item[2] && (item[4] || []).includes(found.nome)) result.renamed.push({id:found.id,before:found.nome,after:item[1]});
      } else if (!state.planoContas.some(function(c){return c.tipo===item[2]&&key(c.nome)===key(item[1]);})) {
        result.added.push({id:item[0],nome:item[1],tipo:item[2],grupo:item[3]});
      }
    });
    centers.forEach(function (item) {
      var found = state.centrosCusto.find(function(c){return c.id===item[0];});
      if(found) {
        if((centerAliases[item[0]]||[]).includes(found.nome)) result.centersRenamed.push({id:found.id,before:found.nome,after:item[1]});
      } else if(!state.centrosCusto.some(function(c){return key(c.nome)===key(item[1]);})) result.centersAdded.push({id:item[0],nome:item[1]});
    });
    return result;
  }
  function apply(state) {
    var changes = plan(state);
    changes.renamed.forEach(function(x){state.planoContas.find(function(c){return c.id===x.id;}).nome=x.after;});
    changes.centersRenamed.forEach(function(x){state.centrosCusto.find(function(c){return c.id===x.id;}).nome=x.after;});
    state.planoContas.push.apply(state.planoContas,changes.added);
    state.centrosCusto.push.apply(state.centrosCusto,changes.centersAdded);
    state.standardCatalogVersion = 1;
    return changes;
  }
  A.financeCatalog = {plan:plan,apply:apply};
})(window);
