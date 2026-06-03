"use client"

import { useState, useEffect } from "react"

type NightOffer = {
  isActive: boolean
  couponCode: string
  discountType: "percentage" | "fixed"
  discountValue: number
  storeUrl: string
  offerMessage: string
}

export default function TabFluxoNoturno() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [offer, setOffer] = useState<NightOffer>({
    isActive: false,
    couponCode: "",
    discountType: "percentage",
    discountValue: 0,
    storeUrl: "",
    offerMessage: "🎁 Oferta especial! Use o cupom {coupon} e ganhe {discount} de desconto!\n\nAcesse: {url}",
  })

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const res = await fetch("/api/admin/ura/config")
      const data = await res.json()
      if (data.nightOffer) {
        setOffer(data.nightOffer)
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
        body: JSON.stringify({ nightOffer: offer }),
      })
      if (res.ok) {
        alert("✅ Oferta noturna salva com sucesso!")
      } else {
        alert("❌ Erro ao salvar oferta")
      }
    } catch (err) {
      console.error("Error saving:", err)
      alert("❌ Erro ao salvar oferta")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Carregando...</div>
  }

  return (
    <div className="space-y-8">
      {/* Ativação */}
      <div className="bg-white rounded-2xl shadow-sm p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-light text-gray-900">Oferta Noturna</h2>
            <p className="text-sm text-gray-500 mt-1">
              Envie cupons de desconto automaticamente para leads de vendas fora do expediente
            </p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <span className="text-sm font-medium text-gray-700">
              {offer.isActive ? "Ativado" : "Desativado"}
            </span>
            <div className="relative">
              <input
                type="checkbox"
                checked={offer.isActive}
                onChange={(e) => setOffer({ ...offer, isActive: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-14 h-8 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-gray-900"></div>
            </div>
          </label>
        </div>

        {offer.isActive && (
          <div className="space-y-6 pt-6 border-t border-gray-100">
            {/* Cupom */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Código do Cupom</label>
              <input
                type="text"
                value={offer.couponCode}
                onChange={(e) => setOffer({ ...offer, couponCode: e.target.value.toUpperCase() })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="BEMVINDO10"
              />
            </div>

            {/* Tipo de Desconto */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Desconto</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={offer.discountType === "percentage"}
                    onChange={() => setOffer({ ...offer, discountType: "percentage" })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-700">Percentual (%)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={offer.discountType === "fixed"}
                    onChange={() => setOffer({ ...offer, discountType: "fixed" })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-700">Valor Fixo (R$)</span>
                </label>
              </div>
            </div>

            {/* Valor do Desconto */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Valor do Desconto {offer.discountType === "percentage" ? "(%)" : "(R$)"}
              </label>
              <input
                type="number"
                value={offer.discountValue}
                onChange={(e) => setOffer({ ...offer, discountValue: Number(e.target.value) })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder={offer.discountType === "percentage" ? "10" : "50.00"}
                step={offer.discountType === "percentage" ? "1" : "0.01"}
              />
            </div>

            {/* URL da Loja */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">URL da Loja/Site</label>
              <input
                type="url"
                value={offer.storeUrl}
                onChange={(e) => setOffer({ ...offer, storeUrl: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="https://sualoja.com.br"
              />
            </div>

            {/* Mensagem Personalizada */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mensagem da Oferta</label>
              <textarea
                value={offer.offerMessage}
                onChange={(e) => setOffer({ ...offer, offerMessage: e.target.value })}
                rows={5}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none font-mono"
                placeholder="Use {coupon}, {discount} e {url} como variáveis"
              />
              <p className="text-xs text-gray-500 mt-2">
                <strong>Variáveis disponíveis:</strong> {"{coupon}"} = código do cupom, {"{discount}"} = valor do desconto, {"{url}"} = URL da loja
              </p>
            </div>

            {/* Preview */}
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <p className="text-xs font-medium text-gray-500 mb-2">PREVIEW DA MENSAGEM:</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">
                {offer.offerMessage
                  .replace("{coupon}", offer.couponCode || "[CUPOM]")
                  .replace("{discount}", offer.discountType === "percentage" ? `${offer.discountValue}%` : `R$ ${offer.discountValue.toFixed(2)}`)
                  .replace("{url}", offer.storeUrl || "[URL]")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Botão Salvar */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Salvando..." : "💾 Salvar Oferta"}
        </button>
      </div>
    </div>
  )
}
