"use client"

import { useState, useEffect } from "react"

// Avatar do contato: mostra a foto de perfil do WhatsApp quando existir;
// se não houver foto (ou a URL expirar/falhar), cai pra inicial do nome.
export default function Avatar({
  name,
  photoUrl,
  size = "h-9 w-9",
  fallback = "bg-zinc-200 text-zinc-600 text-[13px] font-semibold",
}: Readonly<{
  name: string
  photoUrl?: string | null
  size?: string
  fallback?: string
}>) {
  const [error, setError] = useState(false)
  // Se a URL mudar (novo contato selecionado), tenta a imagem de novo.
  useEffect(() => { setError(false) }, [photoUrl])

  const initial = (name?.trim()?.[0] ?? "?").toUpperCase()

  if (photoUrl && !error) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setError(true)}
        className={`${size} flex-shrink-0 rounded-full object-cover`}
      />
    )
  }

  return (
    <span className={`${size} flex flex-shrink-0 items-center justify-center rounded-full ${fallback}`}>
      {initial}
    </span>
  )
}
