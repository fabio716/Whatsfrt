"use client"

import { useState, useRef } from "react"
import Papa from "papaparse"

interface Contact {
  nome: string
  telefone: string
}

interface ImportStats {
  total: number
  duplicados: number
  invalidos: number
  importados: number
}

export default function ImportarPage() {
  const [file, setFile] = useState<File | null>(null)
  const [processing, setProcessing] = useState(false)
  const [preview, setPreview] = useState<Contact[]>([])
  const [stats, setStats] = useState<ImportStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [agente, setAgente] = useState<string>("")
  const fileRef = useRef<HTMLInputElement>(null)

  const normalizePhone = (phone: string): string | null => {
    const digits = phone.replace(/\D/g, "")
    if (!digits) return null

    let number = digits
    if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
      number = digits
    } else if (digits.length === 11 || digits.length === 10) {
      number = `55${digits}`
    } else if (digits.length < 10) {
      return null
    }

    return number
  }

  const findColumn = (headers: string[], aliases: string[]): string | undefined => {
    return headers.find((h) =>
      aliases.some((alias) => h.toLowerCase().includes(alias.toLowerCase()))
    )
  }

  const processCSV = async () => {
    if (!file) return
    setProcessing(true)
    setError(null)
    setPreview([])
    setStats(null)

    try {
      const text = await file.text()
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      })

      const headers = parsed.meta.fields ?? []
      
      // Detecta colunas
      const nameCol = findColumn(headers, ["nome", "name", "first name"])
      const firstNameCol = findColumn(headers, ["first name"])
      const middleNameCol = findColumn(headers, ["middle name"])
      const lastNameCol = findColumn(headers, ["last name", "sobrenome"])
      const phoneCol = findColumn(headers, [
        "telefone", "phone", "celular", "whatsapp",
        "phone 1 - value", "phone 2 - value", "phone 3 - value"
      ])

      if (!phoneCol) {
        throw new Error(`Coluna de telefone não encontrada. Colunas disponíveis: ${headers.join(", ")}`)
      }

      const contacts: Contact[] = []
      const seen = new Set<string>()
      let duplicados = 0
      let invalidos = 0

      for (const row of parsed.data) {
        // Pega nome
        let nome = ""
        if (nameCol && row[nameCol]?.trim()) {
          nome = row[nameCol].trim()
        } else if (firstNameCol || lastNameCol) {
          const parts = [
            row[firstNameCol || ""]?.trim(),
            row[middleNameCol || ""]?.trim(),
            row[lastNameCol || ""]?.trim(),
          ].filter(Boolean)
          nome = parts.join(" ")
        }

        // Pega telefone
        let telefone: string | null = null
        for (let i = 1; i <= 3; i++) {
          const col = `Phone ${i} - Value`
          if (headers.includes(col) && row[col]?.trim()) {
            telefone = normalizePhone(row[col].trim())
            if (telefone) break
          }
        }
        if (!telefone && phoneCol) {
          telefone = normalizePhone(row[phoneCol]?.trim() || "")
        }

        if (!nome || !telefone) {
          invalidos++
          continue
        }

        // Remove duplicados
        if (seen.has(telefone)) {
          duplicados++
          continue
        }

        seen.add(telefone)
        contacts.push({ nome, telefone })
      }

      setPreview(contacts.slice(0, 50)) // Mostra primeiros 50
      setStats({
        total: parsed.data.length,
        duplicados,
        invalidos,
        importados: contacts.length,
      })

      // Salva para importar depois
      ;(window as any).__contactsToImport = contacts
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar CSV")
    } finally {
      setProcessing(false)
    }
  }

  const importContacts = async () => {
    const contacts = (window as any).__contactsToImport as Contact[]
    if (!contacts || contacts.length === 0) return

    setProcessing(true)
    setError(null)

    try {
      // Cria CSV limpo
      const csvContent = [
        "nome,telefone",
        ...contacts.map((c) => `"${c.nome}","${c.telefone}"`),
      ].join("\n")

      const blob = new Blob([csvContent], { type: "text/csv" })
      const formData = new FormData()
      formData.append("file", blob, "contatos_limpos.csv")
      if (agente) formData.append("userId", agente)

      const res = await fetch("/api/admin/contacts/import", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro ao importar")

      alert(`✅ ${data.created} contatos importados com sucesso!`)
      setPreview([])
      setStats(null)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ""
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar")
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">🧹 Importar e Limpar Contatos</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">1. Selecione o arquivo CSV</h2>
        
        <div className="mb-4 p-4 bg-blue-50 rounded border border-blue-200">
          <p className="text-sm text-blue-800 mb-2">
            <strong>Formatos aceitos:</strong>
          </p>
          <ul className="text-sm text-blue-700 list-disc list-inside space-y-1">
            <li>Google Contacts (First Name, Last Name, Phone 1-3 - Value)</li>
            <li>WhatsApp Export</li>
            <li>Formato simples (nome, telefone)</li>
            <li>Excel, Sheets, qualquer CSV</li>
          </ul>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm border rounded p-2 mb-4"
        />

        <button
          onClick={processCSV}
          disabled={!file || processing}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-300"
        >
          {processing ? "Processando..." : "🔍 Analisar e Limpar"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 mb-6">
          <p className="text-red-800">❌ {error}</p>
        </div>
      )}

      {stats && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">📊 Estatísticas</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 p-4 rounded">
              <p className="text-sm text-gray-600">Total no arquivo</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <div className="bg-yellow-50 p-4 rounded">
              <p className="text-sm text-yellow-800">Duplicados removidos</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.duplicados}</p>
            </div>
            <div className="bg-red-50 p-4 rounded">
              <p className="text-sm text-red-800">Inválidos</p>
              <p className="text-2xl font-bold text-red-600">{stats.invalidos}</p>
            </div>
            <div className="bg-green-50 p-4 rounded">
              <p className="text-sm text-green-800">Prontos para importar</p>
              <p className="text-2xl font-bold text-green-600">{stats.importados}</p>
            </div>
          </div>
        </div>
      )}

      {preview.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">👀 Prévia (primeiros 50)</h2>
          <div className="overflow-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Nome</th>
                  <th className="p-2 text-left">Telefone</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{c.nome}</td>
                    <td className="p-2 font-mono text-xs">{c.telefone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 border-t pt-4">
            <h3 className="font-semibold mb-2">2. Atribuir a um agente (opcional)</h3>
            <input
              type="text"
              placeholder="ID do agente (deixe vazio para não atribuir)"
              value={agente}
              onChange={(e) => setAgente(e.target.value)}
              className="border rounded px-3 py-2 w-full max-w-md mb-4"
            />

            <button
              onClick={importContacts}
              disabled={processing}
              className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-300 font-semibold"
            >
              {processing ? "Importando..." : `✅ Importar ${stats?.importados ?? 0} Contatos`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
