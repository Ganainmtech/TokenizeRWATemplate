import express from 'express'
import cors from 'cors'
import multer from 'multer'
import pinataSDK from '@pinata/sdk'
import dotenv from 'dotenv'
import { Readable } from 'stream'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load local .env for dev. In Vercel, env vars come from platform.
dotenv.config({ path: path.resolve(__dirname, '.env') })

const app = express()

// Allow local + prod (comma-separated in env), or * by default for dev
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((o) => o.trim())

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true) // same-origin, curl, Postman
      if (allowedOrigins.includes('*')) return cb(null, true)
      if (allowedOrigins.includes(origin)) return cb(null, true)

      // Allow any frontend on vercel.app (great for forks)
      try {
        const host = new URL(origin).hostname
        if (host.endsWith('.vercel.app')) return cb(null, true)
      } catch (_) {}

      return cb(null, false)
    },
    credentials: false,
  })
)

// IMPORTANT: for multipart/form-data, multer populates req.body
// but JSON parsing is still useful for other endpoints
app.use(express.json())

// Pinata client
const pinata = process.env.PINATA_JWT
  ? new pinataSDK({ pinataJWTKey: process.env.PINATA_JWT })
  : new pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_API_SECRET)

// Optional: test credentials at cold start
;(async () => {
  try {
    const auth = await pinata.testAuthentication?.()
    console.log('Pinata auth OK:', auth || 'ok')
  } catch (e) {
    console.error('Pinata authentication FAILED. Check env vars.', e?.message || e)
  }
})()

// health
app.get('/health', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ ok: true, ts: Date.now() })
})

// uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB safety limit (matches frontend hint)
  },
})

// Small helpers
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

    // NEW: read optional fields from multipart form-data (sent by frontend)
    const metaName = safeTrim(req.body?.metaName) || 'NFT Example'
    const metaDescription = safeTrim(req.body?.metaDescription) || 'This is an unchangeable NFT'
    const properties = safeJsonParse(req.body?.properties, {})

    // Pin image
    const stream = Readable.from(file.buffer)
    // Pinata SDK expects a path/filename sometimes
    // @ts-ignore
    stream.path = file.originalname || 'upload'

    const imageOptions = {
      pinataMetadata: { name: file.originalname || `${metaName} Image` },
    }
    const imageResult = await pinata.pinFileToIPFS(stream, imageOptions)
    const imageUrl = `ipfs://${imageResult.IpfsHash}`

    // Pin metadata JSON
    const metadata = {
      name: metaName,
      description: metaDescription,
      image: imageUrl,
      properties,
    }

    const jsonOptions = { pinataMetadata: { name: `${metaName} Metadata` } }
    const jsonResult = await pinata.pinJSONToIPFS(metadata, jsonOptions)
    const metadataUrl = `ipfs://${jsonResult.IpfsHash}`

    res.status(200).json({ metadataUrl })
  } catch (error) {
    const msg =
      error?.response?.data?.error ||
      error?.response?.data ||
      error?.message ||
      'Failed to pin to IPFS.'
    res.status(500).json({ error: msg })
  }
})

export default app
