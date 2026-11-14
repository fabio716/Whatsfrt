"use client"

import { useEffect, useRef } from "react"

// ─── Mascote da FRT em 3D ────────────────────────────────────────────────────
// Robô 3D de verdade (Three.js) que anda, corre, acena, dança e vira o corpo
// para o lado que está indo. Modelo "RobotExpressive" de Tomás Laulhé /
// Quaternius, licença CC0 (uso livre) — ver public/mascote/LICENCA-robo.md —,
// repintado nas cores da FRT. O Three.js só é baixado quando o mascote aparece.
// Se o navegador não tiver WebGL (ou o modelo falhar), chama onErro e quem usa
// mostra o mascote 2D no lugar.

export type Animacao3D = "idle" | "andar" | "correr" | "acenar" | "dancar" | "pular" | "sim" | "nao" | "joinha" | "sentar"
export interface Expressao3D { triste: number; surpreso: number; bravo: number }

const CLIPE: Record<Animacao3D, string> = {
  idle: "Idle", andar: "Walking", correr: "Running", acenar: "Wave", dancar: "Dance",
  pular: "Jump", sim: "Yes", nao: "No", joinha: "ThumbsUp", sentar: "Sitting",
}
const SEM_REPETIR = new Set<Animacao3D>(["sentar", "joinha"])
export const MODELO_3D = "/mascote/robo.glb"

export default function Mascote3D({
  className = "h-48 w-32",
  animacao = "idle",
  expressao = { triste: 0, surpreso: 0, bravo: 0 },
  direcao = null,
  pronto,
  onErro,
}: Readonly<{
  className?: string
  animacao?: Animacao3D
  expressao?: Expressao3D
  direcao?: "esq" | "dir" | null
  pronto?: () => void
  onErro?: () => void
}>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<Animacao3D>(animacao)
  const exprRef = useRef<Expressao3D>(expressao)
  const dirRef = useRef<"esq" | "dir" | null>(direcao)
  const cbRef = useRef({ pronto, onErro })

  // Os valores atuais ficam em refs: o laço de desenho lê daqui sem recriar a cena.
  useEffect(() => {
    animRef.current = animacao
    exprRef.current = expressao
    dirRef.current = direcao
    cbRef.current = { pronto, onErro }
  }, [animacao, expressao, direcao, pronto, onErro])

  useEffect(() => {
    let cancelado = false
    let limpar: () => void = () => {}

    void (async () => {
      try {
        const THREE = await import("three")
        const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js")
        const canvas = canvasRef.current
        if (cancelado || !canvas) return

        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.setClearColor(0x000000, 0)

        const cena = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
        camera.position.set(0, 2.3, 10.2)
        camera.lookAt(0, 2.0, 0)
        cena.add(new THREE.HemisphereLight(0xffffff, 0x7f93ad, 2.6))
        const sol = new THREE.DirectionalLight(0xffffff, 2.8)
        sol.position.set(3, 10, 9)
        cena.add(sol)

        const gltf = await new GLTFLoader().loadAsync(MODELO_3D)
        if (cancelado) { renderer.dispose(); return }
        const modelo = gltf.scene
        cena.add(modelo)

        // Cores da FRT: corpo azul-marinho, juntas verdes. O preto fica.
        modelo.traverse((o) => {
          const m = (o as import("three").Mesh).material as import("three").MeshStandardMaterial | undefined
          if (!m || !("color" in m)) return
          if (m.name === "Main") m.color.set(0x0b3f8a)
          else if (m.name === "Grey") m.color.set(0x00bf5b)
        })

        const rostos: import("three").Mesh[] = []
        modelo.traverse((o) => {
          const mesh = o as import("three").Mesh
          if (mesh.isMesh && mesh.morphTargetDictionary) rostos.push(mesh)
        })

        const mixer = new THREE.AnimationMixer(modelo)
        const acoes: Partial<Record<Animacao3D, import("three").AnimationAction>> = {}
        for (const [chave, nome] of Object.entries(CLIPE) as [Animacao3D, string][]) {
          const clipe = THREE.AnimationClip.findByName(gltf.animations, nome)
          if (!clipe) continue
          const a = mixer.clipAction(clipe)
          if (SEM_REPETIR.has(chave)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true }
          acoes[chave] = a
        }
        let atual: Animacao3D | null = null
        const ir = (nome: Animacao3D) => {
          const prox = acoes[nome]
          if (!prox || nome === atual) return
          prox.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.25).play()
          if (atual) acoes[atual]?.fadeOut(0.25)
          atual = nome
        }
        ir(animRef.current)

        const ajustar = () => {
          const w = canvas.clientWidth || 128
          const h = canvas.clientHeight || 192
          renderer.setSize(w, h, false)
          camera.aspect = w / h
          camera.updateProjectionMatrix()
        }
        ajustar()
        const obs = new ResizeObserver(ajustar)
        obs.observe(canvas)

        const relogio = new THREE.Clock()
        let rot = 0
        const influencia = { Sad: 0, Surprised: 0, Angry: 0 }
        renderer.setAnimationLoop(() => {
          const dt = Math.min(0.05, relogio.getDelta())
          if (animRef.current !== atual) ir(animRef.current)
          mixer.update(dt)

          // Vira o corpo para o lado que está indo (3D de verdade).
          const alvo = dirRef.current === "dir" ? Math.PI / 2.4 : dirRef.current === "esq" ? -Math.PI / 2.4 : 0
          rot += (alvo - rot) * Math.min(1, dt * 9)
          modelo.rotation.y = rot

          // Expressões do rosto (triste, surpreso, bravo) com transição suave.
          const e = exprRef.current
          const metas = { Sad: e.triste, Surprised: e.surpreso, Angry: e.bravo }
          for (const k of Object.keys(metas) as (keyof typeof metas)[]) {
            influencia[k] += (metas[k] - influencia[k]) * Math.min(1, dt * 8)
          }
          for (const r of rostos) {
            const d = r.morphTargetDictionary
            const inf = r.morphTargetInfluences
            if (!d || !inf) continue
            for (const k of Object.keys(influencia) as (keyof typeof influencia)[]) {
              if (d[k] !== undefined) inf[d[k]] = influencia[k]
            }
          }
          renderer.render(cena, camera)
        })
        cbRef.current.pronto?.()

        limpar = () => {
          renderer.setAnimationLoop(null)
          obs.disconnect()
          mixer.stopAllAction()
          modelo.traverse((o) => {
            const mesh = o as import("three").Mesh
            if (!mesh.isMesh) return
            mesh.geometry.dispose()
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            for (const m of mats) m.dispose()
          })
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
