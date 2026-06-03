"use client"

import { useState } from "react"
import TabExpediente from "@/components/admin/ura/TabExpediente"
import TabFluxoNoturno from "@/components/admin/ura/TabFluxoNoturno"
import TabCooperativas from "@/components/admin/ura/TabCooperativas"
import TabTerritorio from "@/components/admin/ura/TabTerritorio"

// ═══════════════════════════════════════════════════════════════════════════
// Motor da URA - Painel Administrativo (Tesla/Apple-like Design)
// ═══════════════════════════════════════════════════════════════════════════

type TabType = "expediente" | "noturno" | "cooperativas" | "territorio"

export default function UraMotorPage() {
  const [activeTab, setActiveTab] = useState<TabType>("expediente")

  const tabs = [
    { id: "expediente" as const, label: "⏰ Expediente", icon: "🕐" },
    { id: "noturno" as const, label: "🌙 Fluxo Noturno", icon: "🌙" },
    { id: "cooperativas" as const, label: "🏢 B2B / Cooperativas", icon: "🏢" },
    { id: "territorio" as const, label: "🗺️ Geográfico", icon: "🗺️" },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <h1 className="text-3xl font-light text-gray-900">Motor da URA</h1>
          <p className="text-sm text-gray-500 mt-1">Atendimento Automático e Triagem Inteligente</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6 mt-8">
        <div className="flex space-x-1 bg-white rounded-2xl p-1 shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200
                ${activeTab === tab.id
                  ? "bg-gray-900 text-white shadow-md"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }
              `}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="mt-8">
          {activeTab === "expediente" && <TabExpediente />}
          {activeTab === "noturno" && <TabFluxoNoturno />}
          {activeTab === "cooperativas" && <TabCooperativas />}
          {activeTab === "territorio" && <TabTerritorio />}
        </div>
      </div>
    </div>
  )
}
