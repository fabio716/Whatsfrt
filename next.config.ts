import type { NextConfig } from "next";

// Headers de segurança aplicados a todas as rotas. CSP é deliberadamente
// permissiva com 'unsafe-inline' em styles porque Next.js injeta styles
// inline; a página de login não exige inline scripts.
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      // 'unsafe-eval' removido — Next.js 16 nao precisa em runtime. Mantemos
      // 'unsafe-inline' temporariamente porque Next injeta scripts hidratacao
      // inline (pra eliminar de vez precisa setup de nonce-per-request).
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
    ];
  },
  // Compatibilidade com mídia salva antes da migração para storage privado.
  // Qualquer mensagem antiga com mediaUrl="/uploads/<file>" passa pelo guard
  // de auth+ownership de /api/media/<file>.
  async rewrites() {
    return [
      { source: "/uploads/:filename", destination: "/api/media/:filename" },
    ];
  },
};

export default nextConfig;
