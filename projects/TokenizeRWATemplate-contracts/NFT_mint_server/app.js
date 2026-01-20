// server.js (ESM) — deployable on Vercel
import pinataSDK from '@pinata/sdk'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import multer from 'multer'
import path from 'path'
import { Readable } from 'stream'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load local .env for dev. In Vercel, env vars come from platform.
dotenv.config({ path: path.resolve(__dirname, '.env') })

const app = express()

/**
 * CORS
 * - Allows localhost for local dev
 * - Allows your main frontend via FRONTEND_ORIGIN
 */
const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_ORIGIN, // e.g. https://tokenize-rwa-template.vercel.app
]
  .filter(Boolean)
  .map((o) => o.trim())

app.use(
  cors({
    origin: (origin, cb) => {
      // allow server-to-server / curl (no origin)
      if (!origin) return cb(null, true)

      if (allowedOrigins.includes(origin)) return cb(null, true)

      // Allow any frontend on vercel.app (great for forks + previews)
      try {
        const host = new URL(origin).hostname
        if (host.endsWith('.vercel.app')) return cb(null, true)
      } catch {
        // ignore URL parse errors
      }

      return cb(null, false)
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  }),
)

// Preflight for all routes
app.options('*', cors())

// For non-multipart endpoints (multer handles multipart/form-data)
app.use(express.json({ limit: '15mb' }))

// Pinata client
const pinata = process.env.PINATA_JWT
  ? new pinataSDK({ pinataJWTKey: process.env.PINATA_JWT })
  : new pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_API_SECRET)

// Optional: test credentials at cold start
;(async () => {
  try {
    if (typeof pinata.testAuthentication === 'function') {
      await pinata.testAuthentication()
      console.log('Pinata auth OK')
    } else {
      console.log('Pinata SDK loaded (no testAuthentication method)')
    }
  } catch (e) {
    console.error('Pinata authentication FAILED. Check env vars.', e?.message || e)
  }
})()

// health
app.get('/health', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.status(200).json({ ok: true, ts: Date.now() })
})

// uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

function safeTrim(v) {
  return typeof v === 'string' ? v.trim() : ''
}

function safeJsonParse(v, fallback) {
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

    // Optional multipart fields from frontend
    const metaName = safeTrim(req.body?.metaName) || 'NFT Example'
    const metaDescription = safeTrim(req.body?.metaDescription) || 'This is an unchangeable NFT'
    const properties = safeJsonParse(req.body?.properties, {})

    // Pin image
    const stream = Readable.from(file.buffer)
    // Pinata SDK sometimes expects a .path/filename
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
  } catch (error) {
    const msg = error?.response?.data?.error || error?.response?.data || error?.message || 'Failed to pin to IPFS.'
    return res.status(500).json({ error: msg })
  }
})

export default app
