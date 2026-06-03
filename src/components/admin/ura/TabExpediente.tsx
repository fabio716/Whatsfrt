"use client"

import { useState, useEffect } from "react"

type BusinessHour = {
  dayOfWeek: number
  isClosed: boolean
  openTime: string
  closeTime: string
  hasLunchBreak: boolean
  lunchStart: string
  lunchEnd: string
}

type Messages = {
  greetingText: string
  outOfOfficeMessage: string
  lunchMessage: string
  askNameMessage: string
  askProfileMessage: string
  askSectorMessage: string
}

const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]

export default function TabExpediente() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>([])
  const [messages, setMessages] = useState<Messages>({
    greetingText: "",
    outOfOfficeMessage: "",
    lunchMessage: "",
    askNameMessage: "",
    askProfileMessage: "",
    askSectorMessage: "",
  })

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const res = await fetch("/api/admin/ura/config")
      const data = await res.json()
      if (data.businessHours) setBusinessHours(data.businessHours)
      if (data.greetingText) {
        setMessages({
          greetingText: data.greetingText,
          outOfOfficeMessage: data.outOfOfficeMessage,
          lunchMessage: data.lunchMessage,
          askNameMessage: data.askNameMessage,
          askProfileMessage: data.askProfileMessage,
          askSectorMessage: data.askSectorMessage,
        })
      }
    } catch (err) {
      console.error("Error loading config:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/ura/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessHours, messages }),
      })
      if (res.ok) {
        alert("✅ Configuração salva com sucesso!")
      } else {
        alert("❌ Erro ao salvar configuração")
      }
    } catch (err) {
      console.error("Error saving:", err)
      alert("❌ Erro ao salvar configuração")
    } finally {
      setSaving(false)
    }
  }

  const updateHour = (dayOfWeek: number, field: keyof BusinessHour, value: any) => {
    setBusinessHours((prev) =>
      prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h))
    )
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Carregando...</div>
  }

  return (
    <div className="space-y-8">
      {/* Horários de Funcionamento */}
      <div className="bg-white rounded-2xl shadow-sm p-8">
        <h2 className="text-xl font-light text-gray-900 mb-6">Horários de Funcionamento</h2>
        
        <div className="space-y-4">
          {businessHours.map((hour) => (
            <div key={hour.dayOfWeek} className="flex items-center gap-6 py-4 border-b border-gray-100 last:border-0">
              <div className="w-32">
                <span className="text-sm font-medium text-gray-900">{DAY_NAMES[hour.dayOfWeek]}</span>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={hour.isClosed}
                  onChange={(e) => updateHour(hour.dayOfWeek, "isClosed", e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-600">Fechado</span>
              </label>

              {!hour.isClosed && (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={hour.openTime}
                      onChange={(e) => updateHour(hour.dayOfWeek, "openTime", e.target.value)}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <span className="text-gray-400">até</span>
                    <input
                      type="time"
                      value={hour.closeTime}
                      onChange={(e) => updateHour(hour.dayOfWeek, "closeTime", e.target.value)}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hour.hasLunchBreak}
                      onChange={(e) => updateHour(hour.dayOfWeek, "hasLunchBreak", e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-600">Almoço</span>
                  </label>

                  {hour.hasLunchBreak && (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={hour.lunchStart}
                        onChange={(e) => updateHour(hour.dayOfWeek, "lunchStart", e.target.value)}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <span className="text-gray-400">-</span>
                      <input
                        type="time"
                        value={hour.lunchEnd}
                        onChange={(e) => updateHour(hour.dayOfWeek, "lunchEnd", e.target.value)}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mensagens */}
      <div className="bg-white rounded-2xl shadow-sm p-8">
        <h2 className="text-xl font-light text-gray-900 mb-6">Mensagens Personalizadas</h2>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Mensagem de Boas-vindas</label>
            <textarea
              value={messages.greetingText}
              onChange={(e) => setMessages({ ...messages, greetingText: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              placeholder="Olá! 👋 Como podemos te ajudar?"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Mensagem Fora do Expediente</label>
            <textarea
              value={messages.outOfOfficeMessage}
              onChange={(e) => setMessages({ ...messages, outOfOfficeMessage: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              placeholder="No momento estamos fora do horário de atendimento..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Mensagem de Almoço</label>
            <textarea
              value={messages.lunchMessage}
              onChange={(e) => setMessages({ ...messages, lunchMessage: e.target.value })}
              rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              placeholder="Estamos em horário de almoço..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Solicitar Nome</label>
            <input
              type="text"
              value={messages.askNameMessage}
              onChange={(e) => setMessages({ ...messages, askNameMessage: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Por favor, digite seu nome completo:"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Solicitar Perfil (PF/PJ)</label>
            <input
              type="text"
              value={messages.askProfileMessage}
              onChange={(e) => setMessages({ ...messages, askProfileMessage: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Você é: 1️⃣ Pessoa Física 2️⃣ Pessoa Jurídica"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Solicitar Setor</label>
            <textarea
              value={messages.askSectorMessage}
              onChange={(e) => setMessages({ ...messages, askSectorMessage: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              placeholder="Qual setor deseja? 1️⃣ Financeiro 2️⃣ Suporte 3️⃣ Vendas"
            />
          </div>
        </div>
      </div>

      {/* Botão Salvar */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Salvando..." : "💾 Salvar Configurações"}
        </button>
      </div>
    </div>
  )
}
