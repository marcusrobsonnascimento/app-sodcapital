'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { FileDown, FileSpreadsheet, Search, AlertTriangle } from 'lucide-react'

interface Empresa {
  id: string
  nome: string
}

interface BancoConta {
  id: string
  empresa_id: string
  numero_conta: string
  banco_nome: string
  agencia: string
  tipo_conta: string
  banco_id: string
}

interface Movimento {
  id: string
  data_movimento: string
  tipo_movimento: string
  valor: number
  historico: string
  documento: string
  saldo_acumulado: number
  transferencia_id?: string
  conta_origem?: {
    banco_nome: string
    agencia: string
    numero_conta: string
    empresa_nome: string
    tipo_conta: string
  }
  conta_destino?: {
    banco_nome: string
    agencia: string
    numero_conta: string
    empresa_nome: string
    tipo_conta: string
  }
}

interface SaldoAnterior {
  valor: number
  data: string
}

export default function ExtratoContaPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [bancosContas, setBancosContas] = useState<BancoConta[]>([])
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>('')
  const [contaSelecionada, setContaSelecionada] = useState<string>('')
  const [dataInicial, setDataInicial] = useState<string>('')
  const [dataFinal, setDataFinal] = useState<string>('')
  const [movimentos, setMovimentos] = useState<Movimento[]>([])
  const [saldoAnterior, setSaldoAnterior] = useState<SaldoAnterior>({ valor: 0, data: '' })
  const [loading, setLoading] = useState(false)
  const [contaInfo, setContaInfo] = useState<BancoConta | null>(null)
  const [empresaInfo, setEmpresaInfo] = useState<Empresa | null>(null)

  useEffect(() => {
    loadEmpresas()
  }, [])

  useEffect(() => {
    if (empresaSelecionada) {
      loadBancosContas(empresaSelecionada)
    } else {
      setBancosContas([])
      setContaSelecionada('')
    }
  }, [empresaSelecionada])

  const loadEmpresas = async () => {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome')

      if (error) throw error
      setEmpresas(data || [])
    } catch (err) {
      console.error('Erro ao carregar empresas:', err)
    }
  }

  const loadBancosContas = async (empresaId: string) => {
    try {
      const { data, error } = await supabase
        .from('bancos_contas')
        .select(`
          *,
          bancos:banco_id (
            nome
          )
        `)
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .order('banco_nome')

      if (error) throw error
      
      // Normalizar dados e ordenar alfabeticamente
      const normalizedData = (data || []).map(conta => {
        const bancoNome = (conta as any).bancos?.nome || conta.banco_nome
        return {
          ...conta,
          banco_nome: bancoNome
        }
      }).sort((a, b) => {
        // Ordenar por banco_nome, depois agencia, depois numero_conta
        if (a.banco_nome !== b.banco_nome) {
          return a.banco_nome.localeCompare(b.banco_nome, 'pt-BR')
        }
        if (a.agencia !== b.agencia) {
          return a.agencia.localeCompare(b.agencia, 'pt-BR')
        }
        return a.numero_conta.localeCompare(b.numero_conta, 'pt-BR')
      })
      
      setBancosContas(normalizedData || [])
    } catch (err) {
      console.error('Erro ao carregar contas bancárias:', err)
    }
  }

  const [validationModal, setValidationModal] = useState<{ show: boolean; message: string }>({ 
    show: false, 
    message: '' 
  })

  const buscarExtrato = async () => {
    if (!contaSelecionada || !dataInicial || !dataFinal) {
      setValidationModal({ 
        show: true, 
        message: 'Por favor, preencha todos os filtros obrigatórios: Empresa, Conta Bancária, Data Inicial e Data Final.' 
      })
      return
    }

    setLoading(true)
    try {
      // Buscar informações da conta e empresa
      const conta = bancosContas.find(c => c.id === contaSelecionada)
      const empresa = empresas.find(e => e.id === empresaSelecionada)
      setContaInfo(conta || null)
      setEmpresaInfo(empresa || null)

      // Buscar saldo anterior (fechamento anterior à data inicial)
      const { data: fechamentos, error: fechError } = await supabase
        .from('fechamentos_bancarios')
        .select('saldo_final, data_fechamento')
        .eq('banco_conta_id', contaSelecionada)
        .eq('fechado', true)
        .lt('data_fechamento', dataInicial)
        .order('data_fechamento', { ascending: false })
        .limit(1)

      if (!fechError && fechamentos && fechamentos.length > 0) {
        setSaldoAnterior({
          valor: Number(fechamentos[0].saldo_final),
          data: fechamentos[0].data_fechamento
        })
      } else {
        setSaldoAnterior({ valor: 0, data: '' })
      }

      // Buscar movimentos do período
      const { data: movimentosData, error: movError } = await supabase
        .from('movimentos_bancarios')
        .select('*')
        .eq('banco_conta_id', contaSelecionada)
        .gte('data_movimento', dataInicial)
        .lte('data_movimento', dataFinal)
        .order('data_movimento', { ascending: true })
        .order('created_at', { ascending: true })

      if (movError) throw movError

      // Buscar dados das transferências
      const movimentosComTransferencia = movimentosData?.filter(m => 
        m.tipo_movimento === 'TRANSFERENCIA_ENVIADA' || m.tipo_movimento === 'TRANSFERENCIA_RECEBIDA'
      ) || []

      let transferenciasMap = new Map()

      if (movimentosComTransferencia.length > 0) {
        for (const mov of movimentosComTransferencia) {
          if (mov.tipo_movimento === 'TRANSFERENCIA_RECEBIDA' && mov.transferencia_id) {
            // Buscar movimento de origem (quem enviou)
            const { data: movOrigem } = await supabase
              .from('movimentos_bancarios')
              .select(`
                banco_conta_id,
                bancos_contas!movimentos_bancarios_banco_conta_id_fkey (
                  banco_nome,
                  agencia,
                  numero_conta,
                  tipo_conta,
                  empresas!bancos_contas_empresa_id_fkey (
                    nome
                  )
                )
              `)
              .eq('id', mov.transferencia_id)
              .single()

            if (movOrigem) {
              const conta = movOrigem.bancos_contas as any
              transferenciasMap.set(mov.id, {
                origem: {
                  banco_nome: conta?.banco_nome || '',
                  agencia: conta?.agencia || '',
                  numero_conta: conta?.numero_conta || '',
                  tipo_conta: conta?.tipo_conta || '',
                  empresa_nome: Array.isArray(conta?.empresas) 
                    ? conta.empresas[0]?.nome 
                    : conta?.empresas?.nome || ''
                }
              })
            }
          } else if (mov.tipo_movimento === 'TRANSFERENCIA_ENVIADA') {
            // Buscar movimento de destino (quem recebeu)
            const { data: movDestino } = await supabase
              .from('movimentos_bancarios')
              .select(`
                banco_conta_id,
                bancos_contas!movimentos_bancarios_banco_conta_id_fkey (
                  banco_nome,
                  agencia,
                  numero_conta,
                  tipo_conta,
                  empresas!bancos_contas_empresa_id_fkey (
                    nome
                  )
                )
              `)
              .eq('transferencia_id', mov.id)
              .single()

            if (movDestino) {
              const conta = movDestino.bancos_contas as any
              transferenciasMap.set(mov.id, {
                destino: {
                  banco_nome: conta?.banco_nome || '',
                  agencia: conta?.agencia || '',
                  numero_conta: conta?.numero_conta || '',
                  tipo_conta: conta?.tipo_conta || '',
                  empresa_nome: Array.isArray(conta?.empresas) 
                    ? conta.empresas[0]?.nome 
                    : conta?.empresas?.nome || ''
                }
              })
            }
          }
        }
      }

      // Calcular saldo acumulado
      let saldoAcumulado = fechamentos && fechamentos.length > 0 ? Number(fechamentos[0].saldo_final) : 0
      
      const movimentosComSaldo = (movimentosData || []).map(mov => {
        if (mov.tipo_movimento === 'ENTRADA' || mov.tipo_movimento === 'TRANSFERENCIA_RECEBIDA') {
          saldoAcumulado += Number(mov.valor)
        } else {
          saldoAcumulado -= Number(mov.valor)
        }

        const transfData = transferenciasMap.get(mov.id)
        
        return {
          id: mov.id,
          data_movimento: mov.data_movimento,
          tipo_movimento: mov.tipo_movimento,
          valor: Number(mov.valor),
          historico: mov.historico || '',
          documento: mov.documento || '',
          saldo_acumulado: saldoAcumulado,
          transferencia_id: mov.transferencia_id,
          conta_origem: transfData?.origem,
          conta_destino: transfData?.destino
        }
      })

      setMovimentos(movimentosComSaldo)
    } catch (err) {
      console.error('Erro ao buscar extrato:', err)
      setValidationModal({ 
        show: true, 
        message: 'Ocorreu um erro ao buscar o extrato. Por favor, tente novamente.' 
      })
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR')
  }

  const getTipoMovimentoText = (tipo: string) => {
    const tipos: { [key: string]: string } = {
      'ENTRADA': 'Entrada',
      'SAIDA': 'Saída',
      'TRANSFERENCIA_ENVIADA': 'Transf. Enviada',
      'TRANSFERENCIA_RECEBIDA': 'Transf. Recebida'
    }
    return tipos[tipo] || tipo
  }

  const getHistoricoCompleto = (movimento: Movimento) => {
    let historico = ''

    if (movimento.tipo_movimento === 'TRANSFERENCIA_RECEBIDA' && movimento.conta_origem) {
      historico = `Transferência recebida de ${movimento.conta_origem.empresa_nome} - ${movimento.conta_origem.banco_nome} - Ag: ${movimento.conta_origem.agencia} - Conta: ${movimento.conta_origem.numero_conta} - Tipo: ${movimento.conta_origem.tipo_conta}`
      if (movimento.historico) {
        historico += ` | ${movimento.historico}`
      }
    } else if (movimento.tipo_movimento === 'TRANSFERENCIA_ENVIADA' && movimento.conta_destino) {
      historico = `Transferência enviada para ${movimento.conta_destino.empresa_nome} - ${movimento.conta_destino.banco_nome} - Ag: ${movimento.conta_destino.agencia} - Conta: ${movimento.conta_destino.numero_conta} - Tipo: ${movimento.conta_destino.tipo_conta}`
      if (movimento.historico) {
        historico += ` | ${movimento.historico}`
      }
    } else {
      historico = movimento.historico || '-'
    }

    return historico
  }

  const getTipoConta = (contaId: string): string => {
    const conta = bancosContas.find(c => c.id === contaId)
    return conta?.tipo_conta || ''
  }

  const exportarExcel = () => {
    if (movimentos.length === 0) {
      setValidationModal({ 
        show: true, 
        message: 'Não há dados disponíveis para exportar. Por favor, busque o extrato primeiro.' 
      })
      return
    }

    // Criar CSV
    let csv = 'EXTRATO DE CONTA BANCÁRIA\n\n'
    csv += `Empresa:,${empresaInfo?.nome || ''}\n`
    csv += `Banco:,${contaInfo?.banco_nome || ''}\n`
    csv += `Agência:,${contaInfo?.agencia || ''}\n`
    csv += `Conta:,${contaInfo?.numero_conta || ''}\n`
    csv += `Período:,${formatDate(dataInicial)} a ${formatDate(dataFinal)}\n\n`
    csv += 'Data,Tipo,Histórico,Documento,Débito,Crédito,Saldo\n'

    // Adicionar saldo anterior
    if (saldoAnterior.data) {
      csv += `${formatDate(saldoAnterior.data)},Saldo Anterior,,,,,${formatCurrency(saldoAnterior.valor)}\n`
    }

    // Adicionar movimentos
    movimentos.forEach(mov => {
      const isDebito = mov.tipo_movimento === 'SAIDA' || mov.tipo_movimento === 'TRANSFERENCIA_ENVIADA'
      const historicoCompleto = getHistoricoCompleto(mov).replace(/,/g, ';').replace(/\n/g, ' ')
      csv += `${formatDate(mov.data_movimento)},${getTipoMovimentoText(mov.tipo_movimento)},${historicoCompleto},${mov.documento || ''},`
      csv += `${isDebito ? formatCurrency(mov.valor) : ''},${!isDebito ? formatCurrency(mov.valor) : ''},${formatCurrency(mov.saldo_acumulado)}\n`
    })

    // Download
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `Extrato_${contaInfo?.banco_nome}_${formatDate(dataInicial)}_${formatDate(dataFinal)}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportarPDF = () => {
    if (movimentos.length === 0) {
      setValidationModal({ 
        show: true, 
        message: 'Não há dados disponíveis para exportar. Por favor, busque o extrato primeiro.' 
      })
      return
    }

    // Criar janela de impressão
    const printWindow = window.open('', '', 'width=800,height=600')
    if (!printWindow) {
      setValidationModal({ 
        show: true, 
        message: 'Por favor, permita pop-ups no seu navegador para gerar o PDF.' 
      })
      return
    }

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Extrato de Conta</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { text-align: center; color: #1555D6; font-size: 18px; margin-bottom: 20px; }
          .info { margin-bottom: 20px; font-size: 12px; }
          .info p { margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background-color: #1555D6; color: white; padding: 8px; text-align: left; font-weight: 600; }
          td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
          .saldo-anterior { background-color: #f9fafb; font-weight: 600; }
          .right { text-align: right; }
          .debito { color: #dc2626; }
          .credito { color: #059669; }
          .saldo { font-weight: 700; color: #1555D6; }
          @media print {
            body { padding: 10px; }
          }
        </style>
      </head>
      <body>
        <h1>EXTRATO DE CONTA BANCÁRIA</h1>
        <div class="info">
          <p><strong>Empresa:</strong> ${empresaInfo?.nome || ''}</p>
          <p><strong>Banco:</strong> ${contaInfo?.banco_nome || ''}</p>
          <p><strong>Agência:</strong> ${contaInfo?.agencia || ''} | <strong>Conta:</strong> ${contaInfo?.numero_conta || ''} | <strong>Tipo:</strong> ${contaInfo?.tipo_conta || ''}</p>
          <p><strong>Período:</strong> ${formatDate(dataInicial)} a ${formatDate(dataFinal)}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Histórico</th>
              <th>Documento</th>
              <th class="right">Débito</th>
              <th class="right">Crédito</th>
              <th class="right">Saldo</th>
            </tr>
          </thead>
          <tbody>
    `

    // Saldo anterior
    if (saldoAnterior.data) {
      html += `
        <tr class="saldo-anterior">
          <td>${formatDate(saldoAnterior.data)}</td>
          <td colspan="4">Saldo Anterior</td>
          <td class="right">-</td>
          <td class="right saldo">${formatCurrency(saldoAnterior.valor)}</td>
        </tr>
      `
    }

    // Movimentos
    movimentos.forEach(mov => {
      const isDebito = mov.tipo_movimento === 'SAIDA' || mov.tipo_movimento === 'TRANSFERENCIA_ENVIADA'
      const historicoCompleto = getHistoricoCompleto(mov)
      html += `
        <tr>
          <td>${formatDate(mov.data_movimento)}</td>
          <td>${getTipoMovimentoText(mov.tipo_movimento)}</td>
          <td>${historicoCompleto}</td>
          <td>${mov.documento || '-'}</td>
          <td class="right debito">${isDebito ? formatCurrency(mov.valor) : '-'}</td>
          <td class="right credito">${!isDebito ? formatCurrency(mov.valor) : '-'}</td>
          <td class="right saldo">${formatCurrency(mov.saldo_acumulado)}</td>
        </tr>
      `
    })

    html += `
          </tbody>
        </table>
      </body>
      </html>
    `

    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    
    setTimeout(() => {
      printWindow.print()
    }, 250)
  }

  const totalEntradas = movimentos
    .filter(m => m.tipo_movimento === 'ENTRADA' || m.tipo_movimento === 'TRANSFERENCIA_RECEBIDA')
    .reduce((sum, m) => sum + m.valor, 0)

  const totalSaidas = movimentos
    .filter(m => m.tipo_movimento === 'SAIDA' || m.tipo_movimento === 'TRANSFERENCIA_ENVIADA')
    .reduce((sum, m) => sum + m.valor, 0)

  const saldoFinal = movimentos.length > 0 ? movimentos[movimentos.length - 1].saldo_acumulado : saldoAnterior.valor

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>
          Extrato de Conta
        </h1>
        <p style={{ fontSize: '14px', color: '#6b7280' }}>
          Visualize e exporte o extrato detalhado de movimentações bancárias
        </p>
      </div>

      {/* Filtros */}
      <div style={{
        backgroundColor: 'white',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '16px',
          marginBottom: '16px'
        }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Empresa *
            </label>
            <select
              value={empresaSelecionada}
              onChange={(e) => setEmpresaSelecionada(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                backgroundColor: 'white',
                color: '#374151'
              }}
            >
              <option value="">Selecione uma empresa</option>
              {empresas.map(empresa => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Conta Bancária *
            </label>
            <select
              value={contaSelecionada}
              onChange={(e) => setContaSelecionada(e.target.value)}
              disabled={!empresaSelecionada}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                backgroundColor: empresaSelecionada ? 'white' : '#f3f4f6',
                color: '#374151'
              }}
            >
              <option value="">Selecione uma conta</option>
              {bancosContas.map(conta => (
                <option key={conta.id} value={conta.id}>
                  {conta.banco_nome} - Ag: {conta.agencia} - Conta: {conta.numero_conta} - Tipo: {conta.tipo_conta || 'N/A'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 2fr',
          gap: '16px'
        }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Data Inicial *
            </label>
            <input
              type="date"
              value={dataInicial}
              onChange={(e) => setDataInicial(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Data Final *
            </label>
            <input
              type="date"
              value={dataFinal}
              onChange={(e) => setDataFinal(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
            <button
              onClick={buscarExtrato}
              disabled={loading}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 20px',
                backgroundColor: loading ? '#9ca3af' : '#1555D6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                if (!loading) e.currentTarget.style.backgroundColor = '#1044b5'
              }}
              onMouseOut={(e) => {
                if (!loading) e.currentTarget.style.backgroundColor = '#1555D6'
              }}
            >
              <Search style={{ width: '18px', height: '18px' }} />
              {loading ? 'Buscando...' : 'Buscar Extrato'}
            </button>
          </div>
        </div>
      </div>

      {/* Cards de Resumo */}
      {movimentos.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          marginBottom: '24px'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid #e5e7eb'
          }}>
            <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>
              Saldo Anterior
            </p>
            <p style={{ fontSize: '20px', fontWeight: '700', color: '#6366f1' }}>
              {formatCurrency(saldoAnterior.valor)}
            </p>
          </div>

          <div style={{
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid #e5e7eb'
          }}>
            <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>
              Total Entradas
            </p>
            <p style={{ fontSize: '20px', fontWeight: '700', color: '#10b981' }}>
              {formatCurrency(totalEntradas)}
            </p>
          </div>

          <div style={{
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid #e5e7eb'
          }}>
            <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>
              Total Saídas
            </p>
            <p style={{ fontSize: '20px', fontWeight: '700', color: '#ef4444' }}>
              {formatCurrency(totalSaidas)}
            </p>
          </div>

          <div style={{
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid #e5e7eb'
          }}>
            <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>
              Saldo Final
            </p>
            <p style={{
              fontSize: '20px',
              fontWeight: '700',
              color: saldoFinal >= 0 ? '#1555D6' : '#ef4444'
            }}>
              {formatCurrency(saldoFinal)}
            </p>
          </div>
        </div>
      )}

      {/* Botões de Exportação */}
      {movimentos.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          padding: '16px',
          borderRadius: '12px',
          marginBottom: '24px',
          border: '1px solid #e5e7eb',
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={exportarPDF}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
          >
            <FileDown style={{ width: '18px', height: '18px' }} />
            Imprimir/PDF
          </button>

          <button
            onClick={exportarExcel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#059669'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
          >
            <FileSpreadsheet style={{ width: '18px', height: '18px' }} />
            Exportar CSV
          </button>
        </div>
      )}

      {/* Tabela de Movimentos */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden'
      }}>
        {movimentos.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <p style={{ color: '#6b7280', fontSize: '14px' }}>
              {loading ? 'Carregando extrato...' : 'Selecione os filtros e clique em "Buscar Extrato"'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Data
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Tipo
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Histórico
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Documento
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'right',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Débito
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'right',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Crédito
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'right',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Saldo
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Linha do Saldo Anterior */}
                {saldoAnterior.data && (
                  <tr style={{
                    borderTop: '1px solid #e5e7eb',
                    backgroundColor: '#f9fafb'
                  }}>
                    <td style={{ padding: '16px', fontSize: '14px', color: '#374151', fontWeight: '600' }}>
                      {formatDate(saldoAnterior.data)}
                    </td>
                    <td colSpan={4} style={{ padding: '16px', fontSize: '14px', color: '#374151', fontWeight: '600' }}>
                      Saldo Anterior
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right', fontSize: '14px', fontWeight: '700', color: '#6366f1' }}>
                      -
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right', fontSize: '14px', fontWeight: '700', color: '#6366f1' }}>
                      {formatCurrency(saldoAnterior.valor)}
                    </td>
                  </tr>
                )}

                {/* Movimentos */}
                {movimentos.map((movimento) => {
                  const isDebito = movimento.tipo_movimento === 'SAIDA' || movimento.tipo_movimento === 'TRANSFERENCIA_ENVIADA'
                  return (
                    <tr
                      key={movimento.id}
                      style={{ borderTop: '1px solid #e5e7eb' }}
                    >
                      <td style={{ padding: '16px', fontSize: '14px', color: '#374151' }}>
                        {formatDate(movimento.data_movimento)}
                      </td>
                      <td style={{ padding: '16px', fontSize: '14px', color: '#374151' }}>
                        {getTipoMovimentoText(movimento.tipo_movimento)}
                      </td>
                      <td style={{ padding: '16px', fontSize: '14px', color: '#6b7280' }}>
                        {getHistoricoCompleto(movimento)}
                      </td>
                      <td style={{ padding: '16px', fontSize: '14px', color: '#6b7280' }}>
                        {movimento.documento || '-'}
                      </td>
                      <td style={{
                        padding: '16px',
                        textAlign: 'right',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#dc2626'
                      }}>
                        {isDebito ? formatCurrency(movimento.valor) : '-'}
                      </td>
                      <td style={{
                        padding: '16px',
                        textAlign: 'right',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#059669'
                      }}>
                        {!isDebito ? formatCurrency(movimento.valor) : '-'}
                      </td>
                      <td style={{
                        padding: '16px',
                        textAlign: 'right',
                        fontSize: '14px',
                        fontWeight: '700',
                        color: movimento.saldo_acumulado >= 0 ? '#1555D6' : '#ef4444'
                      }}>
                        {formatCurrency(movimento.saldo_acumulado)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Validação */}
      {validationModal.show && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            backgroundColor: 'rgba(0, 0, 0, 0.5)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 1001, 
            backdropFilter: 'blur(4px)' 
          }} 
          onClick={() => setValidationModal({ show: false, message: '' })}
        >
          <div 
            style={{ 
              backgroundColor: 'white', 
              borderRadius: '16px', 
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', 
              padding: '32px', 
              width: '100%', 
              maxWidth: '450px', 
              margin: '16px' 
            }} 
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              style={{ 
                width: '56px', 
                height: '56px', 
                margin: '0 auto 20px', 
                borderRadius: '50%', 
                backgroundColor: '#fef3c7', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}
            >
              <AlertTriangle style={{ width: '28px', height: '28px', color: '#f59e0b' }} />
            </div>
            <h2 
              style={{ 
                fontSize: '20px', 
                fontWeight: '700', 
                color: '#111827', 
                marginBottom: '12px', 
                textAlign: 'center' 
              }}
            >
              Atenção
            </h2>
            <p 
              style={{ 
                fontSize: '14px', 
                color: '#6b7280', 
                marginBottom: '24px', 
                textAlign: 'center', 
                lineHeight: '1.5' 
              }}
            >
              {validationModal.message}
            </p>
            <button 
              onClick={() => setValidationModal({ show: false, message: '' })} 
              style={{ 
                width: '100%', 
                padding: '12px 24px', 
                backgroundColor: '#1555D6', 
                border: 'none', 
                borderRadius: '8px', 
                fontSize: '14px', 
                fontWeight: '600', 
                color: 'white', 
                cursor: 'pointer', 
                transition: 'all 0.2s' 
              }} 
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'} 
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}