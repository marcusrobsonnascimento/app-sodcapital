import React, { useCallback } from 'react';
import { useAnaliseContrato } from '@/hooks/use-analise-contrato-ia';
import { FileText, Upload, CheckCircle, AlertCircle, Loader2, Sparkles, X } from 'lucide-react';

interface AnaliseContratoIAProps {
  onDadosExtraidos: (dados: any) => void;
  onCancel: () => void;
}

export function AnaliseContratoIA({ onDadosExtraidos, onCancel }: AnaliseContratoIAProps) {
  const {
    analisarContrato,
    cancelarAnalise,
    progresso,
    status,
    mensagem,
    dadosExtraidos,
    confianca,
    erro,
    isLoading,
    isCompleted,
    isError,
  } = useAnaliseContrato();

  const [file, setFile] = React.useState<File | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  // Quando análise concluir, passar dados para o formulário
  React.useEffect(() => {
    if (isCompleted && dadosExtraidos) {
      onDadosExtraidos(dadosExtraidos);
    }
  }, [isCompleted, dadosExtraidos, onDadosExtraidos]);

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf') {
      alert('Por favor, selecione um arquivo PDF');
      return;
    }
    if (selectedFile.size > 20 * 1024 * 1024) {
      alert('O arquivo deve ter no máximo 20MB');
      return;
    }
    setFile(selectedFile);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, [handleFileSelect]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  }, [handleFileSelect]);

  const handleAnalisar = useCallback(() => {
    if (file) {
      analisarContrato(file);
    }
  }, [file, analisarContrato]);

  const handleRemoverArquivo = useCallback(() => {
    setFile(null);
    cancelarAnalise();
  }, [cancelarAnalise]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Estilos inline
  const styles = {
    container: {
      background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
      borderRadius: '20px',
      padding: '32px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    },
    dropzone: {
      border: `2px dashed ${isDragging ? '#3b82f6' : '#e2e8f0'}`,
      borderRadius: '16px',
      padding: '40px 24px',
      textAlign: 'center' as const,
      cursor: 'pointer',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      background: isDragging ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
    },
    fileCard: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      padding: '16px',
      background: '#f8fafc',
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
    },
    progressContainer: {
      marginTop: '24px',
    },
    progressBar: {
      height: '8px',
      background: '#e2e8f0',
      borderRadius: '4px',
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)',
      borderRadius: '4px',
      transition: 'width 0.5s ease-out',
    },
    buttonPrimary: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      padding: '12px 24px',
      background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    },
    buttonSecondary: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      padding: '12px 24px',
      background: 'white',
      color: '#64748b',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    },
    successBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      background: '#dcfce7',
      color: '#166534',
      borderRadius: '20px',
      fontSize: '13px',
      fontWeight: '500',
    },
    errorBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      background: '#fee2e2',
      color: '#991b1b',
      borderRadius: '20px',
      fontSize: '13px',
      fontWeight: '500',
    },
    confiancaBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      background: '#dbeafe',
      color: '#1e40af',
      borderRadius: '20px',
      fontSize: '13px',
      fontWeight: '500',
    },
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div style={{ 
          width: '40px', 
          height: '40px', 
          borderRadius: '10px', 
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Sparkles size={20} color="white" />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
            Análise com IA
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
            Envie o PDF do contrato para extração automática
          </p>
        </div>
      </div>

      {/* Área de Upload */}
      {!file && !isLoading && (
        <div
          style={styles.dropzone}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".pdf"
            onChange={handleInputChange}
            style={{ display: 'none' }}
          />
          <Upload size={40} color={isDragging ? '#3b82f6' : '#94a3b8'} />
          <p style={{ margin: '16px 0 8px', fontSize: '15px', fontWeight: '500', color: '#1e293b' }}>
            Arraste o PDF aqui ou clique para selecionar
          </p>
          <span style={{ 
            display: 'inline-block',
            padding: '4px 12px',
            background: '#f1f5f9',
            borderRadius: '12px',
            fontSize: '12px',
            color: '#64748b',
          }}>
            PDF até 20MB
          </span>
        </div>
      )}

      {/* Arquivo Selecionado */}
      {file && !isLoading && !isCompleted && !isError && (
        <div>
          <div style={styles.fileCard}>
            <FileText size={24} color="#3b82f6" />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: '500', color: '#1e293b' }}>
                {file.name}
              </p>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                {formatFileSize(file.size)}
              </p>
            </div>
            <button
              onClick={handleRemoverArquivo}
              style={{ 
                background: 'none', 
                border: 'none', 
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px',
              }}
            >
              <X size={18} color="#94a3b8" />
            </button>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button style={styles.buttonPrimary} onClick={handleAnalisar}>
              <Sparkles size={16} />
              Analisar com IA
            </button>
            <button style={styles.buttonSecondary} onClick={onCancel}>
              Preencher manualmente
            </button>
          </div>
        </div>
      )}

      {/* Progresso da Análise */}
      {isLoading && (
        <div style={styles.progressContainer}>
          <div style={styles.fileCard}>
            <Loader2 size={24} color="#3b82f6" style={{ animation: 'spin 1s linear infinite' }} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: '500', color: '#1e293b' }}>
                {mensagem || 'Processando...'}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                Etapa {Math.ceil(progresso / 20)} de 5
              </p>
            </div>
          </div>
          
          <div style={{ ...styles.progressBar, marginTop: '16px' }}>
            <div style={{ ...styles.progressFill, width: `${progresso}%` }} />
          </div>
          
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b', textAlign: 'center' }}>
            {Math.round(progresso)}% concluído
          </p>
        </div>
      )}

      {/* Sucesso */}
      {isCompleted && (
        <div>
          <div style={{ ...styles.fileCard, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <CheckCircle size={24} color="#16a34a" />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: '500', color: '#166534' }}>
                Análise concluída!
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#15803d' }}>
                Os dados foram extraídos e preenchidos no formulário
              </p>
            </div>
            {confianca !== null && (
              <span style={styles.confiancaBadge}>
                Confiança: {confianca}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* Erro */}
      {isError && (
        <div>
          <div style={{ ...styles.fileCard, background: '#fef2f2', borderColor: '#fecaca' }}>
            <AlertCircle size={24} color="#dc2626" />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: '500', color: '#991b1b' }}>
                Erro na análise
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#b91c1c' }}>
                {erro || 'Não foi possível processar o documento'}
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button style={styles.buttonPrimary} onClick={() => file && analisarContrato(file)}>
              Tentar novamente
            </button>
            <button style={styles.buttonSecondary} onClick={onCancel}>
              Preencher manualmente
            </button>
          </div>
        </div>
      )}

      {/* CSS para animação de spin */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}