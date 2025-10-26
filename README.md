# SodCapital - ERP Financeiro

Sistema de gestão financeira profissional desenvolvido em **Next.js 14** + **Supabase** com interface em **português brasileiro (pt-BR)**.

## 🚀 Tecnologias

- **Next.js 14** (App Router) + TypeScript
- **Supabase** (PostgreSQL + Row Level Security)
- **Tailwind CSS** + shadcn/ui
- **React Hook Form** + Zod (validações)
- **Recharts** (gráficos)
- **Lucide React** (ícones)

## 🎨 Branding

- **Primary**: `#1555D6` (Azul SodCapital)
- **Primary-900**: `#0B2A6B` (Azul Escuro)
- **Gray**: `#6E7485` (Cinza Neutro)

## 📁 Estrutura do Projeto

```
/app
├── app/                    # Rotas Next.js (App Router)
│   ├── page.tsx           # Dashboard Executivo
│   ├── login/             # Autenticação
│   ├── reset/             # Reset de senha
│   ├── cadastros/         # Módulos de cadastro
│   │   ├── empresas/
│   │   ├── projetos/
│   │   ├── bancos-contas/
│   │   └── contrapartes/
│   ├── plano-contas/      # Hierarquia contábil
│   ├── modelos/           # Modelos de lançamentos
│   ├── financeiro/        # Lançamentos + Conciliação
│   ├── relatorios/        # DRE, Fluxo, PL
│   └── contratos/         # Mútuos + CRI
├── components/
│   ├── layout/            # Layout principal (Sidebar, TopBar)
│   └── ui/                # Componentes shadcn/ui
├── lib/
│   ├── supabaseClient.ts  # Client Anon (browser)
│   ├── supabaseServer.ts  # Service Role (server)
│   └── utils.ts           # Utilitários pt-BR
└── .env.local             # Variáveis de ambiente

## ⚙️ Configuração

### 1. Instalar Dependências

```bash
yarn install
```

### 2. Configurar Variáveis de Ambiente

Crie o arquivo `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
```

### 3. Executar em Desenvolvimento

```bash
yarn dev
```

Acesse: **http://localhost:3000**

## 🏗️ Módulos Implementados

### ✅ Completos

- **Autenticação** (Login/Logout/Reset com Supabase Auth)
- **Dashboard Executivo** com KPIs e gráficos:
  - PL Aproximado
  - Caixa Consolidado
  - Receitas/Despesas YTD
  - Dias de Caixa
  - Curva de Liquidez (180 dias)
  - DRE YTD (Top 10 Categorias)
  - Fluxo Previsto (30/60/90/180 dias)
- **CRUD de Empresas** (Nome, CNPJ, Razão Social, Status)
- **CRUD de Projetos** (vinculados a Empresas)
- **CRUD de Contas Bancárias** (Banco, Agência, Conta, Saldo Inicial)
- **CRUD de Contrapartes** (Clientes/Fornecedores)

### 🚧 Em Desenvolvimento

- Plano de Contas (Tipos/Grupos/Categorias/Subcategorias)
- Modelos de Lançamentos
- Lançamentos Financeiros (AP/AR) com Retenções
- Conciliação Bancária
- Relatórios Avançados (DRE Detalhado, Fluxo Interativo, Painel de PL)
- Contratos (Mútuos e CRI com Parcelas)
- Sistema de Aprovação (Regras/Fluxos/Etapas)

## 🗄️ Schema Supabase

O backend utiliza o schema `sodcapital` com:

**Tabelas Principais:**
- `orgs` - Organizações
- `empresas` - Empresas do grupo
- `projetos` - Projetos das empresas
- `bancos_contas` - Contas bancárias
- `contrapartes` - Clientes e fornecedores
- `pc_tipos`, `pc_grupos`, `pc_categorias`, `pc_subcategorias` - Plano de contas hierárquico
- `modelos_lancamentos`, `modelos_componentes` - Templates
- `lancamentos`, `lancamento_retencoes` - Lançamentos financeiros
- `extratos_bancarios`, `conciliacoes` - Conciliação bancária
- `saldos_diarios` - Saldos consolidados
- `mutuos`, `mutuos_parcelas` - Contratos de mútuo
- `cri_emissoes`, `cri_eventos`, `cri_parcelas` - Certificados de Recebíveis

**Views Analíticas:**
- `vw_pl_painel` - KPIs do painel de PL
- `vw_dre_ytd` - DRE Year-to-Date
- `vw_fluxo_previsto` - Projeção de fluxo de caixa
- `vw_pc_hierarquia` - Hierarquia do plano de contas

**Funções:**
- `sodcapital.user_org_ids()` - IDs das orgs do usuário (RLS)

## 🔒 Segurança

- **RLS (Row Level Security)** habilitado em todas as tabelas
- **Anon Key** apenas no client (browser)
- **Service Role Key** exclusiva em server actions/API routes
- Validações com **Zod** em todos os formulários
- Mensagens de erro em **pt-BR**

## 🌐 Formatação pt-BR

- Datas: **DD/MM/AAAA**
- Moeda: **R$ 1.234,56**
- Separador de milhar: `.` (ponto)
- Separador decimal: `,` (vírgula)

## 📊 Gráficos e Visualizações

Utiliza **Recharts** para:
- Gráficos de linha (Curva de Liquidez)
- Gráficos de barra (DRE YTD)
- Gráficos de pizza (Composição do PL) - em desenvolvimento
- Tree maps (Caixa por Empresa/Projeto) - em desenvolvimento

## 🎯 Próximos Passos

1. Implementar Plano de Contas completo (hierarquia de 4 níveis)
2. Desenvolver módulo de Lançamentos Financeiros
3. Criar sistema de Conciliação Bancária
4. Implementar Relatórios Avançados
5. Desenvolver módulo de Contratos (Mútuos + CRI)
6. Implementar Governança (Aprovações por faixa de valor)

## 📝 Scripts Disponíveis

```bash
yarn dev          # Desenvolvimento (hot reload)
yarn build        # Build para produção
yarn start        # Servidor de produção
yarn lint         # Linter
```

## 👥 Suporte

Para dúvidas ou suporte, entre em contato com a equipe de desenvolvimento.

---

© 2025 SodCapital. Todos os direitos reservados.
