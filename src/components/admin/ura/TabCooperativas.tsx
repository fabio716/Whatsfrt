"use client"

import { useState, useEffect } from "react"

type User = {
  id: string
  name: string
  email: string
}

type Cooperative = {
  id: string
  name: string
  cnpjBase: string | null
  isActive: boolean
  assignedUserId: string | null
  assignedUser: User | null
}

export default function TabCooperativas() {
  const [loading, setLoading] = useState(true)
  const [cooperatives, setCooperatives] = useState<Cooperative[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newCoop, setNewCoop] = useState({ name: "", cnpjBase: "", assignedUserId: "" })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [coopRes, usersRes] = await Promise.all([
        fetch("/api/admin/ura/cooperatives"),
        fetch("/api/admin/users"),
      ])
      const coopData = await coopRes.json()
      const usersData = await usersRes.json()
      setCooperatives(coopData)
      setUsers(usersData.users || [])
    } catch (err) {
      console.error("Error loading data:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newCoop.name) return
    try {
      const res = await fetch("/api/admin/ura/cooperatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCoop),
      })
      if (res.ok) {
        setNewCoop({ name: "", cnpjBase: "", assignedUserId: "" })
        setCreating(false)
        await loadData()
      }
    } catch (err) {
      console.error("Error creating:", err)
    }
  }

  const handleUpdate = async (id: string, data: Partial<Cooperative>) => {
    try {
      const res = await fetch(`/api/admin/ura/cooperatives/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        setEditing(null)
        await loadData()
      }
    } catch (err) {
      console.error("Error updating:", err)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente deletar esta cooperativa?")) return
    try {
      const res = await fetch(`/api/admin/ura/cooperatives/${id}`, { method: "DELETE" })
      if (res.ok) await loadData()
    } catch (err) {
      console.error("Error deleting:", err)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-light text-gray-900">Cooperativas B2B</h2>
            <p className="text-sm text-gray-500 mt-1">
              Vincule consultores B2B a cooperativas específicas
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            + Nova Cooperativa
          </button>
        </div>
      </div>

      {/* Criar Nova */}
      {creating && (
        <div className="bg-white rounded-2xl shadow-sm p-8 border-2 border-gray-900">
          <h3 className="text-lg font-medium text-gray-900 mb-6">Nova Cooperativa</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nome *</label>
              <input
                type="text"
                value={newCoop.name}
                onChange={(e) => setNewCoop({ ...newCoop, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="Sicoob, Sicredi, etc"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">CNPJ Base</label>
              <input
                type="text"
                value={newCoop.cnpjBase}
                onChange={(e) => setNewCoop({ ...newCoop, cnpjBase: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="00000000 (opcional)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Consultor B2B</label>
              <select
                value={newCoop.assignedUserId}
                onChange={(e) => setNewCoop({ ...newCoop, assignedUserId: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Sem atribuição</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800"
            >
              Criar
            </button>
            <button
              onClick={() => {
                setCreating(false)
                setNewCoop({ name: "", cnpjBase: "", assignedUserId: "" })
              }}
              className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">CNPJ Base</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Consultor B2B</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cooperatives.map((coop) => (
              <tr key={coop.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{coop.name}</td>
                <td className="px-6 py-4 text-sm text-gray-600 font-mono">{coop.cnpjBase || "-"}</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {editing === coop.id ? (
                    <select
                      defaultValue={coop.assignedUserId || ""}
                      onChange={(e) => handleUpdate(coop.id, { assignedUserId: e.target.value || null })}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="">Sem atribuição</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  ) : (
                    coop.assignedUser?.name || <span className="text-gray-400">Não atribuído</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${coop.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                    {coop.isActive ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditing(editing === coop.id ? null : coop.id)}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                    >
                      {editing === coop.id ? "✓" : "✏️"}
                    </button>
                    <button
                      onClick={() => handleDelete(coop.id)}
                      className="px-3 py-1.5 text-sm text-red-600 hover:text-red-800"
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cooperatives.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            Nenhuma cooperativa cadastrada
          </div>
        )}
      </div>
    </div>
  )
}
