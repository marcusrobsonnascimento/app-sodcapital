import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Tipos
interface AnaliseJob {
  id: string;
  arquivo_nome: string;
  arquivo_tamanho: number;
  status: 'INICIADO' | 'UPLOAD_RECEBIDO' | 'EXTRAINDO_TEXTO' | 'TEXTO_EXTRAIDO' | 'ANALISANDO_IA' | 'CONCLUIDO' | 'ERRO';
  etapa_atual: number;
  total_etapas: number;
  mensagem: string;
  dados_extraidos: DadosContrato | null;
  confianca_analise: number | null;
  erro_mensagem: string | null;
  iniciado_em: string;
  concluido_em: string | null;
}

interface DadosContrato {
  numero_contrato: string | null;
  tipo_contrato: 'BTS' | 'TIPICO' | 'ATIPICO' | null;
  objeto: string | null;
  data_assinatura: string | null;
  data_inicio_vigencia: string | null;
  data_fim_vigencia: string | null;
  prazo_meses: number | null;
  valor_aluguel: string | null;
  tipo_valor: 'FIXO' | 'PERCENTUAL' | 'MAIOR_ENTRE' | null;
  percentual_faturamento: string | null;
  indice_reajuste: 'IPCA' | 'IGPM' | 'INCC' | 'IGP' | 'INPC' | null;
  periodicidade_reajuste: number | null;
  data_base_reajuste: string | null;
  dia_vencimento: number | null;
  renovacao_automatica: boolean | null;
  prazo_renovacao_meses: number | null;
  prazo_notificacao_dias: number | null;
  multa_rescisao_percentual: string | null;
  carencia_meses: number | null;
  locador: {
    nome: string | null;
    documento: string | null;
    tipo: 'PF' | 'PJ' | null;
    endereco: string | null;
  };
  locatario: {
    nome: string | null;
    documento: string | null;
    tipo: 'PF' | 'PJ' | null;
    endereco: string | null;
  };
  fiadores: Array<{
    nome: string;
    documento: string;
    tipo: 'PF' | 'PJ';
  }>;
  imovel: {
    descricao: string | null;
    endereco: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    estado: string | null;
    cep: string | null;
    area_total_m2: string | null;
    area_construida_m2: string | null;
    matricula: string | null;
    inscricao_municipal: string | null;
  };
  garantias: Array<{
    tipo: string | null;
    valor: string | null;
    descricao: string | null;
    vigencia: string | null;
  }>;
  encargos_locatario: string | null;
  encargos_locador: string | null;
  clausulas_especiais: string | null;
  observacoes: string | null;
  confianca: number;
}

interface UseAnaliseContratoReturn {
  analisarContrato: (file: File) => Promise<void>;
  cancelarAnalise: () => void;
  job: AnaliseJob | null;
  progresso: number;
  status: string;
  mensagem: string;
  dadosExtraidos: DadosContrato | null;
  confianca: number | null;
  erro: string | null;
  isLoading: boolean;
  isCompleted: boolean;
  isError: boolean;
}

const WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_WEBHOOK_ANALISE_CONTRATO;

const STATUS_MENSAGENS: Record<string, string> = {
  'INICIADO': 'Iniciando análise...',
  'UPLOAD_RECEBIDO': 'Upload recebido. Preparando extração...',
  'EXTRAINDO_TEXTO': 'Extraindo texto do PDF...',
  'TEXTO_EXTRAIDO': 'Texto extraído. Iniciando análise com IA...',
  'ANALISANDO_IA': 'Claude está analisando o contrato...',
  'CONCLUIDO': 'Análise concluída com sucesso!',
  'ERRO': 'Erro durante a análise'
};

export function useAnaliseContrato(): UseAnaliseContratoReturn {
  const [job, setJob] = useState<AnaliseJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Escutar atualizações em tempo real
  useEffect(() => {
    if (!job?.id) return;

    const channel = supabase
      .channel(`analise-job-${job.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'sodcapital',
          table: 'analise_contratos_jobs',
          filter: `id=eq.${job.id}`
        },
        (payload) => {
          const novoJob = payload.new as AnaliseJob;
          setJob(novoJob);
          
          if (novoJob.status === 'CONCLUIDO' || novoJob.status === 'ERRO') {
            setIsLoading(false);
            if (novoJob.status === 'ERRO') {
              setErro(novoJob.erro_mensagem || 'Erro desconhecido');
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [job?.id]);

  // Função para enviar o arquivo para análise
  const analisarContrato = useCallback(async (file: File) => {
    if (!WEBHOOK_URL) {
      setErro('URL do webhook não configurada');
      return;
    }

    setIsLoading(true);
    setErro(null);
    setJob(null);

    try {
      // Criar FormData com o arquivo
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileName', file.name);
      formData.append('fileSize', file.size.toString());

      // Enviar para o webhook N8N
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Erro no upload: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success || !result.jobId) {
        throw new Error(result.error || 'Resposta inválida do servidor');
      }

      // Buscar job inicial
      const { data: jobData, error: jobError } = await supabase
        .schema('sodcapital')
        .from('analise_contratos_jobs')
        .select('*')
        .eq('id', result.jobId)
        .single();

      if (jobError) {
        throw new Error(`Erro ao buscar job: ${jobError.message}`);
      }

      setJob(jobData as AnaliseJob);

    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Erro desconhecido';
      setErro(errorMessage);
      setIsLoading(false);
    }
  }, []);

  // Função para cancelar/resetar
  const cancelarAnalise = useCallback(() => {
    setJob(null);
    setIsLoading(false);
    setErro(null);
  }, []);

  // Calcular progresso
  const progresso = job ? (job.etapa_atual / job.total_etapas) * 100 : 0;
  
  // Status atual
  const status = job?.status || '';
  const mensagem = job?.mensagem || STATUS_MENSAGENS[status] || '';
  
  // Dados extraídos
  const dadosExtraidos = job?.dados_extraidos || null;
  const confianca = job?.confianca_analise || null;
  
  // Estados derivados
  const isCompleted = job?.status === 'CONCLUIDO';
  const isError = job?.status === 'ERRO';

  return {
    analisarContrato,
    cancelarAnalise,
    job,
    progresso,
    status,
    mensagem,
    dadosExtraidos,
    confianca,
    erro,
    isLoading,
    isCompleted,
    isError,
  };
}