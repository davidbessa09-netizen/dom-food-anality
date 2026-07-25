import type { OpportunityCategory, OpportunityOrigin, OpportunityPriority } from "@/lib/intelligence/opportunity-rules";
import type { OpportunityStatus } from "@/app/(dashboard)/recomendacoes/actions";

export interface OpportunityRow {
  id: string;
  brandId: string | null;
  brandName: string;
  category: OpportunityCategory;
  subcategory: string;
  title: string;
  description: string;
  priority: OpportunityPriority;
  originType: OpportunityOrigin;
  originExplanation: string;
  evidence: { label: string; value: string }[];
  affectedBrands: string[];
  expectedImpact: string[];
  suggestedAction: string;
  score: number;
  scoreExplanation: string;
  dashboardLink: string | null;
  status: OpportunityStatus;
  assigneeUserId: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export const PRIORITY_CONFIG: Record<OpportunityPriority, { label: string; emoji: string; variant: "default" | "destructive" | "secondary" | "outline" }> = {
  critica: { label: "Crítica", emoji: "🔴", variant: "destructive" },
  alta: { label: "Alta", emoji: "🟠", variant: "destructive" },
  media: { label: "Média", emoji: "🟡", variant: "secondary" },
  baixa: { label: "Baixa", emoji: "🟢", variant: "outline" },
};

export const STATUS_LABELS: Record<OpportunityStatus, string> = {
  nova: "Nova",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  ignorada: "Ignorada",
  arquivada: "Arquivada",
};

export const ORIGIN_LABELS: Record<OpportunityOrigin, string> = {
  regra_deterministica: "Regra determinística",
  modelo_estatistico: "Modelo estatístico",
};

export const CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  receita: "Receita",
  produtos: "Produtos",
  clientes: "Clientes",
  operacao: "Operação",
  qualidade_dados: "Qualidade dos dados",
};
