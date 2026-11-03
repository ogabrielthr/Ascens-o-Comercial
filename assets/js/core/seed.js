/* ==========================================================================
   AGIR — seed.js
   Gera uma base inicial realista de agência de marketing e comunicação.
   Determinística (PRNG com semente fixa): a mesma base em toda máquina,
   mas sempre ancorada na data de hoje, então o sistema nunca parece velho.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR = global.AGIR || {};

  /* ---------- PRNG determinístico (mulberry32) --------------------------- */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var R = rng(20260820);
  function rnd() { return R(); }
  function ri(min, max) { return Math.floor(rnd() * (max - min + 1)) + min; }
  function rf(min, max) { return rnd() * (max - min) + min; }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  /** Escolha ponderada: pickW([[valor,peso],...]) */
  function pickW(pairs) {
    var total = pairs.reduce(function (s, p) { return s + p[1]; }, 0);
    var r = rnd() * total;
    for (var i = 0; i < pairs.length; i++) { r -= pairs[i][1]; if (r <= 0) return pairs[i][0]; }
    return pairs[pairs.length - 1][0];
  }
  function chance(p) { return rnd() < p; }
  var _n = 0;
  function id(p) { return p + '_' + (++_n).toString(36).padStart(4, '0'); }

  /* ---------- Datas ------------------------------------------------------ */
  var TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
  function addD(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function isoOf(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }
  function isoT(d, h, m) {
    var x = new Date(d); x.setHours(h === undefined ? ri(9, 18) : h, m === undefined ? ri(0, 59) : m, 0, 0);
    return x.toISOString();
  }
  function isWknd(d) { var g = d.getDay(); return g === 0 || g === 6; }
  /** Empurra para o próximo dia útil */
  function bizDay(d) { var x = new Date(d); while (isWknd(x)) x = addD(x, 1); return x; }

  /* 5 meses de histórico. Mais que isso e a base passa da cota de ~5 MB do
     localStorage — o volume de ligações dos BDRs é o que pesa. */
  var HISTORY_DAYS = 150;
  var START = addD(TODAY, -HISTORY_DAYS);

  /* ==========================================================================
     Catálogos de domínio
     ========================================================================== */
  var PRODUTOS = [
    { id: 'prod_inss',   nome: 'Gestão de marketing mensal',            comissaoPct: 4.2, ticket: [6000, 32000],  cor: 'var(--series-1)' },
    { id: 'prod_serv',   nome: 'Social media e conteúdo',        comissaoPct: 5.0, ticket: [12000, 70000], cor: 'var(--series-2)' },
    { id: 'prod_mil',    nome: 'Branding e design',         comissaoPct: 4.6, ticket: [15000, 85000], cor: 'var(--series-3)' },
    { id: 'prod_fgts',   nome: 'Gestão de tráfego pago',           comissaoPct: 3.1, ticket: [900, 9000],    cor: 'var(--series-4)' },
    { id: 'prod_cartao', nome: 'Campanhas e criativos',           comissaoPct: 6.2, ticket: [1200, 7000],   cor: 'var(--series-6)' },
    { id: 'prod_port',   nome: 'Sites e landing pages',      comissaoPct: 3.8, ticket: [10000, 60000], cor: 'var(--series-7)' },
    { id: 'prod_refin',  nome: 'Consultoria e planejamento',            comissaoPct: 3.4, ticket: [8000, 45000],  cor: 'var(--series-5)' },
    { id: 'prod_clt',    nome: 'Produção audiovisual',                comissaoPct: 2.7, ticket: [3000, 25000],  cor: 'var(--series-8)' }
  ];
  var PROD_PESO = [
    ['prod_inss', 32], ['prod_serv', 16], ['prod_fgts', 14], ['prod_cartao', 11],
    ['prod_port', 10], ['prod_refin', 8], ['prod_mil', 5], ['prod_clt', 4]
  ];

  var BANCOS = [
    { id: 'bco_c6',     nome: 'Estúdio Criativo' },
    { id: 'bco_master', nome: 'Produtora Visual' },
    { id: 'bco_facta',  nome: 'Parceiro de Tecnologia' },
    { id: 'bco_pan',    nome: 'Parceiro de Performance' },
    { id: 'bco_bmg',    nome: 'Estúdio de Design' },
    { id: 'bco_day',    nome: 'Produtora Audiovisual' },
    { id: 'bco_safra',  nome: 'Parceiro de Conteúdo' },
    { id: 'bco_ole',    nome: 'Estúdio de Fotografia' },
    { id: 'bco_itau',   nome: 'Parceiro Web' }
  ];
  var CONVENIOS = [
    { id: 'conv_inss', nome: 'Marketing mensal' },
    { id: 'conv_siape', nome: 'Saúde e bem-estar' },
    { id: 'conv_estado', nome: 'Serviços profissionais' },
    { id: 'conv_municipio', nome: 'Comércio local' },
    { id: 'conv_forcas', nome: 'Tecnologia e negócios' }
  ];
  var BANCO_PESO = [
    ['bco_c6', 20], ['bco_master', 17], ['bco_facta', 15], ['bco_pan', 13],
    ['bco_bmg', 11], ['bco_day', 8], ['bco_safra', 6], ['bco_ole', 6], ['bco_itau', 4]
  ];

  var ORIGENS = [
    { id: 'org_indic',  nome: 'Indicação',          cor: 'var(--series-3)' },
    { id: 'org_meta',   nome: 'Meta Ads',           cor: 'var(--series-2)' },
    { id: 'org_google', nome: 'Google Ads',         cor: 'var(--series-4)' },
    { id: 'org_base',   nome: 'Base própria',       cor: 'var(--series-1)' },
    { id: 'org_ativo',  nome: 'Prospecção ativa',   cor: 'var(--series-6)' },
    { id: 'org_parc',   nome: 'Parceiro',           cor: 'var(--series-7)' },
    { id: 'org_porta',  nome: 'Porta a porta',      cor: 'var(--series-5)' }
  ];
  var ORIGEM_PESO = [
    ['org_indic', 22], ['org_meta', 20], ['org_base', 17], ['org_ativo', 15],
    ['org_google', 11], ['org_parc', 9], ['org_porta', 6]
  ];

  /* ---------- Humor / clima diário --------------------------------------- */
  var ESCALA_HUMOR = [
    { nota: 1, label: 'Péssimo', curto: 'Péssimo', cor: 'var(--bad-500)' },
    { nota: 2, label: 'Ruim',    curto: 'Ruim',    cor: 'var(--warn-500)' },
    { nota: 3, label: 'Normal',  curto: 'Normal',  cor: 'var(--ink-3)' },
    { nota: 4, label: 'Bom',     curto: 'Bom',     cor: 'var(--info-500)' },
    { nota: 5, label: 'Ótimo',   curto: 'Ótimo',   cor: 'var(--ok-500)' }
  ];

  var FATORES_HUMOR = [
    { id: 'fh_meta',    nome: 'Bati minha meta do dia',      tom: 'bom' },
    { id: 'fh_fechou',  nome: 'Fechei contrato',             tom: 'bom' },
    { id: 'fh_reuniao', nome: 'Reunião boa',                 tom: 'bom' },
    { id: 'fh_time',    nome: 'Time me apoiou',              tom: 'bom' },
    { id: 'fh_aprendi', nome: 'Aprendi algo novo',           tom: 'bom' },
    { id: 'fh_base',    nome: 'Base / mailing fraco',        tom: 'ruim' },
    { id: 'fh_objecao', nome: 'Muita objeção',               tom: 'ruim' },
    { id: 'fh_cansaco', nome: 'Cansaço',                     tom: 'ruim' },
    { id: 'fh_pressao', nome: 'Pressão por meta',            tom: 'ruim' },
    { id: 'fh_sistema', nome: 'Ferramentas ou integrações indisponíveis',   tom: 'ruim' },
    { id: 'fh_apoio',   nome: 'Faltou apoio / direção',      tom: 'ruim' },
    { id: 'fh_pessoal', nome: 'Questão pessoal',             tom: 'ruim' }
  ];

  var MOTIVOS_PERDA = [
    { id: 'mp_margem',  nome: 'Sem orçamento disponível' },
    { id: 'mp_taxa',    nome: 'Proposta concorrente mais competitiva' },
    { id: 'mp_sumiu',   nome: 'Não atende / sumiu' },
    { id: 'mp_desist',  nome: 'Cliente desistiu' },
    { id: 'mp_recusa',  nome: 'Projeto fora do escopo' },
    { id: 'mp_outro',   nome: 'Fechou com outra agência' },
    { id: 'mp_doc',     nome: 'Documentação incompleta' },
    { id: 'mp_perfil',  nome: 'Fora do perfil' }
  ];
  var PERDA_PESO = [
    ['mp_margem', 24], ['mp_sumiu', 20], ['mp_taxa', 16], ['mp_desist', 12],
    ['mp_recusa', 10], ['mp_outro', 9], ['mp_doc', 5], ['mp_perfil', 4]
  ];

  var ETAPAS = [
    { id: 'et_novo',   nome: 'Lead Novo',        cor: '#5AB9F5', tipo: 'aberto',  sla: 1,  prob: 10, ordem: 1 },
    { id: 'et_conex',  nome: 'Conexão',          cor: '#38BDF8', tipo: 'aberto',  sla: 2,  prob: 20, ordem: 2 },
    { id: 'et_agend',  nome: 'Reunião agendada', cor: '#A78BFA', tipo: 'aberto',  sla: 4,  prob: 35, ordem: 3 },
    { id: 'et_reuni',  nome: 'Reunião realizada',cor: '#FF9500', tipo: 'aberto',  sla: 5,  prob: 50, ordem: 4 },
    { id: 'et_prop',   nome: 'Proposta enviada', cor: '#FBBF24', tipo: 'aberto',  sla: 7,  prob: 65, ordem: 5 },
    { id: 'et_negoc',  nome: 'Negociação',       cor: '#F472B6', tipo: 'aberto',  sla: 10, prob: 80, ordem: 6 },
    { id: 'et_ganho',  nome: 'Fechado Ganho',    cor: '#2DD4A7', tipo: 'ganho',   sla: 0,  prob: 100, ordem: 7 },
    { id: 'et_perd',   nome: 'Fechado Perdido',  cor: '#FB6E6E', tipo: 'perdido', sla: 0,  prob: 0,  ordem: 8 }
  ];
  var ABERTAS = ETAPAS.filter(function (e) { return e.tipo === 'aberto'; }).map(function (e) { return e.id; });

  /* ---------- Nomes ------------------------------------------------------ */
  var NOMES = ['Maria', 'José', 'Ana', 'João', 'Antônio', 'Francisca', 'Carlos', 'Paulo', 'Pedro',
    'Lucas', 'Luiz', 'Marcos', 'Luís', 'Gabriel', 'Rafael', 'Francisco', 'Marcelo', 'Adriana',
    'Juliana', 'Márcia', 'Fernanda', 'Patrícia', 'Aline', 'Sandra', 'Camila', 'Amanda', 'Bruna',
    'Jéssica', 'Letícia', 'Júlia', 'Luciana', 'Vanessa', 'Mariana', 'Gabriela', 'Vera', 'Rosa',
    'Sebastião', 'Raimundo', 'Geraldo', 'Benedito', 'Terezinha', 'Cleusa', 'Ivone', 'Nelson',
    'Osvaldo', 'Waldir', 'Elza', 'Iracema', 'Djalma', 'Sueli', 'Cícero', 'Manoel', 'Neide'];
  var SOBRENOMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves',
    'Pereira', 'Lima', 'Gomes', 'Ribeiro', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes',
    'Vieira', 'Barbosa', 'Rocha', 'Dias', 'Nascimento', 'Andrade', 'Moreira', 'Nunes', 'Marques',
    'Machado', 'Mendes', 'Freitas', 'Cardoso', 'Ramos', 'Gonçalves', 'Santana', 'Teixeira',
    'Correia', 'Cavalcante', 'Monteiro', 'Moura', 'Batista', 'Duarte', 'Pinto'];
  function nomeCliente() { return pick(NOMES) + ' ' + pick(SOBRENOMES) + ' ' + pick(SOBRENOMES); }
  function cpfNum() { return String(ri(10000000000, 99999999999)); }
  function telNum() {
    var ddd = pick(['11', '21', '31', '41', '51', '61', '62', '71', '81', '85', '48', '19', '27']);
    return ddd + '9' + ri(10000000, 99999999);
  }

  var UFS = ['SP', 'RJ', 'MG', 'BA', 'PR', 'RS', 'PE', 'CE', 'GO', 'SC', 'DF', 'ES'];
  var CIDADES = {
    SP: ['São Paulo', 'Campinas', 'Guarulhos', 'Santo André', 'Ribeirão Preto'],
    RJ: ['Rio de Janeiro', 'Niterói', 'Duque de Caxias', 'Nova Iguaçu'],
    MG: ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora'],
    BA: ['Salvador', 'Feira de Santana', 'Vitória da Conquista'],
    PR: ['Curitiba', 'Londrina', 'Maringá'],
    RS: ['Porto Alegre', 'Caxias do Sul', 'Pelotas'],
    PE: ['Recife', 'Jaboatão', 'Olinda'],
    CE: ['Fortaleza', 'Caucaia', 'Juazeiro do Norte'],
    GO: ['Goiânia', 'Aparecida de Goiânia', 'Anápolis'],
    SC: ['Florianópolis', 'Joinville', 'Blumenau'],
    DF: ['Brasília', 'Taguatinga'],
    ES: ['Vitória', 'Vila Velha', 'Serra']
  };

  /* ==========================================================================
     build() — monta a base completa
     ========================================================================== */
  function build() {
    _n = 0;
    R = rng(20260820);

    /* ---------- Cargos e permissões ------------------------------------- */
    var cargos = [
      { id: 'cg_admin',  nome: 'Administrador',   nivel: 100, cor: 'var(--series-4)',
        permissoes: ['*'] },
      { id: 'cg_gestor', nome: 'Gestor Comercial', nivel: 80, cor: 'var(--series-1)',
        permissoes: ['crm.*', 'performance.*', 'financeiro.ver', 'config.equipe', 'relatorios.*'] },
      { id: 'cg_closer', nome: 'Closer',           nivel: 50, cor: 'var(--series-3)',
        permissoes: ['crm.proprio', 'performance.proprio', 'relatorios.proprio'] },
      { id: 'cg_bdr',    nome: 'BDR / Prospector', nivel: 40, cor: 'var(--series-2)',
        permissoes: ['crm.proprio', 'performance.proprio'] },
      { id: 'cg_mesa',   nome: 'Operador de Mesa', nivel: 30, cor: 'var(--series-6)',
        permissoes: ['crm.leitura', 'financeiro.lancar'] }
    ];

    var equipes = [
      { id: 'eq_alfa',  nome: 'Equipe Alfa',  cor: 'var(--series-1)', gestorId: 'us_gabriel' },
      { id: 'eq_bravo', nome: 'Equipe Bravo', cor: 'var(--series-2)', gestorId: 'us_gabriel' }
    ];

    /* ---------- Usuários -------------------------------------------------- */
    var usuarios = [
      { id: 'us_gabriel',  nome: 'Administrador Demo',   email: 'admin@ascensao.example.test',
        cargoId: 'cg_admin', equipeId: 'eq_alfa',  ramal: '1000', ativo: true, forca: 1.00 },
      { id: 'us_marianne', nome: 'Marianne Marques',  email: 'marianne.marques@ascensao.example.test',
        cargoId: 'cg_closer', equipeId: 'eq_alfa',  ramal: '1001', ativo: true, forca: 1.32 },
      { id: 'us_lucas',    nome: 'Lucas Gomes',       email: 'lucas.gomes@ascensao.example.test',
        cargoId: 'cg_closer', equipeId: 'eq_bravo', ramal: '1002', ativo: true, forca: 0.86 },
      { id: 'us_camila',   nome: 'Camila Ferraz',     email: 'camila.ferraz@ascensao.example.test',
        cargoId: 'cg_closer', equipeId: 'eq_alfa',  ramal: '1003', ativo: true, forca: 1.10 },
      { id: 'us_rodrigo',  nome: 'Rodrigo Bastos',    email: 'rodrigo.bastos@ascensao.example.test',
        cargoId: 'cg_bdr',    equipeId: 'eq_bravo', ramal: '1004', ativo: true, forca: 0.94 },
      { id: 'us_thais',    nome: 'Thaís Nogueira',    email: 'thais.nogueira@ascensao.example.test',
        cargoId: 'cg_bdr',    equipeId: 'eq_alfa',  ramal: '1005', ativo: true, forca: 1.18 },
      { id: 'us_diego',    nome: 'Diego Sampaio',     email: 'diego.sampaio@ascensao.example.test',
        cargoId: 'cg_bdr',    equipeId: 'eq_bravo', ramal: '1006', ativo: true, forca: 0.72 },
      { id: 'us_patricia', nome: 'Patrícia Rangel',   email: 'patricia.rangel@ascensao.example.test',
        cargoId: 'cg_mesa',   equipeId: 'eq_bravo', ramal: '1007', ativo: true, forca: 0.90 }
    ];
    usuarios.forEach(function (u, i) {
      u.hue = AGIR.fmt.hueOf(u.nome);
      u.admissao = isoOf(addD(TODAY, -ri(120, 900)));
      u.telefone = telNum();
      u.avatar = null;
      u.ordem = i;
    });

    /* Quem carrega oportunidade: closers + gestor. BDR gera atividade e agenda. */
    var VENDEDORES = usuarios.filter(function (u) {
      return ['cg_closer', 'cg_gestor'].indexOf(u.cargoId) >= 0;
    });
    var BDRS = usuarios.filter(function (u) { return u.cargoId === 'cg_bdr'; });
    var OPERADORES = VENDEDORES.concat(BDRS);

    /* ---------- Oportunidades e atividades -------------------------------- */
    var oportunidades = [];
    var atividades = [];

    /* Sazonalidade: volume por mês, com queda em dez/jan e pico em mar e set. */
    function fatorMes(d) {
      var m = d.getMonth();
      return [0.82, 0.90, 1.12, 1.05, 1.00, 0.96, 0.94, 1.02, 1.14, 1.08, 1.04, 0.78][m];
    }
    /* Aquecimento: o negócio cresceu ao longo do histórico */
    function fatorTempo(d) {
      var prog = 1 - (TODAY - d) / (HISTORY_DAYS * 864e5);   // 0 = início, 1 = hoje
      return 0.72 + prog * 0.5;
    }

    var cursor = new Date(START);
    while (cursor <= TODAY) {
      if (!isWknd(cursor)) {
        var base = 5 * fatorMes(cursor) * fatorTempo(cursor);

        VENDEDORES.forEach(function (dono) {
          var qtd = Math.max(0, Math.round(base * dono.forca * rf(0.5, 1.5)));
          for (var i = 0; i < qtd; i++) {
            oportunidades.push(criarOportunidade(cursor, dono, atividades));
          }
        });

        /* Atividade de prospecção dos BDRs (ligação em massa).
           Registro enxuto de propósito: são milhares e campos vazios custam
           espaço na cota do localStorage. */
        BDRS.forEach(function (bdr) {
          var lig = Math.round(rf(16, 34) * bdr.forca * fatorTempo(cursor));
          for (var j = 0; j < lig; j++) {
            atividades.push({
              id: id('atv'),
              tipo: 'ligacao',
              ownerId: bdr.id,
              oportunidadeId: null,
              data: isoT(cursor, ri(8, 18)),
              duracaoSeg: pickW([[ri(8, 35), 46], [ri(40, 120), 30], [ri(130, 420), 20], [ri(430, 1400), 4]]),
              resultado: pickW([['nao_atendeu', 42], ['atendeu', 34], ['sem_interesse', 14], ['agendou', 7], ['numero_invalido', 3]])
            });
          }
        });
      }
      cursor = addD(cursor, 1);
    }

    /* ---------- Criação de uma oportunidade com trajetória coerente ------- */
    function criarOportunidade(dataCriacao, dono, atvOut) {
      var oid = id('opp');
      var prodId = pickW(PROD_PESO);
      var prod = PRODUTOS.find(function (p) { return p.id === prodId; });
      var valor = Math.round(rf(prod.ticket[0], prod.ticket[1]) / 100) * 100;
      var comissao = Math.round(valor * (prod.comissaoPct / 100) * rf(0.9, 1.12));
      var uf = pick(UFS);
      var origemId = pickW(ORIGEM_PESO);

      var op = {
        id: oid,
        pipelineId: 'pl_comercial',
        titulo: '',
        cliente: nomeCliente(),
        cpf: cpfNum(),
        telefone: telNum(),
        email: '',
        uf: uf,
        cidade: pick(CIDADES[uf]),
        produtoId: prodId,
        convenioId: pick(CONVENIOS).id,
        matricula: String(ri(100000, 9999999)),
        bancoId: pickW(BANCO_PESO),
        origemId: origemId,
        valor: valor,
        valorTotal: null,
        valorFinal: null,
        estornoSolicitado: null,
        comissao: comissao,
        ownerId: dono.id,
        etapaId: 'et_novo',
        status: 'aberto',
        motivoPerdaId: null,
        criadoEm: isoT(dataCriacao, ri(8, 19)),
        entrouEtapaEm: isoT(dataCriacao, ri(8, 19)),
        atualizadoEm: null,
        fechadoEm: null,
        previsaoFechamento: isoOf(bizDay(addD(dataCriacao, ri(8, 34)))),
        tags: [],
        obs: ''
      };
      op.titulo = prod.nome + ' — ' + op.cliente.split(' ')[0] + ' ' + op.cliente.split(' ')[1];

      /* Probabilidade de avançar cada etapa. Indicação e base própria convertem
         melhor; prospecção fria e porta a porta convertem pior. */
      var boostOrigem = { org_indic: 1.30, org_base: 1.22, org_parc: 1.10,
        org_meta: 0.96, org_google: 1.02, org_ativo: 0.86, org_porta: 0.78 }[origemId];
      var skill = dono.forca;

      var pAvanca = [
        0.62,  // Lead Novo -> Conexão
        0.55,  // Conexão -> Reunião agendada
        0.72,  // agendada -> realizada (no-show é a perda aqui)
        0.66,  // realizada -> Proposta
        0.74,  // Proposta -> Negociação
        0.58   // Negociação -> Ganho
      ];

      var etapaIdx = 0;
      var quando = new Date(dataCriacao);

      registrar(op, atvOut, 'nota', quando, 'Lead criado — origem ' +
        ORIGENS.find(function (o) { return o.id === origemId; }).nome);

      while (etapaIdx < 6) {
        var p = Math.min(0.94, pAvanca[etapaIdx] * boostOrigem * (0.82 + skill * 0.22));
        /* Tempo até o próximo passo */
        var espera = Math.max(0, Math.round(rf(0.4, 1) * [2, 3, 4, 5, 6, 8][etapaIdx] * rf(0.5, 2.1)));
        quando = bizDay(addD(quando, espera));
        if (quando > TODAY) break;                      // ainda em andamento

        if (!chance(p)) {                                // perdeu aqui
          op.etapaId = 'et_perd';
          op.status = 'perdido';
          op.motivoPerdaId = pickW(PERDA_PESO);
          op.fechadoEm = isoT(quando, ri(9, 18));
          op.entrouEtapaEm = op.fechadoEm;
          op.atualizadoEm = op.fechadoEm;
          registrar(op, atvOut, 'nota', quando, 'Perdido: ' +
            MOTIVOS_PERDA.find(function (m) { return m.id === op.motivoPerdaId; }).nome);
          return op;
        }

        etapaIdx++;
        if (etapaIdx < 6) {
          op.etapaId = ABERTAS[etapaIdx];
          op.entrouEtapaEm = isoT(quando, ri(9, 18));
          op.atualizadoEm = op.entrouEtapaEm;
          registrarEtapa(op, atvOut, etapaIdx, quando, dono);
        } else {
          op.etapaId = 'et_ganho';
          op.status = 'ganho';
          /* No modo de demonstração, vendas ganhas recebem os três valores
             gerenciais para que o ranking por Valor Estornado seja útil. */
          op.estornoSolicitado = Math.round((op.valor * rf(0.045, 0.14)) / 50) * 50;
          op.valorTotal = op.valor + op.estornoSolicitado;
          op.valorFinal = Math.round((op.valorTotal * rf(0.96, 1.02)) / 50) * 50;
          op.fechadoEm = isoT(quando, ri(9, 18));
          op.entrouEtapaEm = op.fechadoEm;
          op.atualizadoEm = op.fechadoEm;
          registrar(op, atvOut, 'nota', quando, 'Contrato assinado e enviado para formalização do projeto.');
          return op;
        }
      }

      if (!op.atualizadoEm) op.atualizadoEm = op.criadoEm;
      return op;
    }

    /* Registra a atividade típica de cada transição de etapa */
    function registrarEtapa(op, out, idx, quando, dono) {
      var responsavel = (idx <= 2 && BDRS.length && chance(0.55))
        ? pick(BDRS).id : dono.id;
      if (idx === 1) {
        out.push(atv('ligacao', op, responsavel, quando, {
          duracaoSeg: ri(90, 480), resultado: 'atendeu',
          nota: 'Contato estabelecido. Cliente com orçamento, interesse em ' +
            PRODUTOS.find(function (p) { return p.id === op.produtoId; }).nome.toLowerCase() + '.'
        }));
      } else if (idx === 2) {
        out.push(atv('reuniao', op, responsavel, quando, {
          resultado: 'agendou', agendadoPara: isoT(bizDay(addD(quando, ri(1, 5))), ri(9, 17), pick([0, 30])),
          nota: 'Reunião de diagnóstico agendada.'
        }));
      } else if (idx === 3) {
        out.push(atv('reuniao', op, dono.id, quando, {
          duracaoSeg: ri(900, 2700), resultado: 'realizada',
          nota: 'Briefing realizado e proposta de serviços apresentada.'
        }));
      } else if (idx === 4) {
        out.push(atv('proposta', op, dono.id, quando, {
          resultado: 'enviada',
          nota: 'Proposta ' + AGIR.fmt.money(op.valor) + ' enviada via WhatsApp.'
        }));
      } else if (idx === 5) {
        out.push(atv('whatsapp', op, dono.id, quando, {
          resultado: 'respondeu', nota: 'Cliente pediu revisão de parcela. Em negociação.'
        }));
      }
      /* follow-ups avulsos */
      if (chance(0.4)) {
        out.push(atv(pick(['whatsapp', 'ligacao']), op, responsavel, bizDay(addD(quando, ri(1, 3))), {
          duracaoSeg: ri(20, 200),
          resultado: pickW([['nao_atendeu', 40], ['atendeu', 45], ['respondeu', 15]]),
          nota: 'Follow-up.'
        }));
      }
    }

    function registrar(op, out, tipo, quando, nota) {
      out.push(atv(tipo, op, op.ownerId, quando, { nota: nota }));
    }

    function atv(tipo, op, ownerId, quando, extra) {
      var a = {
        id: id('atv'), tipo: tipo, ownerId: ownerId, oportunidadeId: op.id,
        data: isoT(quando, ri(8, 19)), duracaoSeg: 0, resultado: '', nota: '',
        agendadoPara: null
      };
      Object.keys(extra || {}).forEach(function (k) { a[k] = extra[k]; });
      return a;
    }

    /* ---------- Atividades futuras (agenda de hoje e da semana) ------------ */
    var agenda = [];
    OPERADORES.forEach(function (u) {
      var n = ri(2, 6);
      for (var i = 0; i < n; i++) {
        var abertas = oportunidades.filter(function (o) {
          return o.ownerId === u.id && o.status === 'aberto';
        });
        if (!abertas.length) continue;
        var op = pick(abertas);
        var dia = bizDay(addD(TODAY, ri(0, 6)));
        agenda.push({
          id: id('atv'),
          tipo: pickW([['ligacao', 40], ['reuniao', 30], ['whatsapp', 20], ['proposta', 10]]),
          ownerId: u.id,
          oportunidadeId: op.id,
          data: isoT(dia, ri(9, 17), pick([0, 30])),
          duracaoSeg: 0,
          resultado: 'pendente',
          agendadoPara: isoT(dia, ri(9, 17), pick([0, 30])),
          nota: pick([
            'Retomar contato — cliente pediu para ligar hoje.',
            'Apresentar escopo e investimento da proposta.',
            'Confirmar documentação para formalização do projeto.',
            'Reunião de fechamento.',
            'Revisar briefing e orçamento da campanha.'
          ])
        });
      }
    });
    atividades = atividades.concat(agenda);
    atividades.sort(function (a, b) { return a.data < b.data ? 1 : -1; });

    /* ---------- Metas mensais --------------------------------------------- */
    var metas = [];
    var metaBase = { cg_gestor: 0, cg_closer: 260000, cg_bdr: 0, cg_mesa: 0, cg_admin: 0 };
    for (var back = 5; back >= -1; back--) {
      var ref = new Date(TODAY.getFullYear(), TODAY.getMonth() - back, 1);
      usuarios.forEach(function (u) {
        var isCloser = u.cargoId === 'cg_closer';
        var isBdr = u.cargoId === 'cg_bdr';
        var isGestor = u.cargoId === 'cg_gestor';
        if (!isCloser && !isBdr && !isGestor) return;
        metas.push({
          id: id('mta'),
          usuarioId: u.id,
          ano: ref.getFullYear(),
          mes: ref.getMonth() + 1,
          ligacoes:      isBdr ? Math.round(700 * u.forca) : (isCloser ? 260 : 0),
          agendamentos:  isBdr ? Math.round(48 * u.forca)  : (isCloser ? 26 : 0),
          reunioes:      isBdr ? 0 : (isCloser ? 20 : 12),
          propostas:     isBdr ? 0 : (isCloser ? 16 : 10),
          vendasQtd:     isBdr ? 0 : (isCloser ? 7 : 4),
          vendasValor:   isGestor ? 180000 : Math.round(metaBase[u.cargoId] * (0.85 + u.forca * 0.2) / 1000) * 1000
        });
      });
    }

    /* ---------- Trilhas de conteúdo (Performance) -------------------------- */
    var trilhas = [
      {
        id: 'tr_bdr', titulo: 'BDR de Elite', publicado: true,
        descricao: 'A base técnica de quem abre porta: SPIN, persuasão e volume com qualidade.',
        capa: 'bdr', pontosAula: 10, pontosConclusao: 50, ordem: 1,
        aulas: [
          { id: 'au_b1', titulo: 'SPIN Selling — a técnica dos vendedores de sucesso', duracaoMin: 18, autor: 'Thiago Reis' },
          { id: 'au_b2', titulo: 'Persuasão: a técnica secreta para sucesso em vendas', duracaoMin: 11, autor: 'Growth Machine' },
          { id: 'au_b3', titulo: '8 técnicas de vendas por telefone que são infalíveis', duracaoMin: 12, autor: 'Growth Machine' },
          { id: 'au_b4', titulo: 'Como conseguir qualquer coisa — as armas da influência', duracaoMin: 46, autor: 'Cialdini' }
        ]
      },
      {
        id: 'tr_mente', titulo: 'Mentalidade e Posicionamento do BDR', publicado: true,
        descricao: 'Como sustentar ritmo, lidar com não e se posicionar como consultor.',
        capa: 'mente', pontosAula: 10, pontosConclusao: 50, ordem: 2,
        aulas: [
          { id: 'au_m1', titulo: 'O jogo mental de quem prospecta todo dia', duracaoMin: 14, autor: 'Ascensão Comercial' },
          { id: 'au_m2', titulo: 'Rotina de alta performance comercial', duracaoMin: 21, autor: 'Ascensão Comercial' },
          { id: 'au_m3', titulo: 'Como não levar o "não" para o pessoal', duracaoMin: 9, autor: 'Ascensão Comercial' },
          { id: 'au_m4', titulo: 'Postura de consultor, não de tirador de pedido', duracaoMin: 16, autor: 'Ascensão Comercial' },
          { id: 'au_m5', titulo: 'Gestão de energia ao longo do mês', duracaoMin: 12, autor: 'Ascensão Comercial' }
        ]
      },
      {
        id: 'tr_intel', titulo: 'Inteligência comercial: pesquisa e pré-abordagem', publicado: true,
        descricao: 'Chegar preparado. Pesquisa do negócio, orçamento e objetivos de marketing.',
        capa: 'intel', pontosAula: 10, pontosConclusao: 50, ordem: 3,
        aulas: [
          { id: 'au_i1', titulo: 'Como qualificar antes de discar', duracaoMin: 23, autor: 'Ascensão Comercial' }
        ]
      },
      {
        id: 'tr_cold', titulo: 'Cold calling na prática', publicado: true,
        descricao: 'Script, abertura, quebra de padrão e condução até o agendamento.',
        capa: 'cold', pontosAula: 10, pontosConclusao: 50, ordem: 4,
        aulas: [
          { id: 'au_c1', titulo: 'Os 12 primeiros segundos da ligação', duracaoMin: 13, autor: 'Ascensão Comercial' },
          { id: 'au_c2', titulo: 'Quebra de padrão que segura o cliente na linha', duracaoMin: 10, autor: 'Ascensão Comercial' },
          { id: 'au_c3', titulo: 'Perguntas que revelam orçamento e prioridades', duracaoMin: 17, autor: 'Ascensão Comercial' },
          { id: 'au_c4', titulo: 'Conduzindo para o agendamento', duracaoMin: 15, autor: 'Ascensão Comercial' },
          { id: 'au_c5', titulo: 'Reunião comentada — diagnóstico de marketing', duracaoMin: 26, autor: 'Ascensão Comercial' },
          { id: 'au_c6', titulo: 'Erros que matam a ligação nos 30s finais', duracaoMin: 11, autor: 'Ascensão Comercial' }
        ]
      },
      {
        id: 'tr_obj', titulo: 'Objeções, follow up e persistência', publicado: true,
        descricao: 'As 9 objeções mais comuns na contratação de marketing e como respondê-las.',
        capa: 'obj', pontosAula: 10, pontosConclusao: 50, ordem: 5,
        aulas: [
          { id: 'au_o1', titulo: '"Vou pensar" — o que fazer de verdade', duracaoMin: 12, autor: 'Ascensão Comercial' },
          { id: 'au_o2', titulo: '"Já tenho outra agência" e a proposta de valor', duracaoMin: 19, autor: 'Ascensão Comercial' },
          { id: 'au_o3', titulo: 'Cadência de follow up que não queima o lead', duracaoMin: 14, autor: 'Ascensão Comercial' }
        ]
      }
    ];

    /* ---------- Progresso nas trilhas -------------------------------------- */
    var progresso = [];
    usuarios.forEach(function (u) {
      trilhas.forEach(function (t) {
        t.aulas.forEach(function (a) {
          var p = 0.12 + (u.forca - 0.7) * 0.42;
          if (u.id === 'us_marianne') p += 0.5;
          if (chance(Math.max(0.03, Math.min(0.9, p)))) {
            progresso.push({
              id: id('prg'), usuarioId: u.id, trilhaId: t.id, aulaId: a.id,
              concluidoEm: isoT(addD(TODAY, -ri(1, 120)), ri(8, 22))
            });
          }
        });
      });
    });

    var progressoAulas = progresso.map(function (p) {
      return {
        id: p.id, usuarioId: p.usuarioId, trilhaId: p.trilhaId, aulaId: p.aulaId,
        status: 'completed', progressoPct: 100,
        iniciadoEm: p.concluidoEm, concluidoEm: p.concluidoEm, atualizadoEm: p.concluidoEm
      };
    });
    usuarios.filter(function (u) { return u.cargoId !== 'cg_admin'; }).forEach(function (u) {
      var candidatas = [];
      trilhas.forEach(function (t) { t.aulas.forEach(function (a) { candidatas.push({ t: t, a: a }); }); });
      var emAndamento = candidatas.find(function (x) {
        return !progressoAulas.some(function (p) { return p.usuarioId === u.id && p.aulaId === x.a.id; });
      });
      if (emAndamento && chance(0.72)) {
        progressoAulas.push({
          id: id('prg'), usuarioId: u.id, trilhaId: emAndamento.t.id,
          aulaId: emAndamento.a.id, status: 'in_progress', progressoPct: 0,
          iniciadoEm: isoT(addD(TODAY, -ri(0, 12)), ri(8, 20)),
          concluidoEm: null, atualizadoEm: isoT(addD(TODAY, -ri(0, 5)), ri(8, 20))
        });
      }
    });

    /* ---------- Planos de estudo atribuídos -------------------------------- */
    var planosEstudo = [];
    var planoTrilhas = [];
    usuarios.filter(function (u) { return u.cargoId !== 'cg_admin'; }).forEach(function (u, ui) {
      var trackIds = u.cargoId === 'cg_bdr'
        ? ['tr_bdr', 'tr_cold', 'tr_obj']
        : u.cargoId === 'cg_closer'
          ? ['tr_intel', 'tr_obj', 'tr_mente']
          : ['tr_mente', 'tr_intel'];
      var inicio = addD(TODAY, -ri(5, 18));
      var prazo = addD(TODAY, u.id === 'us_diego' ? -3 : ri(18, 42));
      var plano = {
        id: 'pe_' + u.id.slice(3), usuarioId: u.id,
        titulo: 'Plano de desenvolvimento comercial',
        descricao: 'Sequência personalizada para consolidar técnica, ritmo e conversão.',
        inicio: isoOf(inicio), prazo: isoOf(prazo), status: 'active',
        criadoPor: 'us_gabriel', criadoEm: isoT(inicio, 9), atualizadoEm: isoT(inicio, 9)
      };
      planosEstudo.push(plano);
      trackIds.forEach(function (trackId, ti) {
        var prazoTrilha = addD(inicio, Math.round(((prazo - inicio) / 864e5) * ((ti + 1) / trackIds.length)));
        planoTrilhas.push({
          id: 'pet_' + ui + '_' + ti, planoId: plano.id, trilhaId: trackId,
          ordem: ti + 1, prazo: isoOf(prazoTrilha), atribuidoEm: plano.criadoEm
        });
      });
    });

    /* ---------- Arquivos --------------------------------------------------- */
    var categoriasArquivo = [
      { id: 'ca_play',  nome: 'Playbooks' },
      { id: 'ca_vaga',  nome: 'Descritivos de Vaga' },
      { id: 'ca_carr',  nome: 'Planos de Carreira' },
      { id: 'ca_prop',  nome: 'Propostas Comerciais' },
      { id: 'ca_scr',   nome: 'Scripts comerciais' },
      { id: 'ca_proc',  nome: 'Construção de Processos' },
      { id: 'ca_plan',  nome: 'Planejamento estratégico', restrito: true }
    ];
    var arquivos = [
      { categoriaId: 'ca_play', nome: 'Playbook Comercial Ascensão Comercial — v3.pdf', tipo: 'pdf', tamanho: 2411000 },
      { categoriaId: 'ca_play', nome: 'Régua de cadência — contratos de marketing.pdf', tipo: 'pdf', tamanho: 640000 },
      { categoriaId: 'ca_scr',  nome: 'Script cold call — Marketing mensal.docx', tipo: 'doc', tamanho: 88000 },
      { categoriaId: 'ca_scr',  nome: 'Script WhatsApp — primeira abordagem.docx', tipo: 'doc', tamanho: 54000 },
      { categoriaId: 'ca_scr',  nome: 'Matriz de objeções — 9 mais comuns.xlsx', tipo: 'xls', tamanho: 132000 },
      { categoriaId: 'ca_prop', nome: 'Modelo de proposta — Projetos digitais.pdf', tipo: 'pdf', tamanho: 410000 },
      { categoriaId: 'ca_carr', nome: 'Plano de carreira comercial 2026.pdf', tipo: 'pdf', tamanho: 780000 },
      { categoriaId: 'ca_vaga', nome: 'Descritivo — BDR de agência.pdf', tipo: 'pdf', tamanho: 190000 },
      { categoriaId: 'ca_proc', nome: 'Fluxo de formalização do projeto passo a passo.pdf', tipo: 'pdf', tamanho: 350000 },
      { categoriaId: 'ca_plan', nome: 'Planejamento comercial — S2 2026.pptx', tipo: 'ppt', tamanho: 5200000 }
    ].map(function (f) {
      f.id = id('arq');
      f.criadoEm = isoT(addD(TODAY, -ri(5, 200)), ri(9, 18));
      f.autorId = pick(['us_gabriel', 'us_marianne']);
      f.downloads = ri(0, 84);
      return f;
    });

    /* ---------- Financeiro -------------------------------------------------- */
    var planoContas = [
      { id: 'pc_com_inss',  nome: 'Contratos mensais de marketing',   tipo: 'receita', grupo: 'Receita operacional' },
      { id: 'pc_com_serv',  nome: 'Criação e produção de conteúdo',  tipo: 'receita', grupo: 'Receita operacional' },
      { id: 'pc_com_fgts',  nome: 'Gestão de tráfego pago',     tipo: 'receita', grupo: 'Receita operacional' },
      { id: 'pc_com_port',  nome: 'Sites e projetos digitais',     tipo: 'receita', grupo: 'Receita operacional' },
      { id: 'pc_outras',    nome: 'Outras receitas',              tipo: 'receita', grupo: 'Receita não operacional' },
      { id: 'pc_imposto',   nome: 'Impostos sobre receita',       tipo: 'despesa', grupo: 'Deduções' },
      { id: 'pc_estorno',   nome: 'Estornos e cancelamentos',     tipo: 'despesa', grupo: 'Deduções' },
      { id: 'pc_comissao',  nome: 'Comissionamento do time',      tipo: 'despesa', grupo: 'Custo variável' },
      { id: 'pc_mkt',       nome: 'Marketing e tráfego pago',     tipo: 'despesa', grupo: 'Custo variável' },
      { id: 'pc_lead',      nome: 'Compra de mailing / leads',    tipo: 'despesa', grupo: 'Custo variável' },
      { id: 'pc_folha',     nome: 'Folha e encargos',             tipo: 'despesa', grupo: 'Custo fixo' },
      { id: 'pc_alug',      nome: 'Aluguel e condomínio',         tipo: 'despesa', grupo: 'Custo fixo' },
      { id: 'pc_tel',       nome: 'Telefonia e discador',         tipo: 'despesa', grupo: 'Custo fixo' },
      { id: 'pc_soft',      nome: 'Software e sistemas',          tipo: 'despesa', grupo: 'Custo fixo' },
      { id: 'pc_admin',     nome: 'Administrativo e contabilidade', tipo: 'despesa', grupo: 'Custo fixo' }
    ];

    var CENTROS = [
      { id: 'cc_com', nome: 'Comercial' },
      { id: 'cc_mkt', nome: 'Marketing' },
      { id: 'cc_adm', nome: 'Administrativo' }
    ];

    var lancamentos = [];
    /* Receita: espelha as vendas ganhas, com liberação ~7 dias após o fechamento */
    oportunidades.filter(function (o) { return o.status === 'ganho'; }).forEach(function (o) {
      var pago = bizDay(addD(new Date(o.fechadoEm), ri(4, 12)));
      var conta = { prod_inss: 'pc_com_inss', prod_serv: 'pc_com_serv', prod_mil: 'pc_com_serv',
        prod_fgts: 'pc_com_fgts', prod_cartao: 'pc_com_fgts', prod_port: 'pc_com_port',
        prod_refin: 'pc_com_port', prod_clt: 'pc_com_inss' }[o.produtoId];
      lancamentos.push({
        id: id('lcto'), tipo: 'receita', contaId: conta, centroId: 'cc_com',
        descricao: 'Receita de serviços — ' + o.titulo,
        valor: o.comissao,
        data: isoOf(pago),
        competencia: isoOf(new Date(o.fechadoEm)).slice(0, 7),
        status: pago <= TODAY ? 'realizado' : 'previsto',
        oportunidadeId: o.id, usuarioId: o.ownerId
      });
      /* Comissionamento do vendedor: ~28% da receita */
      lancamentos.push({
        id: id('lcto'), tipo: 'despesa', contaId: 'pc_comissao', centroId: 'cc_com',
        descricao: 'Comissão comercial — ' + o.titulo,
        valor: Math.round(o.comissao * rf(0.24, 0.32)),
        data: isoOf(bizDay(addD(pago, 3))),
        competencia: isoOf(new Date(o.fechadoEm)).slice(0, 7),
        status: pago <= TODAY ? 'realizado' : 'previsto',
        oportunidadeId: o.id, usuarioId: o.ownerId
      });
      /* Impostos ~9,5% */
      lancamentos.push({
        id: id('lcto'), tipo: 'despesa', contaId: 'pc_imposto', centroId: 'cc_adm',
        descricao: 'Impostos sobre serviços',
        valor: Math.round(o.comissao * 0.095),
        data: isoOf(bizDay(addD(pago, 5))),
        competencia: isoOf(new Date(o.fechadoEm)).slice(0, 7),
        status: pago <= TODAY ? 'realizado' : 'previsto',
        oportunidadeId: o.id, usuarioId: null
      });
    });

    /* Estornos: ~2,5% das vendas voltam */
    oportunidades.filter(function (o) { return o.status === 'ganho' && chance(0.025); }).forEach(function (o) {
      var d = bizDay(addD(new Date(o.fechadoEm), ri(20, 60)));
      if (d > addD(TODAY, 30)) return;
      lancamentos.push({
        id: id('lcto'), tipo: 'despesa', contaId: 'pc_estorno', centroId: 'cc_com',
        descricao: 'Estorno — ' + o.titulo, valor: o.comissao,
        data: isoOf(d), competencia: isoOf(d).slice(0, 7),
        status: d <= TODAY ? 'realizado' : 'previsto', oportunidadeId: o.id, usuarioId: o.ownerId
      });
    });

    /* Custos fixos e variáveis mensais.
       Calibrado para a receita que esta base gera (~R$ 70 mil de comissão/mês)
       numa equipe de 8 pessoas onde o closer é remunerado por comissão — por
       isso a folha fixa é baixa: ela cobre gestor, mesa e a base dos BDRs.
       O resultado fica em torno de 12–18% de margem líquida, com variação. */
    var FIXOS = [
      { contaId: 'pc_folha', centroId: 'cc_adm', desc: 'Folha e encargos',            base: 12500, var: 0.06 },
      { contaId: 'pc_alug',  centroId: 'cc_adm', desc: 'Aluguel e condomínio',        base: 3200,  var: 0.01 },
      { contaId: 'pc_tel',   centroId: 'cc_com', desc: 'Telefonia e discador',        base: 2300,  var: 0.18 },
      { contaId: 'pc_soft',  centroId: 'cc_adm', desc: 'Software e sistemas',         base: 1600,  var: 0.03 },
      { contaId: 'pc_admin', centroId: 'cc_adm', desc: 'Administrativo e contabilidade', base: 1900, var: 0.06 },
      { contaId: 'pc_mkt',   centroId: 'cc_mkt', desc: 'Tráfego pago — Meta e Google', base: 7500,  var: 0.26 },
      { contaId: 'pc_lead',  centroId: 'cc_mkt', desc: 'Compra de mailing',           base: 2200,  var: 0.30 }
    ];
    /* Mesma janela do histórico de vendas (5 meses) + o mês seguinte, para o
       fluxo de caixa ter o que projetar. Gerar custo em mês sem receita
       criaria meses de prejuízo puro no começo da série. */
    for (var mBack = 4; mBack >= -1; mBack--) {
      var mRef = new Date(TODAY.getFullYear(), TODAY.getMonth() - mBack, 1);
      var comp = isoOf(mRef).slice(0, 7);
      FIXOS.forEach(function (f) {
        var dia = new Date(mRef.getFullYear(), mRef.getMonth(), ri(3, 12));
        lancamentos.push({
          id: id('lcto'), tipo: 'despesa', contaId: f.contaId, centroId: f.centroId,
          descricao: f.desc, valor: Math.round(f.base * (1 + rf(-f.var, f.var))),
          data: isoOf(dia), competencia: comp,
          status: dia <= TODAY ? 'realizado' : 'previsto', usuarioId: null
        });
      });
    }
    lancamentos.sort(function (a, b) { return a.data < b.data ? 1 : -1; });

    /* Orçamento por conta (usado no comparativo Orçado x Realizado) */
    var orcamento = [];
    for (var ob = 4; ob >= -1; ob--) {
      var oRef = new Date(TODAY.getFullYear(), TODAY.getMonth() - ob, 1);
      var ocomp = isoOf(oRef).slice(0, 7);
      planoContas.forEach(function (c) {
        /* Orçamento coerente com a estrutura real de custo acima — sem isso o
           comparativo Orçado × Realizado mostraria desvios absurdos. */
        var alvo = {
          pc_com_inss: 29000, pc_com_serv: 25000, pc_com_fgts: 4500, pc_com_port: 12500,
          pc_outras: 500, pc_imposto: 7000, pc_estorno: 3000, pc_comissao: 20000,
          pc_mkt: 7500, pc_lead: 2200, pc_folha: 12500, pc_alug: 3200,
          pc_tel: 2300, pc_soft: 1600, pc_admin: 1900
        }[c.id] || 0;
        orcamento.push({ id: id('orc'), contaId: c.id, competencia: ocomp, valor: alvo });
      });
    }

    /* ---------- Humor diário ------------------------------------------------- */
    /* O humor é gerado com correlação real (mas imperfeita) com o resultado do
       dia e dos dias anteriores. Sem correlação, a tela de clima não teria o
       que cruzar; com correlação perfeita, seria irreal. */
    var humor = [];
    (function () {
      /* Índices de resultado diário. Cada função tem um "bom dia" diferente:
         closer fecha contrato, BDR marca reunião. Usar venda para todo mundo
         penalizaria o BDR todo santo dia. */
      var vendaDia = Object.create(null);
      oportunidades.forEach(function (o) {
        if (o.status !== 'ganho' || !o.fechadoEm) return;
        var k = o.ownerId + '|' + isoOf(new Date(o.fechadoEm));
        vendaDia[k] = (vendaDia[k] || 0) + o.valor;
      });
      var agendaDia = Object.create(null);
      atividades.forEach(function (a) {
        if (a.resultado !== 'agendou') return;
        var k = a.ownerId + '|' + isoOf(new Date(a.data));
        agendaDia[k] = (agendaDia[k] || 0) + 1;
      });

      var alvo = usuarios.filter(function (u) { return u.cargoId !== 'cg_admin'; });

      alvo.forEach(function (u) {
        var fechaContrato = ['cg_closer', 'cg_gestor'].indexOf(u.cargoId) >= 0;

        /* Traços por pessoa: linha de base, oscilação e adesão ao check-in. */
        var base = 3.3 + (u.forca - 1) * 1.2;               // performer melhor tende a estar melhor
        var volatilidade = rf(0.5, 1.0);
        var adesao = rf(0.62, 0.93);
        if (u.id === 'us_diego') { base -= 0.7; adesao = 0.58; }    // caso de atenção
        if (u.id === 'us_marianne') { base += 0.25; adesao = 0.95; }

        var arrasto = 0;        // humor do dia anterior puxa o de hoje
        var maRun = 0;          // sequência ruim ocasional
        var d = new Date(START);

        while (d <= TODAY) {
          if (isWknd(d)) { d = addD(d, 1); continue; }

          /* fase ruim esporádica: 3 a 6 dias seguidos abaixo da média */
          if (maRun > 0) maRun--;
          else if (chance(0.035)) maRun = ri(3, 6);

          /* "Bom dia" depende da função: contrato para closer, reunião marcada
             para BDR. Quem não tem meta de saída nenhuma oscila só por ruído. */
          var bump;
          if (fechaContrato) {
            var vendeu = vendaDia[u.id + '|' + isoOf(d)] || 0;
            bump = vendeu > 0 ? Math.min(1.1, 0.45 + vendeu / 120000) : -0.22;
          } else if (u.cargoId === 'cg_bdr') {
            var marcou = agendaDia[u.id + '|' + isoOf(d)] || 0;
            bump = marcou >= 2 ? 0.75 : marcou === 1 ? 0.3 : -0.3;
          } else {
            bump = rf(-0.15, 0.15);
          }

          var valor = base + bump + arrasto * 0.35
            - (maRun > 0 ? rf(0.8, 1.5) : 0)
            + rf(-volatilidade, volatilidade);

          var nota = Math.max(1, Math.min(5, Math.round(valor)));
          arrasto = (nota - 3) * 0.5;

          if (chance(adesao)) {
            var pool = FATORES_HUMOR.filter(function (fx) {
              return nota >= 4 ? fx.tom === 'bom' : nota <= 2 ? fx.tom === 'ruim'
                : chance(0.5) ? fx.tom === 'bom' : fx.tom === 'ruim';
            });
            var fatores = [];
            var qtd = nota === 3 ? ri(0, 1) : ri(1, 2);
            for (var fi = 0; fi < qtd && pool.length; fi++) {
              var esc = pick(pool);
              if (fatores.indexOf(esc.id) < 0) fatores.push(esc.id);
            }

            humor.push({
              id: id('hum'),
              usuarioId: u.id,
              data: isoOf(d),
              nota: nota,
              fatores: fatores,
              comentario: (nota <= 2 && chance(0.3)) ? pick([
                'Os leads de hoje precisam de maior qualificação de orçamento.',
                'Difícil engatar, muita ligação caindo na caixa postal.',
                'Precisava de um alinhamento sobre a tabela nova.',
                'Dia pesado, muita objeção de taxa.'
              ]) : (nota === 5 && chance(0.22)) ? pick([
                'Dia redondo, fechei dois contratos antes do almoço.',
                'A abordagem nova está funcionando muito bem.',
                'Cliente indicou mais dois familiares.'
              ]) : '',
              criadoEm: isoT(d, ri(8, 10), ri(0, 59))
            });
          }
          d = addD(d, 1);
        }
      });
    })();

    /* ---------- Empresas (convênios, parceiros e correspondentes) ------------- */
    var empresas = [
      { nome: 'Cliente de marketing — exemplo', tipo: 'Cliente', cnpj: '',
        contato: 'Atendimento comercial', responsavelId: 'us_gabriel', uf: 'DF', cidade: 'Brasília' },
      { nome: 'Clínica Horizonte — exemplo', tipo: 'Cliente', cnpj: '',
        contato: 'Equipe de marketing', responsavelId: 'us_marianne', uf: 'SP', cidade: 'São Paulo' },
      { nome: 'Loja Aurora — exemplo', tipo: 'Cliente', cnpj: '',
        contato: 'Equipe comercial', responsavelId: 'us_camila', uf: 'MG', cidade: 'Belo Horizonte' },
      { nome: 'Estúdio Origem — exemplo', tipo: 'Cliente', cnpj: '',
        contato: 'Equipe de projetos', responsavelId: 'us_lucas', uf: 'DF', cidade: 'Brasília' },
      { nome: 'E-commerce Essência — exemplo', tipo: 'Parceiro', cnpj: '',
        contato: 'Marcos Ribeiro', responsavelId: 'us_marianne', uf: 'SP', cidade: 'Campinas' },
      { nome: 'Contabilidade Progredir ME', tipo: 'Parceiro', cnpj: '',
        contato: 'Cláudia Estevam', responsavelId: 'us_camila', uf: 'SP', cidade: 'Santo André' },
      { nome: 'Restaurante Jardim — exemplo', tipo: 'Parceiro', cnpj: '',
        contato: 'Raimundo Nonato', responsavelId: 'us_lucas', uf: 'CE', cidade: 'Fortaleza' },
      { nome: 'Produtora Boa Ideia — exemplo', tipo: 'Parceiro', cnpj: '',
        contato: 'Wagner Pires', responsavelId: 'us_gabriel', uf: 'RJ', cidade: 'Niterói' }
    ].map(function (e) {
      e.id = id('emp');
      e.telefone = telNum();
      e.criadoEm = isoT(addD(TODAY, -ri(60, 700)), ri(9, 18));
      e.ativo = chance(0.88);
      e.obs = '';
      return e;
    });

    /* Vincula parte das oportunidades a uma empresa (origem parceiro/convênio) */
    oportunidades.forEach(function (o) {
      if (o.origemId === 'org_parc' || chance(0.18)) {
        o.empresaId = pick(empresas).id;
      } else {
        o.empresaId = null;
      }
    });

    /* ---------- Automações --------------------------------------------------- */
    var automacoes = [
      { id: 'au_1', nome: 'Lead novo sem contato em 24h', ativa: true,
        gatilho: 'Oportunidade parada em "Lead Novo" por 1 dia',
        acao: 'Notificar o dono e marcar tarefa de ligação para hoje',
        execucoes: ri(120, 380), ultimaEm: isoT(addD(TODAY, -ri(0, 2)), ri(8, 19)) },
      { id: 'au_2', nome: 'Proposta sem resposta em 3 dias', ativa: true,
        gatilho: 'Oportunidade em "Proposta enviada" há 3 dias sem atividade',
        acao: 'Criar follow-up de WhatsApp e alertar o gestor',
        execucoes: ri(60, 210), ultimaEm: isoT(addD(TODAY, -ri(0, 3)), ri(8, 19)) },
      { id: 'au_3', nome: 'Boas-vindas ao lead de Meta Ads', ativa: true,
        gatilho: 'Oportunidade criada com origem "Meta Ads"',
        acao: 'Enviar mensagem de boas-vindas e distribuir por rodízio',
        execucoes: ri(200, 600), ultimaEm: isoT(TODAY, ri(8, 14)) },
      { id: 'au_4', nome: 'Venda ganha → financeiro', ativa: true,
        gatilho: 'Oportunidade movida para "Fechado Ganho"',
        acao: 'Registrar receita prevista do contrato e avisar a equipe',
        execucoes: ri(80, 260), ultimaEm: isoT(addD(TODAY, -ri(0, 1)), ri(8, 19)) },
      { id: 'au_5', nome: 'Reunião agendada → lembrete D-1', ativa: true,
        gatilho: 'Reunião marcada para o dia seguinte',
        acao: 'Enviar lembrete para o cliente e para o vendedor',
        execucoes: ri(90, 240), ultimaEm: isoT(addD(TODAY, -ri(0, 1)), ri(15, 19)) },
      { id: 'au_6', nome: 'Reativação por novo orçamento', ativa: false,
        gatilho: 'Oportunidade perdida por "Sem orçamento" há 90 dias',
        acao: 'Devolver para "Lead Novo" com tag Reativação',
        execucoes: ri(10, 60), ultimaEm: isoT(addD(TODAY, -ri(10, 40)), ri(8, 19)) }
    ];

    /* ---------- Templates de e-mail ------------------------------------------ */
    var emails = [
      { id: 'em_1', nome: 'Primeiro contato — diagnóstico de marketing', assunto: 'Vamos planejar o marketing da sua empresa',
        etapaId: 'et_novo', enviados: ri(180, 520), aberturaPct: rf(38, 62), respostaPct: rf(6, 17), ativa: true },
      { id: 'em_2', nome: 'Envio de proposta', assunto: 'Proposta {{cliente}} — condições aprovadas',
        etapaId: 'et_prop', enviados: ri(90, 260), aberturaPct: rf(55, 78), respostaPct: rf(18, 34), ativa: true },
      { id: 'em_3', nome: 'Follow-up 48h', assunto: 'Conseguiu revisar a proposta?',
        etapaId: 'et_prop', enviados: ri(70, 210), aberturaPct: rf(40, 60), respostaPct: rf(10, 22), ativa: true },
      { id: 'em_4', nome: 'Reativação de base', assunto: 'Novas oportunidades para o marketing da sua empresa',
        etapaId: 'et_novo', enviados: ri(300, 900), aberturaPct: rf(22, 41), respostaPct: rf(3, 9), ativa: false },
      { id: 'em_5', nome: 'Pós-venda e indicação', assunto: 'Projeto iniciado — e um pedido rápido',
        etapaId: 'et_ganho', enviados: ri(60, 180), aberturaPct: rf(62, 84), respostaPct: rf(24, 44), ativa: true }
    ];

    /* ---------- Base final ---------------------------------------------------- */
    return {
      meta: { version: 1, seededAt: new Date().toISOString(), ancora: isoOf(TODAY) },
      session: { userId: 'us_gabriel', autenticado: false },
      settings: {
        theme: 'dark', density: 'normal', sidebarCollapsed: false,
        modulo: null, moedaOculta: false, primeiroAcesso: true,
        /* Check-in de humor: ativo, obrigatório só para quem não é admin.
           "Pular" grava a data para não insistir no mesmo dia. */
        humorAtivo: true, humorAdiado: {}
      },
      empresa: {
        nome: 'Ascensão Comercial', razao: '',
        cnpj: '', site: '',
        telefone: '', cidade: '', uf: '',
        segmento: 'Agência de marketing e comunicação',
        fundacao: ''
      },
      cargos: cargos,
      equipes: equipes,
      usuarios: usuarios,
      pipelines: [{ id: 'pl_comercial', nome: 'Comercial', padrao: true, etapas: ETAPAS }],
      produtos: PRODUTOS,
      convenios: CONVENIOS,
      bancos: BANCOS,
      origens: ORIGENS,
      motivosPerda: MOTIVOS_PERDA,
      escalaHumor: ESCALA_HUMOR,
      fatoresHumor: FATORES_HUMOR,
      humor: humor,
      empresas: empresas,
      etiquetas: [],
      mensagensLead: [],
      comprovantesPagamento: [],
      notificacoes: oportunidades.length ? [
        {
          id: 'notif_demo_mention', destinatarioId: 'us_gabriel', atorId: 'us_marianne',
          oportunidadeId: oportunidades[0].id, tipo: 'mention',
          titulo: 'Marianne mencionou você',
          texto: 'Pode me ajudar a revisar a próxima ação deste lead?',
          metadados: {}, lidaEm: null, criadoEm: new Date(Date.now() - 12 * 60000).toISOString()
        },
        {
          id: 'notif_demo_change', destinatarioId: 'us_gabriel', atorId: 'us_lucas',
          oportunidadeId: oportunidades[Math.min(1, oportunidades.length - 1)].id, tipo: 'lead_updated',
          titulo: 'Etapa do lead alterada',
          texto: oportunidades[Math.min(1, oportunidades.length - 1)].cliente,
          metadados: { event_type: 'stage_changed' },
          lidaEm: new Date(Date.now() - 3600000).toISOString(),
          criadoEm: new Date(Date.now() - 3600000).toISOString()
        }
      ] : [],
      historicoEtapas: [],
      historicoAlteracoes: [],
      oportunidades: oportunidades,
      atividades: atividades,
      metas: metas,
      trilhas: trilhas,
      progresso: progresso,
      progressoAulas: progressoAulas,
      planosEstudo: planosEstudo,
      planoTrilhas: planoTrilhas,
      categoriasArquivo: categoriasArquivo,
      arquivos: arquivos,
      automacoes: automacoes,
      emails: emails,
      financeiro: {
        planoContas: planoContas,
        centrosCusto: CENTROS,
        lancamentos: lancamentos,
        orcamento: orcamento
      },
      gamificacao: {
        pontosAula: 10, pontosConclusaoTrilha: 50, pontosLigacao: 1,
        pontosAgendamento: 15, pontosProposta: 25, pontosVenda: 100
      }
    };
  }

  AGIR.seed = { build: build, ETAPAS: ETAPAS, PRODUTOS: PRODUTOS, BANCOS: BANCOS };
})(window);
