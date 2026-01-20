// Shared Express app (no .listen here)
import pinataSDK from '@pinata/sdk'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import multer from 'multer'
import { Readable } from 'stream'

// Load local .env for dev. In Vercel, env vars come from platform.
dotenv.config()

const app = express()

/**
 * CORS
 * - Allows localhost dev
 * - Allows your main frontend(s) via ALLOWED_ORIGINS
 * - Allows ANY *.vercel.app (so forks work for non-technical founders)
 *
 * Optional: set ALLOWED_ORIGINS in Vercel env as comma-separated list
 * Example:
 *   ALLOWED_ORIGINS=https://tokenize-rwa-template.vercel.app,http://localhost:5173
 */
const explicitAllowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

function isAllowedOrigin(origin: string) {
  // explicitly allowed
  if (explicitAllowed.includes('*')) return true
  if (explicitAllowed.includes(origin)) return true

  // local dev
  if (origin === 'http://localhost:5173') return true

  // allow any Vercel preview/prod frontend (great for forks)
  try {
    const host = new URL(origin).hostname
    if (host.endsWith('.vercel.app')) return true
  } catch {
    // ignore bad origins
  }

  return false
}

const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => {
    // allow server-to-server / curl / same-origin (no Origin header)
    if (!origin) return cb(null, true)

    if (isAllowedOrigin(origin)) return cb(null, true)

    // IMPORTANT: return an error (not "false") so it's obvious in logs/debugging
    return cb(new Error(`CORS blocked for origin: ${origin}`))
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  optionsSuccessStatus: 204,
}

// Apply CORS to all routes
app.use(cors(corsOptions))

// Handle preflight requests for ALL routes (with the SAME options)
app.options('*', cors(corsOptions))

app.use(express.json())

// Pinata client
const pinata =
  process.env.PINATA_JWT && process.env.PINATA_JWT.trim().length > 0
    ? new pinataSDK({ pinataJWTKey: process.env.PINATA_JWT })
    : new pinataSDK(process.env.PINATA_API_KEY || '', process.env.PINATA_API_SECRET || '')

// Optional: test credentials at cold start (helps a LOT on Vercel)
;(async () => {
  try {
    const auth = await (pinata as any).testAuthentication?.()
    console.log('Pinata auth OK:', auth || 'ok')
  } catch (e) {
    console.error('Pinata authentication FAILED. Check env vars.', e)
  }
})()

// Uploads (multipart/form-data)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

app.get('/health', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.status(200).json({ ok: true, ts: Date.now() })
})

function safeTrim(v: unknown) {
  return typeof v === 'string' ? v.trim() : ''
}

function safeJsonParse(v: unknown, fallback: any) {
  try {
    if (typeof v !== 'string' || !v.trim()) return fallback
    return JSON.parse(v)
  } catch {
    return fallback
  }
}

app.post('/api/pin-image', upload.single('file'), async (req, res) => {
  try {
    const file = req.file
    if (!file) return res.status(400).json({ error: 'No file uploaded' })

    // Optional form fields (friendly for vibe-coders)
    const metaName = safeTrim(req.body?.metaName) || 'NFT Example'
    const metaDescription = safeTrim(req.body?.metaDescription) || 'Pinned via TokenizeRWA template'
    const properties = safeJsonParse(req.body?.properties, {})

    // Pin image
    const stream = Readable.from(file.buffer) as any
    stream.path = file.originalname || 'upload'

    const imageResult = await pinata.pinFileToIPFS(stream, {
      pinataMetadata: { name: file.originalname || `${metaName} Image` },
    })

    const imageUrl = `ipfs://${imageResult.IpfsHash}`

    // Pin metadata JSON
    const metadata = {
      name: metaName,
      description: metaDescription,
      image: imageUrl,
      properties,
    }

    const jsonResult = await pinata.pinJSONToIPFS(metadata, {
      pinataMetadata: { name: `${metaName} Metadata` },
    })

    const metadataUrl = `ipfs://${jsonResult.IpfsHash}`

    return res.status(200).json({ metadataUrl })
  } catch (error: any) {
    const msg =
      error?.response?.data?.error ||
      error?.response?.data ||
      error?.message ||
      'Failed to pin to IPFS.'
    return res.status(500).json({ error: msg })
  }
})

export default app
