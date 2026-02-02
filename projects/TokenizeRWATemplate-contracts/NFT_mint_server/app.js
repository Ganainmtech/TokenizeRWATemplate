// app.js (PURE JS - no TS syntax)
import pinataSDK from '@pinata/sdk'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import multer from 'multer'
import { Readable } from 'stream'

// Load local .env for dev. In Vercel, env vars come from platform.
dotenv.config()

const app = express()

// --- DEBUG: log every request (shows up in Vercel logs)
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.url} origin=${req.headers.origin || 'none'}`)
  next()
})

/**
 * CORS
 * Optional: set ALLOWED_ORIGINS in Vercel env as comma-separated list
 * Example:
 *   ALLOWED_ORIGINS=https://tokenize-rwa-template.vercel.app,http://localhost:5173
 */
const explicitAllowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

function isAllowedOrigin(origin) {
  if (explicitAllowed.includes('*')) return true
  if (explicitAllowed.includes(origin)) return true
  if (origin === 'http://localhost:5173') return true

  try {
    const host = new URL(origin).hostname
    return (
      host.endsWith('.vercel.app') ||
      host.endsWith('.app.github.dev')
    )
  } catch {
    return false
  }
}

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    if (isAllowedOrigin(origin)) return cb(null, true)
    return cb(new Error(`CORS blocked for origin: ${origin}`))
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  optionsSuccessStatus: 204,
}

// Apply CORS to all routes
app.use(cors(corsOptions))

app.options('*', cors(corsOptions))

app.use(express.json())

// Pinata client
const pinata =
  process.env.PINATA_JWT && process.env.PINATA_JWT.trim().length > 0
    ? new pinataSDK({ pinataJWTKey: process.env.PINATA_JWT })
    : new pinataSDK(process.env.PINATA_API_KEY || '', process.env.PINATA_API_SECRET || '')

// Optional: test credentials at cold start
;(async () => {
  try {
    const auth = await pinata.testAuthentication?.()
    console.log('Pinata auth OK:', auth || 'ok')
  } catch (e) {
    console.error('Pinata authentication FAILED. Check env vars.', e)
  }
})()

// Uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

app.get('/health', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.status(200).json({ ok: true, ts: Date.now() })
})

// DEBUG ROUTE
app.get('/api/debug', (req, res) => {
  res.status(200).json({
    ok: true,
    message: 'Reached Express',
    url: req.url,
    origin: req.headers.origin || null,
  })
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

    const metaName = safeTrim(req.body?.metaName) || 'NFT Example'
    const metaDescription = safeTrim(req.body?.metaDescription) || 'Pinned via TokenizeRWA template'
    const properties = safeJsonParse(req.body?.properties, {})

    const stream = Readable.from(file.buffer)
    stream.path = file.originalname || 'upload'

    const imageResult = await pinata.pinFileToIPFS(stream, {
      pinataMetadata: { name: file.originalname || `${metaName} Image` },
    })

    const imageUrl = `ipfs://${imageResult.IpfsHash}`

    const metadata = {
      name: metaName,
      description: metaDescription,
      image: imageUrl,
      properties,
    }

    const jsonResult = await pinata.pinJSONToIPFS(metadata, {
      pinataMetadata: { name: `${metaName} Metadata` },
    })

    return res.status(200).json({ metadataUrl: `ipfs://${jsonResult.IpfsHash}` })
  } catch (error) {
    const msg = error?.response?.data?.error || error?.response?.data || error?.message || 'Failed to pin to IPFS.'
    return res.status(500).json({ error: msg })
  }
})

// Catch-all 404 (so we KNOW Express is being hit)
app.use((req, res) => {
  console.log(`[MISS] ${req.method} ${req.url}`)
  res.status(404).json({ error: 'NOT_FOUND_IN_EXPRESS', method: req.method, url: req.url })
})

export default app
