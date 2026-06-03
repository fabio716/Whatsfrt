"use client"

import { useState, useEffect } from "react"

type User = {
  id: string
  name: string
  email: string
}

type Territory = {
  id: string
  uf: string
  isActive: boolean
  assignedUserIds: string[]
  assignedUsers?: User[]
}

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
]

export default function TabTerritorio() {
  const [loading, setLoading] = useState(true)
  const [territories, setTerritories] = useState<Territory[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [creating, setCreating] = useState(false)
  const [newTerritory, setNewTerritory] = useState({ uf: "", assignedUserIds: [] as string[] })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [terrRes, usersRes] = await Promise.all([
        fetch("/api/admin/ura/territories"),
        fetch("/api/admin/users"),
      ])
      const terrData = await terrRes.json()
      const usersData = await usersRes.json()
      setTerritories(terrData)
      setUsers(usersData.users || [])
    } catch (err) {
      console.error("Error loading data:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newTerritory.uf) return
    try {
      const res = await fetch("/api/admin/ura/territories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTerritory),
      })
      if (res.ok) {
        setNewTerritory({ uf: "", assignedUserIds: [] })
        setCreating(false)
        await loadData()
      }
    } catch (err) {
      console.error("Error creating:", err)
    }
  }

  const handleUpdate = async (id: string, data: Partial<Territory>) => {
    try {
      const res = await fetch(`/api/admin/ura/territories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (res.ok) await loadData()
    } catch (err) {
      console.error("Error updating:", err)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente deletar este território?")) return
    try {
      const res = await fetch(`/api/admin/ura/territories/${id}`, { method: "DELETE" })
      if (res.ok) await loadData()
    } catch (err) {
      console.error("Error deleting:", err)
    }
  }

  const toggleUser = (territory: Territory, userId: string) => {
    const newUserIds = territory.assignedUserIds.includes(userId)
      ? territory.assignedUserIds.filter((id) => id !== userId)
      : [...territory.assignedUserIds, userId]
    handleUpdate(territory.id, { assignedUserIds: newUserIds })
  }

  const availableUFs = UFS.filter((uf) => !territories.some((t) => t.uf === uf))

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-light text-gray-900">Territórios Geográficos</h2>
            <p className="text-sm text-gray-500 mt-1">
              Atribua vendedores por estado (UF). Suporta múltiplos vendedores com Round Robin.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            disabled={availableUFs.length === 0}
            className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Novo Território
          </button>
        </div>
      </div>

      {/* Criar Novo */}
      {creating && (
        <div className="bg-white rounded-2xl shadow-sm p-8 border-2 border-gray-900">
          <h3 className="text-lg font-medium text-gray-900 mb-6">Novo Território</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">UF (Estado) *</label>
              <select
                value={newTerritory.uf}
                onChange={(e) => setNewTerritory({ ...newTerritory, uf: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Selecione...</option>
                {availableUFs.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Vendedores</label>
              <div className="flex flex-wrap gap-2">
                {users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={newTerritory.assignedUserIds.includes(u.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewTerritory({ ...newTerritory, assignedUserIds: [...newTerritory.assignedUserIds, u.id] })
                        } else {
                          setNewTerritory({ ...newTerritory, assignedUserIds: newTerritory.assignedUserIds.filter((id) => id !== u.id) })
                        }
                      }}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-gray-700">{u.name}</span>
                  </label>
                ))}
              </div>
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
                setNewTerritory({ uf: "", assignedUserIds: [] })
              }}
              className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Grid de Territórios */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {territories.map((territory) => (
          <div key={territory.id} className="bg-white rounded-2xl shadow-sm p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                  {territory.uf}
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">{territory.uf}</h3>
                  <p className="text-xs text-gray-500">
                    {territory.assignedUserIds.length} vendedor(es)
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDelete(territory.id)}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                🗑️
              </button>
            </div>

            <div className="space-y-2">
              {users.map((user) => (
                <label key={user.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={territory.assignedUserIds.includes(user.id)}
                    onChange={() => toggleUser(territory, user.id)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-gray-700">{user.name}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {territories.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-500">
          Nenhum território cadastrado
        </div>
      )}
    </div>
  )
}
