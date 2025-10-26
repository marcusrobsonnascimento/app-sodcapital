'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [logoError, setLogoError] = useState(false)

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (signInError) {
        throw signInError
      }

      if (data.user) {
        router.push('/')
      }
    } catch (err: any) {
      setError(err.message || 'Credenciais inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div 
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f3f4f6',
        padding: '2rem'
      }}
    >
      <div 
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          padding: '3rem 2.5rem',
        }}
      >
        {/* Logo e Título */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          {/* Logo - tenta carregar imagem, se falhar usa texto */}
          {!logoError ? (
            <div style={{ marginBottom: '1rem' }}>
              <img 
                src="/sodcapital-logo.png" 
                alt="SodCapital"
                onError={() => setLogoError(true)}
                style={{
                  height: '60px',
                  width: 'auto',
                  margin: '0 auto',
                  display: 'block'
                }}
              />
            </div>
          ) : (
            <h1 
              style={{
                fontSize: '2rem',
                fontWeight: '700',
                color: '#1555D6',
                marginBottom: '0.5rem',
                letterSpacing: '0.5px'
              }}
            >
              SODCAPITAL
            </h1>
          )}
          
          <p 
            style={{
              fontSize: '0.95rem',
              color: '#6b7280',
              fontWeight: '400'
            }}
          >
            Sistema de Gestão Financeira
          </p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleLogin}>
          {/* Mensagem de Erro */}
          {error && (
            <div 
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                marginBottom: '1.5rem'
              }}
            >
              <p style={{ fontSize: '0.875rem', color: '#dc2626', margin: 0, textAlign: 'center' }}>
                {error}
              </p>
            </div>
          )}

          {/* Campo E-mail */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label 
              htmlFor="email"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '0.5rem'
              }}
            >
              E-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                fontSize: '0.95rem',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                color: '#111827',
                outline: 'none',
                transition: 'all 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#1555D6'
                e.target.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#d1d5db'
                e.target.style.boxShadow = 'none'
              }}
            />
          </div>

          {/* Campo Senha */}
          <div style={{ marginBottom: '1rem' }}>
            <label 
              htmlFor="password"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '0.5rem'
              }}
            >
              Senha
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  paddingRight: '3rem',
                  fontSize: '0.95rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  backgroundColor: '#ffffff',
                  color: '#111827',
                  outline: 'none',
                  transition: 'all 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#1555D6'
                  e.target.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#d1d5db'
                  e.target.style.boxShadow = 'none'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9ca3af',
                  padding: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {/* Link Esqueceu Senha */}
          <div style={{ textAlign: 'right', marginBottom: '1.5rem' }}>
            <Link
              href="/reset"
              style={{
                fontSize: '0.875rem',
                color: '#1555D6',
                textDecoration: 'none',
                fontWeight: '500'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#0B2A6B'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#1555D6'}
            >
              Esqueceu sua senha?
            </Link>
          </div>

          {/* Botão Entrar */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.875rem 1.5rem',
              fontSize: '0.95rem',
              fontWeight: '600',
              color: '#ffffff',
              backgroundColor: loading ? '#93c5fd' : '#1555D6',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              marginBottom: '1.5rem'
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#0B2A6B'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#1555D6'
                e.currentTarget.style.transform = 'translateY(0)'
              }
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          {/* Box de Exemplo */}
          <div 
            style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
            }}
          >
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 0.5rem 0', fontWeight: '600' }}>
              Exemplo:
            </p>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0.25rem 0' }}>
              E-mail: <span style={{ fontWeight: '500' }}>seu@email.com</span>
            </p>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0.25rem 0' }}>
              Senha: <span style={{ fontWeight: '500' }}>admin123</span>
            </p>
          </div>
        </form>

        {/* Footer */}
        <p 
          style={{
            marginTop: '2rem',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: '#9ca3af'
          }}
        >
          © {new Date().getFullYear()} SodCapital. Todos os direitos reservados.
        </p>
      </div>
    </div>
  )
}
