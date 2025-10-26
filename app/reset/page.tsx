'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Mail, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ResetPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset/confirm`
      })

      if (resetError) throw resetError

      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar e-mail de redefinição')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-900 via-primary to-primary-900 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-primary">SodCapital</h1>
            <p className="text-gray mt-2">Redefinir Senha</p>
          </div>

          {success ? (
            <div className="text-center space-y-4">
              <div className="bg-success/10 border border-success text-success px-4 py-3 rounded-lg">
                E-mail de redefinição enviado com sucesso!
              </div>
              <p className="text-sm text-gray">
                Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-primary hover:text-primary-900 transition"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar para o login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-6">
              {error && (
                <div className="bg-danger/10 border border-danger text-danger px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <p className="text-sm text-gray">
                Digite seu e-mail para receber instruções de redefinição de senha.
              </p>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="seu@email.com"
                    required
                  />
                </div>
              </div>

              {/* Botões */}
              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary-900 text-white font-medium py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Enviando...' : 'Enviar e-mail de redefinição'}
                </button>

                <Link
                  href="/login"
                  className="flex items-center justify-center gap-2 text-gray hover:text-gray-700 transition text-sm"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar para o login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
