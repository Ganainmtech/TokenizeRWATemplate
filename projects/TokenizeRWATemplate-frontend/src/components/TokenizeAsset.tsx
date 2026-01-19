import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { useWallet } from '@txnlab/use-wallet-react'
import { sha512_256 } from 'js-sha512'
import { useSnackbar } from 'notistack'
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AiOutlineCloudUpload, AiOutlineInfoCircle, AiOutlineLoading3Quarters } from 'react-icons/ai'
import { BsCoin } from 'react-icons/bs'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'

/**
 * Type for created assets stored in browser localStorage
 * Captures ASA configuration including compliance fields
 */
type CreatedAsset = {
  assetId: number
  assetName: string
  unitName: string
  total: string
  decimals: string
  url?: string
  manager?: string
  reserve?: string
  freeze?: string
  clawback?: string
  createdAt: string
}

/**
 * Tri-state for USDC opt-in status
 * - 'loading': blockchain query in progress, UI should show spinner/loading
 * - 'opted-in': confirmed on-chain that user has opted in
 * - 'not-opted-in': confirmed on-chain that user has NOT opted in
 */
type UsdcStatus = 'loading' | 'opted-in' | 'not-opted-in'

const STORAGE_KEY = 'tokenize_assets'
const LORA_BASE = 'https://lora.algokit.io/testnet'

// Circle USDC on Algorand TestNet (ASA)
const TESTNET_USDC_ASSET_ID = 10458941
const USDC_DECIMALS = 6
const ALGO_DECIMALS = 6

type TransferMode = 'manual' | 'algo' | 'usdc'

function resolveBackendBase(): string {
  // 1) Respect explicit env (Vercel or custom)
  const env = import.meta.env.VITE_API_URL?.trim()
  if (env) return env.replace(/\/$/, '')

  // 2) Codespaces: convert current host to port 3001
  // e.g. https://abc-5173.app.github.dev -> https://abc-3001.app.github.dev
  const host = window.location.host
  if (host.endsWith('.app.github.dev')) {
    const base = host.replace(/-\d+\.app\.github\.dev$/, '-3001.app.github.dev')
    return `https://${base}`
  }

  // 3) Plain local fallback
  return 'http://localhost:3001'
}

/**
 * Load created assets from browser localStorage
 */
function loadAssets(): CreatedAsset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CreatedAsset[]) : []
  } catch {
    return []
  }
}

/**
 * Save a newly created asset to localStorage
 * Returns updated asset list with new asset at the top
 */
function persistAsset(asset: CreatedAsset): CreatedAsset[] {
  const existing = loadAssets()
  const next = [asset, ...existing]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

/**
 * Convert a decimal string (e.g. "1.23") into base units bigint given decimals.
 * - Supports up to `decimals` fractional digits.
 * - Rejects negatives and invalid formats.
 */
function decimalToBaseUnits(value: string, decimals: number): bigint {
  const v = value.trim()
  if (!v) throw new Error('Amount is required')

  // Allow: "1", "1.", "1.0", ".5" ? We'll keep it simple: must start with digit.
  // (Users can type 0.5)
  if (!/^\d+(\.\d+)?$/.test(v)) throw new Error('Invalid amount format')

  const [wholeRaw, fracRaw = ''] = v.split('.')
  const whole = wholeRaw || '0'
  const frac = fracRaw || ''

  if (frac.length > decimals) {
    throw new Error(`Too many decimal places (max ${decimals})`)
  }

  const fracPadded = frac.padEnd(decimals, '0')
  const combined = `${whole}${fracPadded}`.replace(/^0+(?=\d)/, '') // keep at least one digit
  return BigInt(combined || '0')
}

/**
 * TokenizeAsset Component
 * Main form for creating Algorand Standard Assets (ASAs)
 * + NFT minting panel (ASA mint with IPFS metadata)
 * Persists created assets to localStorage for tracking
 */
export default function TokenizeAsset() {
  // ===== ASA (original) state =====
  const [assetName, setAssetName] = useState<string>('Tokenized Coffee Membership')
  const [unitName, setUnitName] = useState<string>('COFFEE')
  const [total, setTotal] = useState<string>('1000')
  const [decimals, setDecimals] = useState<string>('0')
  const [url, setUrl] = useState<string>('')

  const [showAdvanced, setShowAdvanced] = useState<boolean>(false)
  const [manager, setManager] = useState<string>('')
  const [reserve, setReserve] = useState<string>('')
  const [freeze, setFreeze] = useState<string>('')
  const [clawback, setClawback] = useState<string>('')

  const [loading, setLoading] = useState<boolean>(false)
  const [createdAssets, setCreatedAssets] = useState<CreatedAsset[]>([])

  // ===== Transfer state =====
  const [transferMode, setTransferMode] = useState<TransferMode>('manual')
  const [transferAssetId, setTransferAssetId] = useState<string>('')
  const [receiverAddress, setReceiverAddress] = useState<string>('')
  const [transferAmount, setTransferAmount] = useState<string>('1')
  const [transferLoading, setTransferLoading] = useState<boolean>(false)

  // ===== USDC opt-in state =====
  // Uses tri-state ('loading' | 'opted-in' | 'not-opted-in') to prevent infinite re-renders
  // Refs are used to track state without causing callback recreations
  const [usdcStatus, setUsdcStatus] = useState<UsdcStatus>('loading')
  const [usdcBalance, setUsdcBalance] = useState<bigint>(0n)
  const [usdcOptInLoading, setUsdcOptInLoading] = useState<boolean>(false)

  // Track if we've completed at least one successful blockchain check for this address
  const [hasCheckedUsdcOnChain, setHasCheckedUsdcOnChain] = useState<boolean>(false)

  // Refs to prevent circular dependencies and duplicate operations
  const hasShownUsdcWarningRef = useRef<boolean>(false) // Prevent duplicate snackbar warnings
  const lastTransferModeRef = useRef<TransferMode>('manual') // Track mode changes
  const isCheckingUsdcRef = useRef<boolean>(false) // Prevent duplicate status checks
  const hasCheckedUsdcOnChainRef = useRef<boolean>(false) // Track checked state (avoids stale closures)

  // ===== NFT mint state =====
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [nftLoading, setNftLoading] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // NFT mint configurable fields
  const [nftName, setNftName] = useState<string>('MasterPass Ticket')
  const [nftUnit, setNftUnit] = useState<string>('MTK')
  const [nftSupply, setNftSupply] = useState<string>('1')
  const [nftDecimals, setNftDecimals] = useState<string>('0')
  const [nftDefaultFrozen, setNftDefaultFrozen] = useState<boolean>(false)

  // NFT advanced (addresses)
  const [nftShowAdvanced, setNftShowAdvanced] = useState<boolean>(false)
  const [nftManager, setNftManager] = useState<string>('')
  const [nftReserve, setNftReserve] = useState<string>('')
  const [nftFreeze, setNftFreeze] = useState<string>('')
  const [nftClawback, setNftClawback] = useState<string>('')

  // ===== use-wallet (Web3Auth OR WalletConnect) =====
  // Use transactionSigner (not signer) - this is the correct property name from use-wallet
  const { transactionSigner, activeAddress } = useWallet()

  // Alias for backward compatibility in the code
  const signer = transactionSigner

  // ===== Notifications =====
  const { enqueueSnackbar } = useSnackbar()

  // ===== Algorand client =====
  const algodConfig = getAlgodConfigFromViteEnvironment()
  const algorand = useMemo(() => AlgorandClient.fromConfig({ algodConfig }), [algodConfig])

  // Derived booleans for convenience (only valid when hasCheckedUsdcOnChain is true)
  const usdcOptedIn = usdcStatus === 'opted-in'
  const usdcStatusLoading = usdcStatus === 'loading'

  /**
   * Fetch USDC opt-in status from blockchain
   * Uses asset-specific API for reliable opt-in detection
   * Falls back to account information API if needed
   */
  const checkUsdcOptInStatus = useCallback(async () => {
    if (!activeAddress) {
      setUsdcStatus('not-opted-in')
      setUsdcBalance(0n)
      setHasCheckedUsdcOnChain(false)
      hasCheckedUsdcOnChainRef.current = false
      isCheckingUsdcRef.current = false
      return
    }

    // Prevent duplicate concurrent calls
    if (isCheckingUsdcRef.current) {
      return
    }

    isCheckingUsdcRef.current = true

    // Only set loading if we haven't checked yet (preserve existing status during refresh)
    if (!hasCheckedUsdcOnChainRef.current) {
      setUsdcStatus('loading')
    }

    try {
      // Method 1: Use asset-specific API (most reliable)
      // Returns holding if opted in, throws if not opted in
      let holding: any = null
      let apiCallSucceeded = false

      try {
        holding = await algorand.asset.getAccountInformation(activeAddress, BigInt(TESTNET_USDC_ASSET_ID))
        apiCallSucceeded = true
      } catch (assetApiError: unknown) {
        // API call failed - account is likely not opted in
        const error = assetApiError as any

        // Check if it's a 404/not found error (definitely not opted in)
        // vs a network error (should fall through to method 2)
        const isNotFoundError =
          error?.message?.includes('not found') ||
          error?.message?.includes('404') ||
          error?.status === 404 ||
          error?.response?.status === 404

        if (isNotFoundError) {
          setUsdcStatus('not-opted-in')
          setUsdcBalance(0n)
          setHasCheckedUsdcOnChain(true)
          hasCheckedUsdcOnChainRef.current = true
          return
        }
        // Non-404 error - fall through to method 2 for verification
      }

      // Process successful API call result
      if (apiCallSucceeded && holding) {
        const holdingAny = holding as any
        const amount = holdingAny?.amount ?? holdingAny?.balance ?? 0
        const balance = typeof amount === 'bigint' ? amount : BigInt(amount ?? 0)

        setUsdcStatus('opted-in')
        setUsdcBalance(balance)
        setHasCheckedUsdcOnChain(true)
        hasCheckedUsdcOnChainRef.current = true
        return
      }

      // Method 2: Fallback to account information API
      // Used when method 1 has non-404 errors or for verification
      const info = await algorand.client.algod.accountInformation(activeAddress).do()
      const assets: Array<{ ['asset-id']: number; amount?: number }> = info?.assets ?? []

      const usdcHolding = assets.find((a) => a['asset-id'] === TESTNET_USDC_ASSET_ID)

      if (usdcHolding) {
        const balance = BigInt(usdcHolding.amount ?? 0)
        setUsdcStatus('opted-in')
        setUsdcBalance(balance)
      } else {
        setUsdcStatus('not-opted-in')
        setUsdcBalance(0n)
      }

      // Mark that we've successfully completed a blockchain check
      setHasCheckedUsdcOnChain(true)
      hasCheckedUsdcOnChainRef.current = true
    } catch (e) {
      // On error, set to not-opted-in but don't mark as checked
      // This allows retry on next render cycle
      setUsdcStatus('not-opted-in')
      setUsdcBalance(0n)
      setHasCheckedUsdcOnChain(false)
      hasCheckedUsdcOnChainRef.current = false
    } finally {
      isCheckingUsdcRef.current = false
    }
    // Note: hasCheckedUsdcOnChain is read from closure, not needed in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAddress, algorand])

  // Effect: Check USDC status when address changes or on mount
  // Small delay allows wallet state to stabilize after reconnect
  useEffect(() => {
    // Reset state when address changes
    setHasCheckedUsdcOnChain(false)
    hasCheckedUsdcOnChainRef.current = false
    hasShownUsdcWarningRef.current = false
    isCheckingUsdcRef.current = false

    if (!activeAddress) {
      setUsdcStatus('not-opted-in')
      setUsdcBalance(0n)
      return
    }

    // Set loading immediately, then check after delay
    setUsdcStatus('loading')

    const timeoutId = setTimeout(() => {
      checkUsdcOptInStatus()
    }, 500)

    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAddress])

  // Effect: Handle transfer mode changes and show appropriate warnings
  // Only shows warnings after blockchain state is confirmed (not during loading)
  useEffect(() => {
    const prevMode = lastTransferModeRef.current
    const modeChanged = prevMode !== transferMode
    lastTransferModeRef.current = transferMode

    // Set transfer asset ID based on mode
    if (transferMode === 'algo') {
      setTransferAssetId('ALGO')
    } else if (transferMode === 'usdc') {
      setTransferAssetId(String(TESTNET_USDC_ASSET_ID))

      // Show warnings only when:
      // 1. Actually switching TO usdc mode (not just re-render)
      // 2. Blockchain check is complete (status confirmed)
      // 3. Warning hasn't been shown already
      if (modeChanged && hasCheckedUsdcOnChain && !hasShownUsdcWarningRef.current && usdcStatus === 'not-opted-in') {
        enqueueSnackbar('You are not opted in to USDC yet. Please opt in before receiving or sending USDC.', {
          variant: 'info',
        })
        hasShownUsdcWarningRef.current = true
      } else if (
        modeChanged &&
        hasCheckedUsdcOnChain &&
        !hasShownUsdcWarningRef.current &&
        usdcStatus === 'opted-in' &&
        usdcBalance === 0n
      ) {
        enqueueSnackbar('Heads up: you have 0 USDC to send.', { variant: 'info' })
        hasShownUsdcWarningRef.current = true
      }
    } else {
      // Manual mode - reset asset ID if it was set to ALGO or USDC
      if (transferAssetId === 'ALGO' || transferAssetId === String(TESTNET_USDC_ASSET_ID)) {
        setTransferAssetId('')
      }
      // Prefill with latest created asset if available
      if (!transferAssetId && createdAssets.length > 0) {
        setTransferAssetId(String(createdAssets[0].assetId))
      }
    }

    // Reset warning flag when leaving USDC mode
    if (prevMode === 'usdc' && transferMode !== 'usdc') {
      hasShownUsdcWarningRef.current = false
    }
    // Note: We intentionally don't include usdcStatus/usdcBalance in deps to avoid re-runs on status changes
    // We only want this to run when transferMode or hasCheckedUsdcOnChain changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferMode, hasCheckedUsdcOnChain, enqueueSnackbar])

  /**
   * Opt-in to TestNet USDC
   * Opt-in is an asset transfer of 0 USDC to self
   */
  const handleOptInUsdc = async () => {
    // Check for activeAddress first (primary indicator of connection)
    // transactionSigner might be available even if not explicitly set
    if (!activeAddress) {
      enqueueSnackbar('Please connect a wallet or continue with Google first.', { variant: 'warning' })
      return
    }

    if (!signer) {
      enqueueSnackbar('Wallet signer not available. Please try reconnecting your wallet.', { variant: 'error' })
      return
    }

    // Prevent duplicate transactions if already opted in
    if (usdcOptedIn) {
      enqueueSnackbar('You are already opted in to USDC ✅', { variant: 'info' })
      return
    }

    try {
      setUsdcOptInLoading(true)
      enqueueSnackbar('Opting into USDC...', { variant: 'info' })

      // Opt-in = asset transfer of 0 to self
      const result = await algorand.send.assetTransfer({
        sender: activeAddress,
        signer,
        assetId: TESTNET_USDC_ASSET_ID,
        receiver: activeAddress,
        amount: 0n,
      })

      const txId = (result as { txId?: string }).txId

      // Optimistically update status immediately after successful transaction
      setUsdcStatus('opted-in')
      setUsdcBalance(0n)
      setHasCheckedUsdcOnChain(true)
      hasCheckedUsdcOnChainRef.current = true
      hasShownUsdcWarningRef.current = true // Prevent warning since we just opted in

      enqueueSnackbar('✅ USDC opted in!', {
        variant: 'success',
        action: () =>
          txId ? (
            <a
              href={`${LORA_BASE}/transaction/${txId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'underline', marginLeft: 8 }}
            >
              View Tx on Lora ↗
            </a>
          ) : null,
      })

      // Verify with blockchain after delay to confirm opt-in
      setTimeout(() => {
        checkUsdcOptInStatus()
      }, 2000)
    } catch (e) {
      enqueueSnackbar('USDC opt-in failed.', { variant: 'error' })
    } finally {
      setUsdcOptInLoading(false)
    }
  }

  useEffect(() => {
    setCreatedAssets(loadAssets())
  }, [])

  useEffect(() => {
    if (activeAddress && !manager) setManager(activeAddress)
  }, [activeAddress, manager])

  // NFT: default manager to connected address (same UX as ASA)
  useEffect(() => {
    if (activeAddress && !nftManager) setNftManager(activeAddress)
  }, [activeAddress, nftManager])

  // Prefill transfer asset id from latest created asset (QoL) — only in manual mode
  useEffect(() => {
    if (transferMode !== 'manual') return
    if (!transferAssetId && createdAssets.length > 0) {
      setTransferAssetId(String(createdAssets[0].assetId))
    }
  }, [createdAssets, transferAssetId, transferMode])

  const resetDefaults = () => {
    setAssetName('Tokenized Coffee Membership')
    setUnitName('COFFEE')
    setTotal('1000')
    setDecimals('0')
    setUrl('')
    setShowAdvanced(false)
    setManager(activeAddress ?? '')
    setReserve('')
    setFreeze('')
    setClawback('')
  }

  const resetNftDefaults = () => {
    setSelectedFile(null)
    setPreviewUrl('')
    if (fileInputRef.current) fileInputRef.current.value = ''

    setNftName('MasterPass Ticket')
    setNftUnit('MTK')
    setNftSupply('1')
    setNftDecimals('0')
    setNftDefaultFrozen(false)

    setNftShowAdvanced(false)
    setNftManager(activeAddress ?? '')
    setNftReserve('')
    setNftFreeze('')
    setNftClawback('')
  }

  const isWholeNumber = (v: string) => /^\d+$/.test(v)

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      enqueueSnackbar('Asset ID copied to clipboard', { variant: 'success' })
      setTransferMode('manual')
      setTransferAssetId(text)
    } catch {
      enqueueSnackbar('Copy failed. Please copy manually.', { variant: 'warning' })
    }
  }

  /**
   * Handle ASA creation with validation and on-chain transaction
   * Adjusts total supply by decimals and saves asset to localStorage
   */
  const handleTokenize = async () => {
    // Check for activeAddress first (primary indicator of connection)
    if (!activeAddress) {
      enqueueSnackbar('Please connect a wallet or continue with Google first.', { variant: 'warning' })
      return
    }

    if (!signer) {
      enqueueSnackbar('Wallet signer not available. Please try reconnecting your wallet.', { variant: 'error' })
      return
    }

    if (!assetName || !unitName) {
      enqueueSnackbar('Please enter an asset name and symbol.', { variant: 'warning' })
      return
    }
    if (!isWholeNumber(total)) {
      enqueueSnackbar('Total supply must be a whole number.', { variant: 'warning' })
      return
    }
    if (!isWholeNumber(decimals)) {
      enqueueSnackbar('Decimals must be a whole number (0–19).', { variant: 'warning' })
      return
    }

    const d = Number(decimals)
    if (Number.isNaN(d) || d < 0 || d > 19) {
      enqueueSnackbar('Decimals must be between 0 and 19.', { variant: 'warning' })
      return
    }

    try {
      setLoading(true)
      enqueueSnackbar('Tokenizing asset (creating ASA)...', { variant: 'info' })

      const onChainTotal = BigInt(total) * 10n ** BigInt(d)

      const createResult = await algorand.send.assetCreate({
        sender: activeAddress,
        signer,
        total: onChainTotal,
        decimals: d,
        assetName,
        unitName,
        url: url || undefined,
        defaultFrozen: false,
        manager: manager || undefined,
        reserve: reserve || undefined,
        freeze: freeze || undefined,
        clawback: clawback || undefined,
      })

      const assetId = createResult.assetId

      const newEntry: CreatedAsset = {
        assetId: Number(assetId),
        assetName: String(assetName),
        unitName: String(unitName),
        total: String(total),
        decimals: String(decimals),
        url: url ? String(url) : undefined,
        manager: manager ? String(manager) : undefined,
        reserve: reserve ? String(reserve) : undefined,
        freeze: freeze ? String(freeze) : undefined,
        clawback: clawback ? String(clawback) : undefined,
        createdAt: new Date().toISOString(),
      }

      const next = persistAsset(newEntry)
      setCreatedAssets(next)

      enqueueSnackbar(`✅ Success! Asset ID: ${assetId}`, {
        variant: 'success',
        action: () =>
          assetId ? (
            <a
              href={`${LORA_BASE}/asset/${assetId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'underline', marginLeft: 8 }}
            >
              View on Lora ↗
            </a>
          ) : null,
      })

      resetDefaults()
    } catch (error) {
      enqueueSnackbar('Failed to tokenize asset (ASA creation failed).', { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  /**
   * Transfer assets (Manual ASA / USDC ASA / ALGO payment)
   * Handles validation, amount conversion, and transaction submission
   */
  const handleTransferAsset = async () => {
    // Check for activeAddress first (primary indicator of connection)
    if (!activeAddress) {
      enqueueSnackbar('Please connect a wallet or continue with Google first.', { variant: 'warning' })
      return
    }

    if (!signer) {
      enqueueSnackbar('Wallet signer not available. Please try reconnecting your wallet.', { variant: 'error' })
      return
    }

    if (!receiverAddress) {
      enqueueSnackbar('Please enter a recipient address.', { variant: 'warning' })
      return
    }

    if (!transferAmount || Number(transferAmount) <= 0) {
      enqueueSnackbar('Please enter an amount greater than 0.', { variant: 'warning' })
      return
    }

    // Manual ASA: validate Asset ID and whole-number amount
    if (transferMode === 'manual') {
      if (!transferAssetId || !isWholeNumber(transferAssetId)) {
        enqueueSnackbar('Please enter a valid Asset ID (number).', { variant: 'warning' })
        return
      }
      if (!isWholeNumber(transferAmount)) {
        enqueueSnackbar('Amount must be a whole number for manual ASA transfers.', { variant: 'warning' })
        return
      }
    }

    // USDC + ALGO: allow decimals up to 6 places
    if (transferMode === 'algo' || transferMode === 'usdc') {
      if (!/^\d+(\.\d+)?$/.test(transferAmount.trim())) {
        enqueueSnackbar('Amount must be a valid number (decimals allowed).', { variant: 'warning' })
        return
      }
    }

    // USDC: block transfer if not opted in (only if status is confirmed, not during loading)
    if (transferMode === 'usdc' && hasCheckedUsdcOnChain && !usdcOptedIn) {
      enqueueSnackbar('You must opt-in to USDC before you can send/receive it.', { variant: 'warning' })
      return
    }

    try {
      setTransferLoading(true)

      if (transferMode === 'algo') {
        enqueueSnackbar('Sending ALGO...', { variant: 'info' })

        const microAlgos = decimalToBaseUnits(transferAmount, ALGO_DECIMALS)

        const result = await algorand.send.payment({
          sender: activeAddress,
          signer,
          receiver: receiverAddress,
          amount: algorand.microAlgos(microAlgos),
        })

        const txId = (result as { txId?: string }).txId

        enqueueSnackbar('✅ ALGO sent!', {
          variant: 'success',
          action: () =>
            txId ? (
              <a
                href={`${LORA_BASE}/transaction/${txId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'underline', marginLeft: 8 }}
              >
                View Tx on Lora ↗
              </a>
            ) : null,
        })
      } else if (transferMode === 'usdc') {
        // Double-check opt-in status (in case it changed)
        if (hasCheckedUsdcOnChain && !usdcOptedIn) {
          enqueueSnackbar('You are not opted in to USDC yet. Please opt in first.', { variant: 'warning' })
          return
        }

        if (usdcBalance === 0n) {
          enqueueSnackbar('You have 0 USDC to send.', { variant: 'warning' })
          return
        }

        enqueueSnackbar('Sending USDC...', { variant: 'info' })
        const usdcAmount = decimalToBaseUnits(transferAmount, USDC_DECIMALS)

        if (usdcAmount > usdcBalance) {
          enqueueSnackbar('Insufficient USDC balance for this transfer.', { variant: 'warning' })
          return
        }

        const result = await algorand.send.assetTransfer({
          sender: activeAddress,
          signer,
          assetId: TESTNET_USDC_ASSET_ID,
          receiver: receiverAddress,
          amount: usdcAmount,
        })

        const txId = (result as { txId?: string }).txId

        enqueueSnackbar('✅ USDC transfer complete!', {
          variant: 'success',
          action: () =>
            txId ? (
              <a
                href={`${LORA_BASE}/transaction/${txId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'underline', marginLeft: 8 }}
              >
                View Tx on Lora ↗
              </a>
            ) : null,
        })

        // Refresh balance after transfer to show updated amount
        setTimeout(() => {
          checkUsdcOptInStatus()
        }, 2000)
      } else {
        // manual ASA
        enqueueSnackbar('Transferring asset...', { variant: 'info' })

        const result = await algorand.send.assetTransfer({
          sender: activeAddress,
          signer,
          assetId: Number(transferAssetId),
          receiver: receiverAddress,
          amount: BigInt(transferAmount),
        })

        const txId = (result as { txId?: string }).txId

        enqueueSnackbar('✅ Transfer complete!', {
          variant: 'success',
          action: () =>
            txId ? (
              <a
                href={`${LORA_BASE}/transaction/${txId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'underline', marginLeft: 8 }}
              >
                View Tx on Lora ↗
              </a>
            ) : null,
        })
      }

      setReceiverAddress('')
      setTransferAmount('1')
    } catch (error) {
      if (transferMode === 'algo') {
        enqueueSnackbar('ALGO send failed.', { variant: 'error' })
      } else {
        enqueueSnackbar('Transfer failed. If sending an ASA (incl. USDC), make sure the recipient has opted in.', {
          variant: 'error',
        })
      }
    } finally {
      setTransferLoading(false)
    }
  }

  /**
   * NFT mint helpers
   */
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setSelectedFile(file)
    setPreviewUrl(file ? URL.createObjectURL(file) : '')
  }

  const handleDivClick = () => fileInputRef.current?.click()

  const handleMintNFT = async () => {
    // Check for activeAddress first (primary indicator of connection)
    if (!activeAddress) {
      enqueueSnackbar('Please connect a wallet or continue with Google first.', { variant: 'warning' })
      return
    }

    if (!signer) {
      enqueueSnackbar('Wallet signer not available. Please try reconnecting your wallet.', { variant: 'error' })
      return
    }

    if (!selectedFile) {
      enqueueSnackbar('Please select an image file to mint.', { variant: 'warning' })
      return
    }

    // Validate NFT fields
    if (!nftName || !nftUnit) {
      enqueueSnackbar('Please enter an NFT name and unit/symbol.', { variant: 'warning' })
      return
    }
    if (!nftSupply || !isWholeNumber(nftSupply)) {
      enqueueSnackbar('Supply must be a whole number.', { variant: 'warning' })
      return
    }
    if (!nftDecimals || !isWholeNumber(nftDecimals)) {
      enqueueSnackbar('Decimals must be a whole number (0–19).', { variant: 'warning' })
      return
    }

    const d = Number(nftDecimals)
    if (Number.isNaN(d) || d < 0 || d > 19) {
      enqueueSnackbar('NFT decimals must be between 0 and 19.', { variant: 'warning' })
      return
    }

    setNftLoading(true)
    enqueueSnackbar('Uploading and preparing NFT...', { variant: 'info' })

    let metadataUrl = ''
    try {
      const backendBase = resolveBackendBase()
      const backendApiUrl = `${backendBase.replace(/\/$/, '')}/api/pin-image`

      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch(backendApiUrl, {
        method: 'POST',
        body: formData,
        mode: 'cors',
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Backend request failed: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      metadataUrl = data.metadataUrl
      if (!metadataUrl) throw new Error('Backend did not return a valid metadata URL')
    } catch (e: any) {
      enqueueSnackbar('Error uploading to backend. If in Codespaces, make port 3001 Public.', { variant: 'error' })
      setNftLoading(false)
      return
    }

    try {
      enqueueSnackbar('Minting NFT on Algorand...', { variant: 'info' })

      // Demo shortcut: hash the metadata URL string (ARC-3 would hash JSON bytes)
      const metadataHash = Uint8Array.from(sha512_256.digest(metadataUrl))

      const onChainTotal = BigInt(nftSupply) * 10n ** BigInt(d)

      const createNFTResult = await algorand.send.assetCreate({
        sender: activeAddress,
        signer,
        total: onChainTotal,
        decimals: d,
        assetName: nftName,
        unitName: nftUnit,
        url: metadataUrl,
        metadataHash,
        defaultFrozen: nftDefaultFrozen,
        manager: nftManager || undefined,
        reserve: nftReserve || undefined,
        freeze: nftFreeze || undefined,
        clawback: nftClawback || undefined,
      })

      const assetId = createNFTResult.assetId

      // ✅ Persist minted NFT into SAME history list (NFTs are ASAs)
      const nftEntry: CreatedAsset = {
        assetId: Number(assetId),
        assetName: String(nftName),
        unitName: String(nftUnit),
        total: String(nftSupply),
        decimals: String(nftDecimals),
        url: metadataUrl ? String(metadataUrl) : undefined,
        manager: nftManager ? String(nftManager) : undefined,
        reserve: nftReserve ? String(nftReserve) : undefined,
        freeze: nftFreeze ? String(nftFreeze) : undefined,
        clawback: nftClawback ? String(nftClawback) : undefined,
        createdAt: new Date().toISOString(),
      }

      const next = persistAsset(nftEntry)
      setCreatedAssets(next)

      // QoL: switch to manual mode + prefill transfer section with minted asset id
      setTransferMode('manual')
      setTransferAssetId(String(assetId))

      enqueueSnackbar(`✅ Success! NFT Asset ID: ${assetId}`, {
        variant: 'success',
        action: () =>
          assetId ? (
            <a
              href={`${LORA_BASE}/asset/${assetId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'underline', marginLeft: 8 }}
            >
              View on Lora ↗
            </a>
          ) : null,
      })

      // Reset just the file picker + preview (keep fields, so they can mint many quickly)
      setSelectedFile(null)
      setPreviewUrl('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (e: any) {
      enqueueSnackbar(`Failed to mint NFT: ${e?.message || 'Unknown error'}`, { variant: 'error' })
    } finally {
      setNftLoading(false)
    }
  }

  const canSubmit = !!assetName && !!unitName && !!total && !loading && !!activeAddress

  const canMintNft = !!nftName && !!nftUnit && !!nftSupply && !!nftDecimals && !!selectedFile && !!activeAddress && !nftLoading

  const transferAmountLabel = transferMode === 'algo' ? 'Amount (ALGO)' : transferMode === 'usdc' ? 'Amount (USDC)' : 'Amount'

  const transferAssetIdLabel = transferMode === 'algo' ? 'Asset (ALGO)' : transferMode === 'usdc' ? 'Asset (USDC)' : 'Asset ID'

  // Helper to render USDC status text
  const renderUsdcStatusText = () => {
    if (usdcStatusLoading) {
      return <span className="text-slate-500 dark:text-slate-400">Checking status...</span>
    }
    if (usdcOptedIn) {
      return <span className="text-teal-700 dark:text-teal-300">Already opted in ✅</span>
    }
    return <span className="text-slate-600 dark:text-slate-300">Required before you can receive TestNet USDC.</span>
  }

  // Helper to render opt-in button text
  const renderOptInButtonText = () => {
    if (usdcOptInLoading) {
      return (
        <span className="flex items-center gap-2">
          <AiOutlineLoading3Quarters className="animate-spin" />
          Opting in…
        </span>
      )
    }
    if (usdcStatusLoading) {
      return (
        <span className="flex items-center gap-2">
          <AiOutlineLoading3Quarters className="animate-spin" />
          Checking…
        </span>
      )
    }
    if (usdcOptedIn) {
      return 'USDC opted in ✅'
    }
    return 'Opt in USDC'
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg p-6 sm:p-8">
      {/* Top header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/30">
            <BsCoin className="text-2xl text-teal-600 dark:text-teal-400" />
          </span>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Tokenize on Algorand</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Mint standard ASAs or mint an NFT-style ASA on TestNet.</p>
            {/* TestNet funding helper */}
            <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-sm text-slate-700 dark:text-slate-200">
                  Need TestNet ALGO to get started? Use the Algorand TestNet Dispenser.
                  <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Tip: fund the connected address, then refresh your balance.
                  </span>
                </div>

                <a
                  href="https://bank.testnet.algorand.network/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-md transition"
                >
                  Open Dispenser ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ASA loading bar */}
      {loading && (
        <div className="relative h-1 w-full mt-5 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
          <div className="absolute inset-y-0 left-0 w-1/3 animate-[loading_1.2s_ease-in-out_infinite] bg-teal-600 dark:bg-teal-500" />
          <style>{`
            @keyframes loading {
              0%   { transform: translateX(-120%); }
              50%  { transform: translateX(60%); }
              100% { transform: translateX(220%); }
            }
          `}</style>
        </div>
      )}

      {/* MAIN: 2-column panel (ASA left, NFT right) */}
      <div className="mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* ===== LEFT: ASA TOKENIZE FORM ===== */}
          <div className={`${loading ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Tokenize an Asset (Mint ASA)</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Create a standard ASA on TestNet. Perfect for RWA POCs.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-5 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Asset Name</label>
                  <input
                    type="text"
                    className="w-full rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900/30 px-4 py-2 transition"
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Symbol</label>
                  <input
                    type="text"
                    className="w-full rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900/30 px-4 py-2 transition"
                    value={unitName}
                    onChange={(e) => setUnitName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Total Supply</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900/30 px-4 py-2 transition"
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    <span>Decimals</span>
                    <div className="group relative">
                      <AiOutlineInfoCircle className="text-slate-400 cursor-help hover:text-slate-600 dark:hover:text-slate-300" />
                      <div className="invisible group-hover:visible bg-slate-900 dark:bg-slate-800 text-white dark:text-slate-200 text-xs rounded px-2 py-1 whitespace-nowrap absolute bottom-full left-0 mb-1 z-10">
                        Decimals controls fractional units. 0 = whole units only.
                      </div>
                    </div>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={19}
                    className="w-full rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900/30 px-4 py-2 transition"
                    value={decimals}
                    onChange={(e) => setDecimals(e.target.value)}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    <span>Metadata URL (optional)</span>
                    <div className="group relative">
                      <AiOutlineInfoCircle className="text-slate-400 cursor-help hover:text-slate-600 dark:hover:text-slate-300" />
                      <div className="invisible group-hover:visible bg-slate-900 dark:bg-slate-800 text-white dark:text-slate-200 text-xs rounded px-2 py-1 whitespace-nowrap absolute bottom-full left-0 mb-1 z-10">
                        A public link describing the asset (JSON, webpage, or doc).
                      </div>
                    </div>
                  </label>
                  <input
                    type="url"
                    className="w-full rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900/30 px-4 py-2 transition"
                    placeholder="https://example.com/metadata.json"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((s) => !s)}
                  className="flex items-center gap-2 text-sm font-medium text-primary hover:underline transition"
                >
                  <span>{showAdvanced ? 'Hide advanced options' : 'Show advanced options'}</span>
                  <span className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>▾</span>
                </button>

                {showAdvanced && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-5">
                    {[
                      {
                        label: 'Manager',
                        tip: 'The manager can update or reconfigure asset settings. Often set to the issuer wallet.',
                        value: manager,
                        setValue: setManager,
                        placeholder: 'Defaults to your wallet address',
                      },
                      {
                        label: 'Reserve',
                        tip: 'Reserve may hold non-circulating supply depending on your design. Leave blank to disable.',
                        value: reserve,
                        setValue: setReserve,
                        placeholder: 'Optional address',
                      },
                      {
                        label: 'Freeze',
                        tip: 'Freeze can freeze/unfreeze holdings (useful for compliance). Leave blank to disable.',
                        value: freeze,
                        setValue: setFreeze,
                        placeholder: 'Optional address',
                      },
                      {
                        label: 'Clawback',
                        tip: 'Clawback can revoke tokens from accounts (recovery/compliance). Leave blank to disable.',
                        value: clawback,
                        setValue: setClawback,
                        placeholder: 'Optional address',
                      },
                    ].map((f) => (
                      <div key={f.label}>
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          <span>{f.label}</span>
                          <div className="group relative">
                            <AiOutlineInfoCircle className="text-slate-400 cursor-help hover:text-slate-600 dark:hover:text-slate-300" />
                            <div className="invisible group-hover:visible bg-slate-900 dark:bg-slate-800 text-white dark:text-slate-200 text-xs rounded px-2 py-1 whitespace-nowrap absolute bottom-full left-0 mb-1 z-10">
                              {f.tip}
                            </div>
                          </div>
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900/30 px-4 py-2 transition"
                          placeholder={f.placeholder}
                          value={f.value}
                          onChange={(e) => f.setValue(e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:justify-end">
                <button
                  type="button"
                  className={`px-6 py-3 rounded-lg font-semibold transition ${
                    canSubmit
                      ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-md'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400'
                  }`}
                  onClick={handleTokenize}
                  disabled={!canSubmit}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <AiOutlineLoading3Quarters className="animate-spin" />
                      Creating…
                    </span>
                  ) : (
                    'Tokenize Asset'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ===== RIGHT: NFT MINT PANEL ===== */}
          <div className={`${nftLoading ? 'opacity-90' : ''}`}>
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Tokenize an NFT (Mint ASA)</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Upload an image → backend pins to IPFS → mint an ASA with metadata.
              </p>
            </div>

            <div
              className={`rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-5 sm:p-6 ${
                nftLoading ? 'pointer-events-none opacity-70' : ''
              }`}
            >
              {/* NFT fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Name</label>
                  <input
                    type="text"
                    className="w-full rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900/30 px-4 py-2 transition"
                    value={nftName}
                    onChange={(e) => setNftName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Unit / Symbol</label>
                  <input
                    type="text"
                    className="w-full rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900/30 px-4 py-2 transition"
                    value={nftUnit}
                    onChange={(e) => setNftUnit(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Supply</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900/30 px-4 py-2 transition"
                    value={nftSupply}
                    onChange={(e) => setNftSupply(e.target.value)}
                  />
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">For a true 1/1 NFT, set supply = 1.</p>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    <span>Decimals</span>
                    <div className="group relative">
                      <AiOutlineInfoCircle className="text-slate-400 cursor-help hover:text-slate-600 dark:hover:text-slate-300" />
                      <div className="invisible group-hover:visible bg-slate-900 dark:bg-slate-800 text-white dark:text-slate-200 text-xs rounded px-2 py-1 whitespace-nowrap absolute bottom-full left-0 mb-1 z-10">
                        Decimals controls fractional units. For a typical NFT, use 0.
                      </div>
                    </div>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={19}
                    className="w-full rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900/30 px-4 py-2 transition"
                    value={nftDecimals}
                    onChange={(e) => setNftDecimals(e.target.value)}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={nftDefaultFrozen}
                      onChange={(e) => setNftDefaultFrozen(e.target.checked)}
                      className="h-4 w-4 rounded border border-slate-300 dark:border-slate-600"
                    />
                    <span>Default Frozen</span>
                    <div className="group relative">
                      <AiOutlineInfoCircle className="text-slate-400 cursor-help hover:text-slate-600 dark:hover:text-slate-300" />
                      <div className="invisible group-hover:visible bg-slate-900 dark:bg-slate-800 text-white dark:text-slate-200 text-xs rounded px-2 py-1 whitespace-nowrap absolute bottom-full left-0 mb-1 z-10">
                        If enabled, new holdings start frozen until unfrozen by the Freeze account.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* NFT advanced options toggle */}
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setNftShowAdvanced((s) => !s)}
                  className="flex items-center gap-2 text-sm font-medium text-primary hover:underline transition"
                >
                  <span>{nftShowAdvanced ? 'Hide advanced options' : 'Show advanced options'}</span>
                  <span className={`transition-transform ${nftShowAdvanced ? 'rotate-180' : ''}`}>▾</span>
                </button>

                {nftShowAdvanced && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-5">
                    {[
                      {
                        label: 'Manager',
                        tip: 'Manager can update or reconfigure asset settings. Often set to the issuer wallet.',
                        value: nftManager,
                        setValue: setNftManager,
                        placeholder: 'Defaults to your wallet address',
                      },
                      {
                        label: 'Reserve',
                        tip: 'Reserve can hold non-circulating supply depending on design. Leave blank to disable.',
                        value: nftReserve,
                        setValue: setNftReserve,
                        placeholder: 'Optional address',
                      },
                      {
                        label: 'Freeze',
                        tip: 'Freeze can freeze/unfreeze holdings (useful for compliance). Leave blank to disable.',
                        value: nftFreeze,
                        setValue: setNftFreeze,
                        placeholder: 'Optional address',
                      },
                      {
                        label: 'Clawback',
                        tip: 'Clawback can revoke tokens from accounts (recovery/compliance). Leave blank to disable.',
                        value: nftClawback,
                        setValue: setNftClawback,
                        placeholder: 'Optional address',
                      },
                    ].map((f) => (
                      <div key={f.label}>
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          <span>{f.label}</span>
                          <div className="group relative">
                            <AiOutlineInfoCircle className="text-slate-400 cursor-help hover:text-slate-600 dark:hover:text-slate-300" />
                            <div className="invisible group-hover:visible bg-slate-900 dark:bg-slate-800 text-white dark:text-slate-200 text-xs rounded px-2 py-1 whitespace-nowrap absolute bottom-full left-0 mb-1 z-10">
                              {f.tip}
                            </div>
                          </div>
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900/30 px-4 py-2 transition"
                          placeholder={f.placeholder}
                          value={f.value}
                          onChange={(e) => f.setValue(e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Image upload */}
              <div className="mt-6">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Select an image</label>

                <div
                  className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer bg-slate-50 dark:bg-slate-800/40 hover:border-teal-200 dark:hover:border-teal-700 transition-colors"
                  onClick={handleDivClick}
                >
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="NFT preview"
                      className="rounded-lg max-h-48 object-contain shadow-sm bg-white dark:bg-slate-900"
                    />
                  ) : (
                    <div className="text-center">
                      <AiOutlineCloudUpload className="mx-auto h-12 w-12 text-slate-400" />
                      <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">Drag and drop or click to upload</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">PNG, JPG, GIF up to 10MB</p>
                    </div>
                  )}

                  <input
                    type="file"
                    ref={fileInputRef}
                    className="sr-only"
                    onChange={handleFileChange}
                    accept="image/png, image/jpeg, image/gif"
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-end">
                <button
                  type="button"
                  className="px-6 py-3 rounded-lg font-semibold transition bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                  onClick={resetNftDefaults}
                  disabled={nftLoading}
                >
                  Reset
                </button>

                <button
                  type="button"
                  onClick={handleMintNFT}
                  disabled={!canMintNft}
                  className={`px-6 py-3 rounded-lg font-semibold transition ${
                    canMintNft
                      ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-md'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400'
                  }`}
                >
                  {nftLoading ? (
                    <span className="flex items-center gap-2">
                      <AiOutlineLoading3Quarters className="animate-spin" />
                      Minting…
                    </span>
                  ) : (
                    'Mint NFT'
                  )}
                </button>
              </div>

              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <AiOutlineInfoCircle />
                Uses backend <span className="font-mono">/api/pin-image</span>. In Codespaces, make port 3001 Public.
              </p>
            </div>
          </div>
        </div>

        {/* ===== MY CREATED ASSETS ===== */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">My Created Assets</h3>
            <button
              type="button"
              className="px-3 py-1 text-xs bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition"
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY)
                setCreatedAssets([])
              }}
            >
              Clear
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  <th className="text-left px-4 py-3 font-semibold text-slate-900 dark:text-white">Asset ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900 dark:text-white">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900 dark:text-white">Symbol</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900 dark:text-white">Supply</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900 dark:text-white">Decimals</th>
                </tr>
              </thead>
              <tbody>
                {createdAssets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center px-4 py-6 text-slate-500 dark:text-slate-400">
                      No assets created yet. Mint one to see it here.
                    </td>
                  </tr>
                ) : (
                  createdAssets.map((a) => (
                    <tr
                      key={`${a.assetId}-${a.createdAt}`}
                      className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition"
                      onClick={() => window.open(`${LORA_BASE}/asset/${a.assetId}`, '_blank', 'noopener,noreferrer')}
                      title="Open in Lora explorer"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{a.assetId}</span>
                          <button
                            type="button"
                            className="px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                            onClick={(e) => {
                              e.stopPropagation()
                              copyToClipboard(String(a.assetId))
                            }}
                            title="Copy Asset ID"
                          >
                            Copy
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-900 dark:text-white">{a.assetName}</td>
                      <td className="font-mono px-4 py-3 text-slate-700 dark:text-slate-300">{a.unitName}</td>
                      <td className="font-mono px-4 py-3 text-slate-700 dark:text-slate-300">{a.total}</td>
                      <td className="font-mono px-4 py-3 text-slate-700 dark:text-slate-300">{a.decimals}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <AiOutlineInfoCircle />
            This list is stored locally in your browser (localStorage) to keep the template simple.
          </p>
        </div>

        {/* ===== TRANSFER ===== */}
        <div className="mt-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg p-6 sm:p-8">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Transfer</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">Send ALGO, USDC, or any ASA (including NFTs) to another wallet.</p>

          {/* USDC Opt-in (only relevant for receiving USDC) */}
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4">
            <div className="text-sm text-slate-700 dark:text-slate-200">
              <span className="font-semibold">USDC Opt-In:</span> {renderUsdcStatusText()}
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Asset ID: <span className="font-mono">{TESTNET_USDC_ASSET_ID}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOptInUsdc}
              disabled={!activeAddress || usdcOptedIn || usdcOptInLoading || usdcStatusLoading}
              className={`inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold transition ${
                !activeAddress || usdcOptedIn || usdcOptInLoading || usdcStatusLoading
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400'
                  : 'bg-teal-600 hover:bg-teal-700 text-white shadow-md'
              }`}
            >
              {renderOptInButtonText()}
            </button>
          </div>

          {/* TestNet USDC helper */}
          <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm text-slate-700 dark:text-slate-200">
                Need TestNet USDC? Use Circle&apos;s faucet, then transfer it like any ASA.
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Note: you may need to opt-in to the USDC asset before receiving it.
                </span>
              </div>

              <a
                href="https://faucet.circle.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-md transition"
              >
                Open USDC Faucet ↗
              </a>
            </div>
          </div>

          {/* Mode selector */}
          <div className="mb-5">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Transfer type</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="transferMode"
                  checked={transferMode === 'manual'}
                  onChange={() => setTransferMode('manual')}
                  className="h-4 w-4"
                />
                Manual (custom ASA)
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="transferMode"
                  checked={transferMode === 'algo'}
                  onChange={() => setTransferMode('algo')}
                  className="h-4 w-4"
                />
                ALGO
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="transferMode"
                  checked={transferMode === 'usdc'}
                  onChange={() => setTransferMode('usdc')}
                  className="h-4 w-4"
                />
                USDC (TestNet)
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{transferAssetIdLabel}</label>
              <input
                type="text"
                className="w-full rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900/30 px-4 py-2 transition"
                placeholder="e.g. 123456789"
                value={transferAssetId}
                onChange={(e) => setTransferAssetId(e.target.value)}
                disabled={transferMode === 'algo' || transferMode === 'usdc'}
              />
              {transferMode === 'usdc' && (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  USDC TestNet Asset ID: <span className="font-mono">{TESTNET_USDC_ASSET_ID}</span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Recipient Address</label>
              <input
                type="text"
                className="w-full rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900/30 px-4 py-2 transition"
                placeholder="Wallet address"
                value={receiverAddress}
                onChange={(e) => setReceiverAddress(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{transferAmountLabel}</label>
              <input
                type="text"
                inputMode="decimal"
                className="w-full rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900/30 px-4 py-2 transition"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                placeholder={transferMode === 'manual' ? 'e.g. 1' : 'e.g. 1.5'}
              />
              {transferMode === 'manual' && (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Manual ASA transfers use whole-number amounts.</p>
              )}
              {(transferMode === 'algo' || transferMode === 'usdc') && (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Decimals allowed (up to 6 places).</p>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-end">
            <button
              type="button"
              onClick={handleTransferAsset}
              disabled={transferLoading || !activeAddress}
              className={`px-6 py-3 rounded-lg font-semibold transition ${
                transferLoading || !activeAddress
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400'
                  : 'bg-teal-600 hover:bg-teal-700 text-white shadow-md'
              }`}
            >
              {transferLoading
                ? 'Transferring…'
                : transferMode === 'algo'
                  ? 'Send ALGO'
                  : transferMode === 'usdc'
                    ? 'Send USDC'
                    : 'Transfer Asset'}
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <AiOutlineInfoCircle />
            {transferMode === 'algo'
              ? 'ALGO payments do not require opt-in.'
              : 'For ASAs (including USDC and NFTs), the recipient must opt-in to the asset before receiving it.'}
          </p>
        </div>
      </div>
    </div>
  )
}
