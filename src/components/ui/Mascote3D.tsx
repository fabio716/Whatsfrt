"use client"

import { useEffect, useRef } from "react"
import type { Humor } from "@/components/ui/Mascote"

// ─── Mascote da FRT em 3D (personagem fofo, desenhado em código) ─────────────
// Robozinho de proporção "criança": cabeça enorme, olhos grandes e brilhantes,
// bochechas, fone de atendente e antena que brilha, nas cores da FRT (azul-
// marinho e verde). Montado com formas do Three.js — sem arquivo de modelo — e
// animado por código: anda, corre, acena, dança, pula esticando e achatando,
// balança a cabeça (sim/não) e abre a boca quando fala. Vira o corpo pro lado
// que está indo. O Three.js só é baixado quando o mascote aparece; sem WebGL
// chama onErro e quem usa mostra o mascote 2D.

export type Animacao3D = "idle" | "andar" | "correr" | "acenar" | "dancar" | "pular" | "sim" | "nao" | "joinha" | "sentar" | "pedir"

type TH = typeof import("three")

// Juntas animadas (valores atuais e metas), suavizadas a cada quadro.
interface Juntas {
  y: number; rotX: number; rotZ: number; sy: number
  cabX: number; cabY: number; cabZ: number
  braEx: number; braEz: number; braDx: number; braDz: number
  perE: number; perD: number
}
const CHAVES: (keyof Juntas)[] = ["y", "rotX", "rotZ", "sy", "cabX", "cabY", "cabZ", "braEx", "braEz", "braDx", "braDz", "perE", "perD"]
const REPOUSO: Juntas = { y: 0, rotX: 0, rotZ: 0, sy: 1, cabX: 0, cabY: 0, cabZ: 0, braEx: 0, braEz: 0.22, braDx: 0, braDz: -0.22, perE: 0, perD: 0 }

// Pose de cada animação no instante t (segundos).
function pose(anim: Animacao3D, t: number): Juntas {
  const j: Juntas = { ...REPOUSO }
  const respira = Math.sin(t * 2.2)
  j.sy = 1 + respira * 0.012
  j.y = Math.sin(t * 2) * 0.015
  j.cabZ = Math.sin(t * 0.9) * 0.05
  j.braEz = 0.22 + Math.sin(t * 1.7) * 0.03
  j.braDz = -0.22 - Math.sin(t * 1.7 + 1) * 0.03
  switch (anim) {
    case "andar": {
      const w = t * 6
      j.perE = Math.sin(w) * 0.55; j.perD = -Math.sin(w) * 0.55
      j.braEx = -Math.sin(w) * 0.5; j.braDx = Math.sin(w) * 0.5
      j.y = Math.abs(Math.sin(w)) * 0.07; j.rotX = 0.05; j.rotZ = Math.sin(w) * 0.03
      j.cabZ = Math.sin(w) * 0.04
      break
    }
    case "correr": {
      const w = t * 12
      j.perE = Math.sin(w) * 1.0; j.perD = -Math.sin(w) * 1.0
      j.braEx = -Math.sin(w) * 1.0; j.braDx = Math.sin(w) * 1.0
      j.braEz = 0.35; j.braDz = -0.35
      j.y = Math.abs(Math.sin(w)) * 0.17; j.rotX = 0.2; j.rotZ = Math.sin(w) * 0.06
      j.cabX = -0.1; j.cabZ = Math.sin(w) * 0.07
      break
    }
    case "acenar":
      j.braDz = 2.3 + Math.sin(t * 9) * 0.35; j.braDx = 0
      j.cabZ = 0.1 + Math.sin(t * 2) * 0.03; j.y = Math.abs(Math.sin(t * 3)) * 0.02
      break
    case "pedir":
      j.braEx = -1.1; j.braDx = -1.1; j.braEz = 0.35; j.braDz = -0.35
      j.braEx += Math.sin(t * 14) * 0.06; j.braDx += Math.sin(t * 14 + 1) * 0.06
      j.cabX = 0.1; j.cabZ = 0.12 + Math.sin(t * 2) * 0.04
      break
    case "dancar": {
      const w = t * 6.5
      j.y = Math.abs(Math.sin(w)) * 0.12; j.rotZ = Math.sin(w) * 0.13
      j.braEz = 2.0 + Math.sin(w) * 0.5; j.braDz = -(2.0 + Math.sin(w + Math.PI) * 0.5)
      j.perE = Math.sin(w) * 0.3; j.perD = -Math.sin(w) * 0.3
      j.cabZ = Math.sin(w) * 0.16; j.cabY = Math.sin(w * 0.5) * 0.2
      break
    }
    case "pular": {
      const p = (t * 2.0) % 1
      const ar = Math.sin(p * Math.PI)
      j.y = ar * 0.6
      j.sy = p < 0.14 ? 0.84 : p > 0.86 ? 0.88 : 1.07
      j.braEz = 2.1 * ar + 0.22; j.braDz = -2.1 * ar - 0.22
      j.perE = ar * 0.3; j.perD = -ar * 0.3
      break
    }
    case "sim": j.cabX = Math.sin(t * 7) * 0.28; break
    case "nao": j.cabY = Math.sin(t * 8) * 0.42; break
    case "joinha": j.braDx = -1.4; j.braDz = -0.5; j.cabZ = 0.08; break
    case "sentar":
      j.y = -0.1; j.sy = 0.82; j.perE = -1.3; j.perD = -1.3; j.cabX = 0.15 + respira * 0.02
      j.braEz = 0.5; j.braDz = -0.5
      break
    default: break
  }
  return j
}

// Rosto de cada humor (metas suavizadas).
interface Rosto {
  olho: "aberto" | "feliz" | "dorme"
  abertura: number; inclina: number; olhaX: number; olhaY: number; brilho: number
  boca: "sorriso" | "triste" | "reta"; abre: number; bochecha: number; suor: number; cabZ: number
}
function rosto(h: Humor): Rosto {
  const base: Rosto = { olho: "aberto", abertura: 1, inclina: 0, olhaX: 0, olhaY: 0, brilho: 1, boca: "sorriso", abre: 0, bochecha: 1, suor: 0, cabZ: 0 }
  switch (h) {
    case "feliz": return { ...base, olho: "feliz", abre: 0.45, bochecha: 1.25 }
    case "comemorando": return { ...base, olho: "feliz", abre: 0.9, bochecha: 1.4 }
    case "dormindo": return { ...base, olho: "dorme", boca: "reta", bochecha: 0.9 }
    case "surpreso": return { ...base, abertura: 1.3, boca: "reta", abre: 0.85, bochecha: 0.7 }
    case "preocupado": return { ...base, abertura: 0.92, inclina: 0.3, boca: "triste", suor: 1, bochecha: 0.6 }
    case "pedindo": return { ...base, abertura: 1.32, brilho: 1.7, abre: 0.25, bochecha: 1.35, inclina: -0.08 }
    case "pensando": return { ...base, abertura: 0.92, olhaX: 0.07, olhaY: 0.06, boca: "reta", cabZ: 0.1, bochecha: 0.9 }
    default: return base
  }
}

export default function Mascote3D({
  className = "h-56 w-40",
  animacao = "idle",
  humor = "feliz",
  falando = false,
  direcao = null,
  tempoFixo,
  pronto,
  onErro,
}: Readonly<{
  className?: string
  animacao?: Animacao3D
  humor?: Humor
  falando?: boolean
  direcao?: "esq" | "dir" | null
  // Só para gravar vídeo: congela a animação neste instante (segundos).
  tempoFixo?: number
  pronto?: () => void
  onErro?: () => void
}>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const estado = useRef<{ animacao: Animacao3D; humor: Humor; falando: boolean; direcao: "esq" | "dir" | null; tempoFixo?: number }>({ animacao, humor, falando, direcao, tempoFixo })
  const cbRef = useRef({ pronto, onErro })

  // O laço de desenho lê daqui, sem recriar a cena a cada mudança.
  useEffect(() => {
    estado.current = { animacao, humor, falando, direcao, tempoFixo }
    cbRef.current = { pronto, onErro }
  }, [animacao, humor, falando, direcao, tempoFixo, pronto, onErro])

  useEffect(() => {
    let cancelado = false
    let limpar: () => void = () => {}

    void (async () => {
      try {
        const T: TH = await import("three")
        const canvas = canvasRef.current
        if (cancelado || !canvas) return

        const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.setClearColor(0x000000, 0)
        const cena = new T.Scene()
        const camera = new T.PerspectiveCamera(30, 1, 0.1, 50)
        camera.position.set(0, 1.75, 7.2)
        camera.lookAt(0, 1.55, 0)

        cena.add(new T.HemisphereLight(0xffffff, 0xb6c6e2, 1.55))
        const sol = new T.DirectionalLight(0xffffff, 2.1)
        sol.position.set(3, 6, 6)
        cena.add(sol)
        const contra = new T.DirectionalLight(0x9ad7ff, 1.3)
        contra.position.set(-4, 3, -3)
        cena.add(contra)

        // ── Materiais ──
        const fis = (cor: number, rug: number, verniz: number) => new T.MeshPhysicalMaterial({ color: cor, roughness: rug, clearcoat: verniz, clearcoatRoughness: 0.28 })
        const casca = fis(0xeef4ff, 0.38, 0.75)
        const azul = fis(0x0b3f8a, 0.42, 0.55)
        const azulEsc = fis(0x082f68, 0.45, 0.4)
        const verde = fis(0x00bf5b, 0.46, 0.45)
        const tela = new T.MeshPhysicalMaterial({ color: 0x07193a, roughness: 0.12, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 })
        const luz = (cor: number) => new T.MeshBasicMaterial({ color: cor })
        const olhoM = luz(0x4dffa0)
        const brilhoM = luz(0xffffff)
        const bocaM = luz(0x4dffa0)
        const dentroM = luz(0x02101f)
        const linguaM = luz(0xff7aa8)
        const blushM = new T.MeshBasicMaterial({ color: 0xff7aa8, transparent: true, opacity: 0.6, depthWrite: false })
        const suorM = new T.MeshPhysicalMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.92, roughness: 0.1 })
        const antenaM = new T.MeshStandardMaterial({ color: 0x00d96a, emissive: 0x00d96a, emissiveIntensity: 1.3, roughness: 0.3 })

        const esfera = (r: number, m: import("three").Material, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0) => {
          const o = new T.Mesh(new T.SphereGeometry(r, 32, 24), m)
          o.scale.set(sx, sy, sz); o.position.set(x, y, z)
          return o
        }

        // Placa do peito: "FRT" com a ondinha verde, numa faixa curva do corpo.
        const tex = document.createElement("canvas")
        tex.width = 256; tex.height = 160
        const g = tex.getContext("2d")
        if (g) {
          g.fillStyle = "#ffffff"; g.beginPath(); g.roundRect(6, 6, 244, 148, 34); g.fill()
          g.strokeStyle = "#00bf5b"; g.lineWidth = 12; g.lineCap = "round"
          g.beginPath(); g.moveTo(78, 62); g.quadraticCurveTo(103, 40, 128, 58); g.quadraticCurveTo(153, 76, 178, 54); g.stroke()
          g.fillStyle = "#002d6b"; g.font = "900 62px Arial, Helvetica, sans-serif"; g.textAlign = "center"; g.fillText("FRT", 128, 128)
        }
        const placaTex = new T.CanvasTexture(tex)
        placaTex.colorSpace = T.SRGBColorSpace
        const placaM = new T.MeshPhysicalMaterial({ map: placaTex, transparent: true, roughness: 0.4, clearcoat: 0.4, side: T.DoubleSide })

        // ── Personagem ──
        const raiz = new T.Group()
        const corpoG = new T.Group()
        raiz.add(corpoG); cena.add(raiz)

        const pernaG = (x: number) => {
          const p = new T.Group(); p.position.set(x, 0.55, 0)
          const coxa = new T.Mesh(new T.CylinderGeometry(0.12, 0.13, 0.4, 16), azulEsc); coxa.position.y = -0.2
          const pe = esfera(0.2, azul, 1.12, 0.62, 1.5, 0, -0.46, 0.12)
          const sola = esfera(0.2, verde, 1.06, 0.2, 1.46, 0, -0.57, 0.12)
          p.add(coxa, pe, sola)
          return p
        }
        const pernaE = pernaG(-0.3); const pernaD = pernaG(0.3)
        corpoG.add(pernaE, pernaD)

        const torso = esfera(0.62, azul, 1, 1.05, 0.88, 0, 0.98, 0)
        corpoG.add(torso)
        const placa = new T.Mesh(new T.CylinderGeometry(0.565, 0.565, 0.4, 28, 1, true, -0.5, 1.0), placaM)
        placa.position.set(0, 0.95, 0)
        corpoG.add(placa)
        const pescoco = new T.Mesh(new T.CylinderGeometry(0.16, 0.2, 0.18, 16), verde); pescoco.position.y = 1.52
        corpoG.add(pescoco)

        const bracoG = (x: number) => {
          const b = new T.Group(); b.position.set(x, 1.12, 0)
          const cap = new T.Mesh(new T.CapsuleGeometry(0.12, 0.26, 6, 14), verde); cap.position.y = -0.22
          const mao = esfera(0.16, casca, 1, 1, 1, 0, -0.52, 0)
          b.add(cap, mao)
          return b
        }
        const bracoE = bracoG(-0.64); const bracoD = bracoG(0.64)
        corpoG.add(bracoE, bracoD)

        // Cabeça
        const cabeca = new T.Group(); cabeca.position.set(0, 1.98, 0)
        corpoG.add(cabeca)
        cabeca.add(esfera(0.78, casca, 1.2, 0.95, 1.02))
        cabeca.add(esfera(0.6, tela, 1.05, 0.78, 0.3, 0, 0.03, 0.7))
        // fone de atendente
        for (const sx of [-1, 1]) {
          cabeca.add(esfera(0.2, verde, 0.55, 1, 1, sx * 0.95, 0, 0))
          cabeca.add(esfera(0.12, azul, 0.4, 1, 1, sx * 1.02, 0, 0))
        }
        const faixa = new T.Mesh(new T.TorusGeometry(0.95, 0.035, 10, 48, Math.PI), verde)
        faixa.scale.set(1, 0.8, 1)
        cabeca.add(faixa)
        // antena que brilha
        const haste = new T.Mesh(new T.CylinderGeometry(0.028, 0.028, 0.32, 10), azulEsc); haste.position.y = 0.84
        const bola = esfera(0.1, antenaM, 1, 1, 1, 0, 1.04, 0)
        const halo = esfera(0.17, new T.MeshBasicMaterial({ color: 0x4dffa0, transparent: true, opacity: 0.22, depthWrite: false }), 1, 1, 1, 0, 1.04, 0)
        cabeca.add(haste, bola, halo)

        // Rosto: olhos abertos (com brilho), olhos felizes (^ ^), olhos dormindo (∪ ∪)
        const olhos = new T.Group(); olhos.position.set(0, 0.1, 0.87)
        cabeca.add(olhos)
        const olhoAberto: import("three").Group[] = []
        const arcoFeliz: import("three").Mesh[] = []
        const arcoDorme: import("three").Mesh[] = []
        const brilhos: import("three").Mesh[] = []
        for (const sx of [-1, 1]) {
          const og = new T.Group(); og.position.x = sx * 0.27
          og.add(esfera(0.13, olhoM, 0.82, 1.16, 0.5))
          const b1 = esfera(0.052, brilhoM, 1, 1, 1, 0.05, 0.07, 0.07)
          const b2 = esfera(0.026, brilhoM, 1, 1, 1, -0.05, -0.06, 0.07)
          og.add(b1, b2); brilhos.push(b1, b2)
          olhos.add(og); olhoAberto.push(og)
          const arco = new T.Mesh(new T.TorusGeometry(0.1, 0.026, 8, 24, Math.PI), olhoM); arco.position.set(sx * 0.27, -0.03, 0)
          olhos.add(arco); arcoFeliz.push(arco)
          const arcoD = new T.Mesh(new T.TorusGeometry(0.1, 0.026, 8, 24, Math.PI), olhoM); arcoD.position.set(sx * 0.27, 0.04, 0); arcoD.rotation.z = Math.PI
          olhos.add(arcoD); arcoDorme.push(arcoD)
        }
        const blush: import("three").Mesh[] = []
        for (const sx of [-1, 1]) { const b = esfera(0.1, blushM, 1.5, 0.8, 0.2, sx * 0.5, -0.15, 0.8); cabeca.add(b); blush.push(b) }
        // boca: sorriso (arco), aberta (elipse escura com língua)
        const sorriso = new T.Mesh(new T.TorusGeometry(0.14, 0.024, 8, 24, Math.PI), bocaM)
        sorriso.rotation.z = Math.PI; sorriso.position.set(0, -0.06, 0.86)
        cabeca.add(sorriso)
        const abertaG = new T.Group(); abertaG.position.set(0, -0.14, 0.87)
        const rim = esfera(0.105, bocaM, 1.4, 1, 0.3)
        const dentro = esfera(0.087, dentroM, 1.4, 1, 0.3, 0, 0, 0.012)
        const lingua = esfera(0.05, linguaM, 1.3, 0.7, 0.3, 0, -0.04, 0.025)
        abertaG.add(rim, dentro, lingua)
        cabeca.add(abertaG)
        const suor = esfera(0.07, suorM, 0.8, 1.2, 0.6, 0.66, 0.36, 0.62)
        cabeca.add(suor)

        // ── Câmera e tamanho ──
        const ajustar = () => {
          const w = canvas.clientWidth || 160
          const h = canvas.clientHeight || 224
          renderer.setSize(w, h, false)
          camera.aspect = w / h
          camera.updateProjectionMatrix()
        }
        ajustar()
        const obs = new ResizeObserver(ajustar)
        obs.observe(canvas)

        // ── Laço de animação ──
        const relogio = new T.Clock()
        const J: Juntas = { ...REPOUSO }
        const R = { abertura: 1, inclina: 0, olhaX: 0, olhaY: 0, brilho: 1, abre: 0, bochecha: 1, suor: 0, cabZ: 0, mFeliz: 0, mDorme: 0, mAberto: 1, mTriste: 0, mReta: 0 }
        let rotY = 0
        let t = 0
        renderer.setAnimationLoop(() => {
          let dt = Math.min(0.05, relogio.getDelta())
          const e = estado.current
          if (e.tempoFixo !== undefined) { t = e.tempoFixo; dt = 1 } else t += dt
          const alvo = pose(e.animacao, t)
          const k = Math.min(1, dt * 14)
          for (const c of CHAVES) J[c] += (alvo[c] - J[c]) * k

          // corpo
          corpoG.position.y = J.y
          corpoG.rotation.set(J.rotX, 0, J.rotZ)
          corpoG.scale.set(1 / Math.sqrt(J.sy), J.sy, 1 / Math.sqrt(J.sy))
          pernaE.rotation.x = J.perE; pernaD.rotation.x = J.perD
          bracoE.rotation.set(J.braEx, 0, J.braEz); bracoD.rotation.set(J.braDx, 0, J.braDz)

          // vira o corpo pro lado que está indo (visão 3/4, mais fofa)
          const alvoRot = e.direcao === "dir" ? 0.62 : e.direcao === "esq" ? -0.62 : 0
          rotY += (alvoRot - rotY) * Math.min(1, dt * 9)
          raiz.rotation.y = rotY

          // rosto
          const f = rosto(e.humor)
          const kr = Math.min(1, dt * 11)
          const piscada = (() => { const b = t % 3.6; return b > 3.4 ? Math.sin(((b - 3.4) / 0.2) * Math.PI) : 0 })()
          R.abertura += (f.abertura - R.abertura) * kr
          R.inclina += (f.inclina - R.inclina) * kr
          R.olhaX += (f.olhaX - R.olhaX) * kr; R.olhaY += (f.olhaY - R.olhaY) * kr
          R.brilho += (f.brilho - R.brilho) * kr
          R.bochecha += (f.bochecha - R.bochecha) * kr
          R.suor += (f.suor - R.suor) * kr
          R.cabZ += (f.cabZ - R.cabZ) * kr
          cabeca.rotation.set(J.cabX, J.cabY, J.cabZ + R.cabZ)
          cabeca.position.y = 1.98 + Math.sin(t * 2) * 0.01

          const abre = e.falando && f.abre < 0.3 ? 0.18 + (Math.sin(t * 15) * 0.5 + 0.5) * 0.6 : f.abre
          R.abre += (abre - R.abre) * Math.min(1, dt * 18)
          R.mFeliz += ((f.olho === "feliz" ? 1 : 0) - R.mFeliz) * kr
          R.mDorme += ((f.olho === "dorme" ? 1 : 0) - R.mDorme) * kr
          const abertos = Math.max(0, 1 - R.mFeliz - R.mDorme)

          olhos.position.set(R.olhaX, 0.1 + R.olhaY, 0.87)
          olhoAberto.forEach((og, i) => {
            const lado = i === 0 ? -1 : 1
            og.visible = abertos > 0.5
            og.scale.set(R.abertura * 0.95 + 0.05, Math.max(0.06, R.abertura * (1 - piscada * 0.92)), 1)
            og.rotation.z = lado * R.inclina * -1
          })
          arcoFeliz.forEach((a) => { a.visible = R.mFeliz > 0.5 })
          arcoDorme.forEach((a) => { a.visible = R.mDorme > 0.5 })
          brilhos.forEach((b) => b.scale.setScalar(R.brilho))

          blush.forEach((b) => b.scale.set(1.5 * R.bochecha, 0.8 * R.bochecha, 0.2))
          const aberta = R.abre > 0.08
          abertaG.visible = aberta
          abertaG.scale.set(1 + R.abre * 0.2, 0.25 + R.abre * 1.1, 1)
          sorriso.visible = !aberta
          sorriso.scale.set(1, f.boca === "reta" ? 0.12 : f.boca === "triste" ? -1 : 1, 1)
          sorriso.position.y = f.boca === "triste" ? -0.16 : -0.06
          suor.visible = R.suor > 0.1
          suor.position.y = 0.4 - ((t * 0.5) % 1) * 0.3 * R.suor
          suor.scale.setScalar(R.suor > 0.1 ? 1 : 0.01)
          antenaM.emissiveIntensity = 1.1 + Math.sin(t * 4) * 0.5
          halo.scale.setScalar(1 + Math.sin(t * 4) * 0.18)

          renderer.render(cena, camera)
        })
        cbRef.current.pronto?.()

        limpar = () => {
          renderer.setAnimationLoop(null)
          obs.disconnect()
          cena.traverse((o) => {
            const m = o as import("three").Mesh
            if (!m.isMesh) return
            m.geometry.dispose()
            const ms = Array.isArray(m.material) ? m.material : [m.material]
            for (const x of ms) x.dispose()
          })
          placaTex.dispose()
          renderer.dispose()
        }
      } catch {
        if (!cancelado) cbRef.current.onErro?.()
      }
    })()

    return () => { cancelado = true; limpar() }
  }, [])

  return <canvas ref={canvasRef} className={`${className} block shrink-0`} aria-hidden />
}
