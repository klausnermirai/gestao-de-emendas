
export interface Grant {
  id: string;
  name: string;
  color: string;
  totalValue: number;
  periodMonths: number;
  allocations: { categoryId: string, amount: number }[];
  startMonth: number; // 0 for April, etc.
  type: 'Emenda parlamentar' | 'Subvenção municipal' | 'Emenda Impositiva (vereadores)';
  nature: 'Custeio' | 'Investimento';
  accountability: 'Direta com o município' | 'Via São Paulo Sem Papel';
  status: 'Oficiada' | 'Em Elaboração' | 'Paga';
}

export interface Category {
  id: string;
  name: string;
  monthlyAverage: number;
}

export const CATEGORIES: Category[] = [
  { id: 'agua', name: 'ÁGUA E ESGOTO', monthlyAverage: 2498.43 },
  { id: 'combustivel', name: 'COMBUSTÍVEL', monthlyAverage: 600.90 },
  { id: 'gas', name: 'GÁS DE COZINHA', monthlyAverage: 2674.17 },
  { id: 'alimentos', name: 'GÊNEROS ALIMENTÍCIOS', monthlyAverage: 11808.26 },
  { id: 'escritorio', name: 'MATERIAL DE ESCRITÓRIO', monthlyAverage: 725.63 },
  { id: 'salarios', name: 'SALÁRIOS', monthlyAverage: 85283.77 },
  { id: 'uniformes', name: 'UNIFORMES', monthlyAverage: 0 },
  { id: 'juridica', name: 'ACESSORIA JURÍDICA', monthlyAverage: 1621.00 },
  { id: 'energia', name: 'ENERGIA ELÉTRICA', monthlyAverage: 6111.62 },
  { id: 'carne', name: 'GÊNEROS ALIMENTÍCIOS (CARNE)', monthlyAverage: 11808.26 },
  { id: 'copa', name: 'MATERIAL DE COPA E COZINHA', monthlyAverage: 1282.65 },
  { id: 'limpeza', name: 'MATERIAL DE LIMPEZA', monthlyAverage: 813.89 },
  { id: 'higiene', name: 'PRODUTOS DE HIGIÊNE PESSOAL', monthlyAverage: 3921.39 },
  { id: 'contabeis', name: 'SERVIÇOS CONTÁBEIS', monthlyAverage: 2149.00 },
  { id: 'fotovoltaico', name: 'SISTEMA FOTOVOLTAICO', monthlyAverage: 0 },
];

export const GRANTS: Grant[] = [
  {
    id: 'fed_108488',
    name: 'SUB. FEDERAL (108488-7)',
    color: '#ef4444', 
    totalValue: 18000.00,
    periodMonths: 9,
    startMonth: 0,
    allocations: [
      { categoryId: 'combustivel', amount: 3000 },
      { categoryId: 'escritorio', amount: 3000 },
      { categoryId: 'uniformes', amount: 12000 }
    ],
    type: 'Emenda parlamentar',
    nature: 'Custeio',
    accountability: 'Direta com o município',
    status: 'Paga'
  },
  {
    id: 'est_108237',
    name: 'SUB. ESTADUAL (108237-X)',
    color: '#3b82f6', 
    totalValue: 76540.10,
    periodMonths: 9,
    startMonth: 0,
    allocations: [
      { categoryId: 'agua', amount: 29280 },
      { categoryId: 'gas', amount: 43200 },
      { categoryId: 'alimentos', amount: 4060.10 }
    ],
    type: 'Emenda parlamentar',
    nature: 'Custeio',
    accountability: 'Direta com o município',
    status: 'Paga'
  },
  {
    id: 'fed_108238',
    name: 'SUB. FEDERAL (108238-8)',
    color: '#10b981', 
    totalValue: 17520.00,
    periodMonths: 9,
    startMonth: 0,
    allocations: [
      { categoryId: 'salarios', amount: 17520 }
    ],
    type: 'Emenda parlamentar',
    nature: 'Custeio',
    accountability: 'Direta com o município',
    status: 'Paga'
  },
  {
    id: 'mun_108236',
    name: 'SUB. MUNICIPAL (108236-1)',
    color: '#f59e0b', 
    totalValue: 181755.00,
    periodMonths: 9,
    startMonth: 0,
    allocations: [
      { categoryId: 'salarios', amount: 181755 }
    ],
    type: 'Emenda parlamentar',
    nature: 'Custeio',
    accountability: 'Direta com o município',
    status: 'Paga'
  },
  {
    id: 'imp_34018',
    name: 'EMENDA IMPOSITIVA (34018-9)',
    color: '#8b5cf6', 
    totalValue: 362500.00,
    periodMonths: 9,
    startMonth: 0,
    allocations: [
      { categoryId: 'salarios', amount: 362500 }
    ],
    type: 'Emenda Impositiva (vereadores)',
    nature: 'Custeio',
    accountability: 'Direta com o município',
    status: 'Paga'
  },
  {
    id: 'lombar_39324',
    name: 'EMENDA MIGUEL LOMBARDI (39324-X)',
    color: '#f43f5e', 
    totalValue: 50000.00,
    periodMonths: 12,
    startMonth: 0,
    allocations: [
      { categoryId: 'juridica', amount: 20000 },
      { categoryId: 'contabeis', amount: 30000 }
    ],
    type: 'Emenda parlamentar',
    nature: 'Custeio',
    accountability: 'Via São Paulo Sem Papel',
    status: 'Paga'
  },
  {
    id: 'rogerio_42183',
    name: 'SPSP - ROGÉRIO SANTOS (42183-9)',
    color: '#06b6d4', 
    totalValue: 105000.00,
    periodMonths: 12,
    startMonth: 0,
    allocations: [
      { categoryId: 'energia', amount: 19175.91 },
      { categoryId: 'carne', amount: 11394.80 },
      { categoryId: 'copa', amount: 4412.90 },
      { categoryId: 'limpeza', amount: 62933.34 },
      { categoryId: 'higiene', amount: 7083.05 }
    ],
    type: 'Emenda parlamentar',
    nature: 'Custeio',
    accountability: 'Via São Paulo Sem Papel',
    status: 'Paga'
  },
  {
    id: 'rafael_42897',
    name: 'SPSP - RAFAEL SILVA (42897-3)',
    color: '#6366f1', 
    totalValue: 100000.00,
    periodMonths: 12,
    startMonth: 0,
    allocations: [
      { categoryId: 'salarios', amount: 100000 }
    ],
    type: 'Emenda parlamentar',
    nature: 'Custeio',
    accountability: 'Direta com o município',
    status: 'Paga'
  },
  {
    id: 'coimbra_36444',
    name: 'SPSP - T. COIMBRA (36444-4)',
    color: '#84cc16', 
    totalValue: 100000.00,
    periodMonths: 12,
    startMonth: 0,
    allocations: [
      { categoryId: 'fotovoltaico', amount: 100000 }
    ],
    type: 'Emenda parlamentar',
    nature: 'Investimento',
    accountability: 'Direta com o município',
    status: 'Paga'
  }
];

export const MONTHS = [
  'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO', 'JANEIRO', 'FEVEREIRO', 'MARÇO'
];
