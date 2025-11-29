import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// MongoDB connection
let client = null
let db = null

async function connectToMongo() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    db = client.db(process.env.DB_NAME)
  }
  return db
}

// Helper function to handle CORS
function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

// OPTIONS handler for CORS
export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

// ==================== SHAREPOINT INTEGRATION ====================

// Configurações do Azure/SharePoint
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET
const SHAREPOINT_HOSTNAME = process.env.SHAREPOINT_HOSTNAME || 'sodeparadm.sharepoint.com'
const SHAREPOINT_SITE_NAME = process.env.SHAREPOINT_SITE_NAME || 'DOCUMENTO_SISTEMA'
const SHAREPOINT_BASE_FOLDER = process.env.SHAREPOINT_BASE_FOLDER || 'SOD - DOCUMENTOS_FINANCEIRO'

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Cache do token de acesso
let accessTokenCache = null

// Obter token de acesso do Microsoft Graph
async function getAccessToken() {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) {
    return accessTokenCache.token
  }

  const tokenUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`
  
  const params = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Erro ao obter token: ${error}`)
  }

  const data = await response.json()
  
  accessTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000
  }

  return data.access_token
}

// Obter ID do site do SharePoint
async function getSiteId(accessToken) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_HOSTNAME}:/sites/${SHAREPOINT_SITE_NAME}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Erro ao buscar site:', errorText)
    throw new Error(`Site "${SHAREPOINT_SITE_NAME}" não encontrado no SharePoint`)
  }

  const data = await response.json()
  return data.id
}

// Obter ID do drive padrão do site
async function getDriveId(accessToken, siteId) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  )

  if (!response.ok) {
    throw new Error('Erro ao buscar drive do SharePoint')
  }

  const data = await response.json()
  return data.id
}

// Criar pasta se não existir (recursivo)
async function ensureFolderExists(accessToken, driveId, folderPath) {
  const parts = folderPath.split('/').filter(p => p)
  let currentPath = ''
  let currentItemId = 'root'

  for (const part of parts) {
    currentPath += '/' + part
    
    try {
      const checkResponse = await fetch(
        `https://graph.microsoft.com/v1.0/drives/${driveId}/root:${currentPath}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      )

      if (checkResponse.ok) {
        const data = await checkResponse.json()
        currentItemId = data.id
      } else if (checkResponse.status === 404) {
        const createResponse = await fetch(
          `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${currentItemId}/children`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: part,
              folder: {},
              '@microsoft.graph.conflictBehavior': 'fail'
            })
          }
        )

        if (!createResponse.ok) {
          const retryResponse = await fetch(
            `https://graph.microsoft.com/v1.0/drives/${driveId}/root:${currentPath}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` }
            }
          )
          if (retryResponse.ok) {
            const data = await retryResponse.json()
            currentItemId = data.id
          } else {
            throw new Error(`Erro ao criar pasta: ${part}`)
          }
        } else {
          const data = await createResponse.json()
          currentItemId = data.id
        }
      } else {
        throw new Error(`Erro ao verificar pasta: ${currentPath}`)
      }
    } catch (error) {
      console.error(`Erro ao processar pasta ${part}:`, error)
      throw error
    }
  }

  return currentItemId
}

// Mapeamento de mês para nome
const MESES = {
  '01': '01 - Janeiro',
  '02': '02 - Fevereiro',
  '03': '03 - Março',
  '04': '04 - Abril',
  '05': '05 - Maio',
  '06': '06 - Junho',
  '07': '07 - Julho',
  '08': '08 - Agosto',
  '09': '09 - Setembro',
  '10': '10 - Outubro',
  '11': '11 - Novembro',
  '12': '12 - Dezembro'
}

// Handler para upload de documento
async function handleSharePointUpload(formData) {
  const file = formData.get('file')
  const lancamentoId = formData.get('lancamento_id')
  const tipoDocumento = formData.get('tipo_documento')
  const empresaNome = formData.get('empresa_nome')
  const dataVencimento = formData.get('data_vencimento')
  const orgId = formData.get('org_id')

  if (!file || !lancamentoId || !tipoDocumento || !empresaNome) {
    return handleCORS(NextResponse.json(
      { error: 'Parâmetros obrigatórios ausentes' },
      { status: 400 }
    ))
  }

  const [ano, mes] = dataVencimento.split('-')
  const mesNome = MESES[mes] || mes

  const folderPath = `/${SHAREPOINT_BASE_FOLDER}/${empresaNome}/${ano}/${mesNome}`

  const timestamp = Date.now()
  const extensao = file.name.split('.').pop()?.toLowerCase() || ''
  const nomeArquivo = `${lancamentoId.substring(0, 8)}_${tipoDocumento}_${timestamp}.${extensao}`

  const accessToken = await getAccessToken()
  const siteId = await getSiteId(accessToken)
  const driveId = await getDriveId(accessToken, siteId)

  await ensureFolderExists(accessToken, driveId, folderPath)

  const fileBuffer = await file.arrayBuffer()
  const uploadPath = `${folderPath}/${nomeArquivo}`

  const uploadResponse = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/root:${uploadPath}:/content`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': file.type || 'application/octet-stream'
      },
      body: fileBuffer
    }
  )

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text()
    throw new Error(`Erro ao fazer upload: ${error}`)
  }

  const uploadData = await uploadResponse.json()

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: docData, error: dbError } = await supabase
    .from('lancamento_documentos')
    .insert({
      org_id: orgId,
      lancamento_id: lancamentoId,
      tipo_documento: tipoDocumento,
      nome_arquivo: nomeArquivo,
      nome_original: file.name,
      extensao: extensao,
      tamanho_bytes: file.size,
      mime_type: file.type,
      sharepoint_item_id: uploadData.id,
      sharepoint_drive_id: driveId,
      sharepoint_site_id: siteId,
      sharepoint_path: uploadPath,
      sharepoint_web_url: uploadData.webUrl,
      sharepoint_download_url: uploadData['@microsoft.graph.downloadUrl'] || null
    })
    .select()
    .single()

  if (dbError) {
    console.error('Erro ao salvar no banco:', dbError)
    try {
      await fetch(
        `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${uploadData.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      )
    } catch (e) {
      console.error('Erro ao reverter upload:', e)
    }
    throw new Error('Erro ao salvar metadados do documento')
  }

  return handleCORS(NextResponse.json({
    success: true,
    documento: docData,
    sharepoint: {
      webUrl: uploadData.webUrl,
      downloadUrl: uploadData['@microsoft.graph.downloadUrl']
    }
  }))
}

// Handler para deletar documento
async function handleSharePointDelete(formData) {
  const documentoId = formData.get('documento_id')

  if (!documentoId) {
    return handleCORS(NextResponse.json({ error: 'ID do documento não informado' }, { status: 400 }))
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: doc, error: fetchError } = await supabase
    .from('lancamento_documentos')
    .select('*')
    .eq('id', documentoId)
    .single()

  if (fetchError || !doc) {
    return handleCORS(NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 }))
  }

  try {
    const accessToken = await getAccessToken()
    await fetch(
      `https://graph.microsoft.com/v1.0/drives/${doc.sharepoint_drive_id}/items/${doc.sharepoint_item_id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
  } catch (error) {
    console.error('Erro ao deletar do SharePoint:', error)
  }

  const { error: deleteError } = await supabase
    .from('lancamento_documentos')
    .delete()
    .eq('id', documentoId)

  if (deleteError) {
    throw new Error('Erro ao deletar documento do banco')
  }

  return handleCORS(NextResponse.json({ success: true }))
}

// Handler para listar documentos
async function handleSharePointList(formData) {
  const lancamentoId = formData.get('lancamento_id')

  if (!lancamentoId) {
    return handleCORS(NextResponse.json({ error: 'ID do lançamento não informado' }, { status: 400 }))
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: documentos, error } = await supabase
    .from('lancamento_documentos')
    .select('*')
    .eq('lancamento_id', lancamentoId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error('Erro ao buscar documentos')
  }

  if (documentos && documentos.length > 0) {
    try {
      const accessToken = await getAccessToken()
      
      for (const doc of documentos) {
        try {
          const response = await fetch(
            `https://graph.microsoft.com/v1.0/drives/${doc.sharepoint_drive_id}/items/${doc.sharepoint_item_id}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` }
            }
          )
          
          if (response.ok) {
            const data = await response.json()
            doc.sharepoint_download_url = data['@microsoft.graph.downloadUrl']
            doc.sharepoint_web_url = data.webUrl
          }
        } catch (e) {
          console.error(`Erro ao atualizar URL do documento ${doc.id}:`, e)
        }
      }
    } catch (e) {
      console.error('Erro ao obter token para atualizar URLs:', e)
    }
  }

  return handleCORS(NextResponse.json({ documentos }))
}

// Handler para obter URL de visualização/download
async function handleSharePointGetUrl(request) {
  const { searchParams } = new URL(request.url)
  const documentoId = searchParams.get('id')
  const action = searchParams.get('action') || 'view'

  if (!documentoId) {
    return handleCORS(NextResponse.json({ error: 'ID do documento não informado' }, { status: 400 }))
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: doc, error } = await supabase
    .from('lancamento_documentos')
    .select('*')
    .eq('id', documentoId)
    .single()

  if (error || !doc) {
    return handleCORS(NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 }))
  }

  const accessToken = await getAccessToken()

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${doc.sharepoint_drive_id}/items/${doc.sharepoint_item_id}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  )

  if (!response.ok) {
    return handleCORS(NextResponse.json({ error: 'Arquivo não encontrado no SharePoint' }, { status: 404 }))
  }

  const data = await response.json()

  if (action === 'download') {
    return handleCORS(NextResponse.json({ 
      url: data['@microsoft.graph.downloadUrl'],
      nome: doc.nome_original
    }))
  } else {
    return handleCORS(NextResponse.json({ 
      url: data.webUrl,
      embedUrl: data.webUrl + '?web=1',
      nome: doc.nome_original
    }))
  }
}

// ==================== MAIN ROUTE HANDLER ====================

async function handleRoute(request, { params }) {
  const { path = [] } = params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    // ==================== SHAREPOINT ROUTES ====================
    
    // POST /api/sharepoint - Upload, Delete, List
    if (route === '/sharepoint' && method === 'POST') {
      const formData = await request.formData()
      const action = formData.get('action')

      if (action === 'upload') {
        return await handleSharePointUpload(formData)
      } else if (action === 'delete') {
        return await handleSharePointDelete(formData)
      } else if (action === 'list') {
        return await handleSharePointList(formData)
      } else {
        return handleCORS(NextResponse.json({ error: 'Ação inválida' }, { status: 400 }))
      }
    }

    // GET /api/sharepoint?id=xxx&action=view|download
    if (route === '/sharepoint' && method === 'GET') {
      return await handleSharePointGetUrl(request)
    }

    // ==================== MONGODB ROUTES ====================

    const db = await connectToMongo()

    // Root endpoint - GET /api/root
    if (route === '/root' && method === 'GET') {
      return handleCORS(NextResponse.json({ message: "Hello World" }))
    }
    
    // Root endpoint - GET /api/
    if (route === '/' && method === 'GET') {
      return handleCORS(NextResponse.json({ message: "Hello World" }))
    }

    // Status endpoints - POST /api/status
    if (route === '/status' && method === 'POST') {
      const body = await request.json()
      
      if (!body.client_name) {
        return handleCORS(NextResponse.json(
          { error: "client_name is required" }, 
          { status: 400 }
        ))
      }

      const statusObj = {
        id: uuidv4(),
        client_name: body.client_name,
        timestamp: new Date()
      }

      await db.collection('status_checks').insertOne(statusObj)
      return handleCORS(NextResponse.json(statusObj))
    }

    // Status endpoints - GET /api/status
    if (route === '/status' && method === 'GET') {
      const statusChecks = await db.collection('status_checks')
        .find({})
        .limit(1000)
        .toArray()

      const cleanedStatusChecks = statusChecks.map(({ _id, ...rest }) => rest)
      
      return handleCORS(NextResponse.json(cleanedStatusChecks))
    }

    // Route not found
    return handleCORS(NextResponse.json(
      { error: `Route ${route} not found` }, 
      { status: 404 }
    ))

  } catch (error) {
    console.error('API Error:', error)
    return handleCORS(NextResponse.json(
      { error: error.message || "Internal server error" }, 
      { status: 500 }
    ))
  }
}

// Export all HTTP methods
export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute