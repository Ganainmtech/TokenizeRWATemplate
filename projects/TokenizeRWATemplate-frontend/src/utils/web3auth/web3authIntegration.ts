// web3authIntegration.ts
import algosdk, { TransactionSigner } from 'algosdk'
import { AlgorandAccountFromWeb3Auth } from './algorandAdapter'

/**
 * Integration Utilities for Web3Auth with AlgorandClient
 *
 * IMPORTANT:
 * @algorandfoundation/algokit-utils AlgorandClient expects `signer` to be a *function*
 * (algosdk.TransactionSigner), NOT an object like { sign: fn }.
 *
 * If you pass an object, you’ll hit: TypeError: signer is not a function
 */

/**
 * (Legacy) Your old shape (kept only for compatibility if other code uses it).
 * AlgorandClient does NOT accept this shape as `signer`.
 */
export interface AlgorandTransactionSigner {
  sign: (transactions: Uint8Array[]) => Promise<Uint8Array[]>
  sender?: string
}

/**
 * ✅ Correct: Convert Web3Auth Algorand account to an AlgorandClient-compatible signer function.
 *
 * Returns algosdk.TransactionSigner which matches AlgoKit / AlgorandClient expectations:
 *   (txnGroup, indexesToSign) => Promise<Uint8Array[]>
 *
 * Use like:
 *   const signer = createWeb3AuthSigner(algorandAccount)
 *   await algorand.send.assetCreate({ sender: algorandAccount.address, signer, ... })
 */
export function createWeb3AuthSigner(account: AlgorandAccountFromWeb3Auth): TransactionSigner {
  // Web3Auth account should contain a Uint8Array secretKey (Algorand secret key).
  // We build an algosdk basic account signer (official helper).
  const sk = account.secretKey
  const addr = account.address

  // If your secretKey is not a Uint8Array for some reason, try to coerce it.
  // (This is defensive; ideally it is already Uint8Array.)
  const secretKey: Uint8Array =
    sk instanceof Uint8Array
      ? sk
      : // @ts-expect-error - allow Array<number> fallback
        Array.isArray(sk)
        ? Uint8Array.from(sk)
        : (() => {
            throw new Error('Web3Auth secretKey is not a Uint8Array (or number[]). Cannot sign transactions.')
          })()

  return algosdk.makeBasicAccountTransactionSigner({
    addr,
    sk: secretKey,
  })
}

/**
 * (Optional helper) If you *still* want the old object shape for other code,
 * this returns { sign, sender } — but DO NOT pass this as AlgorandClient `signer`.
 */
export function createWeb3AuthSignerObject(account: AlgorandAccountFromWeb3Auth): AlgorandTransactionSigner {
  const signerFn = createWeb3AuthSigner(account)

  // Wrap TransactionSigner into "sign(bytes[])" style ONLY if you need it elsewhere
  const sign = async (transactions: Uint8Array[]) => {
    // These are already bytes; we need Transaction objects for TransactionSigner.
    // This wrapper is best-effort and not recommended for AlgoKit usage.
    const txns = transactions.map((b) => algosdk.decodeUnsignedTransaction(b))
    const signed = await signerFn(txns, txns.map((_, i) => i))
    return signed
  }

  return {
    sign,
    sender: account.address,
  }
}

/**
 * Create a multi-signature compatible signer for Web3Auth accounts
 *
 * For AlgoKit, you still want the signer to be a TransactionSigner function.
 * This returns both the function and some metadata.
 */
export function createWeb3AuthMultiSigSigner(account: AlgorandAccountFromWeb3Auth) {
  return {
    signer: createWeb3AuthSigner(account), // ✅ TransactionSigner function
    sender: account.address,
    account, // original account for context
  }
}

/**
 * Get account information needed for transaction construction
 *
 * Returns the public key and address in formats needed for
 * transaction construction and verification
 */
export function getWeb3AuthAccountInfo(account: AlgorandAccountFromWeb3Auth) {
  const decodedAddress = algosdk.decodeAddress(account.address)

  return {
    address: account.address,
    publicKeyBytes: decodedAddress.publicKey,
    publicKeyBase64: Buffer.from(decodedAddress.publicKey).toString('base64'),
    secretKeyHex: Buffer.from(account.secretKey).toString('hex'),
    mnemonicPhrase: account.mnemonic,
  }
}

/**
 * Verify that a transaction was signed by the Web3Auth account
 *
 * Useful for verification and testing
 */
export function verifyWeb3AuthSignature(signedTransaction: Uint8Array, account: AlgorandAccountFromWeb3Auth): boolean {
  try {
    const decodedTxn = algosdk.decodeSignedTransaction(signedTransaction)

    // In algosdk, signature can be represented differently depending on type.
    // We’ll attempt to compare signer public key where available.
    const txnSigner = decodedTxn.sig?.signers?.[0] ?? decodedTxn.sig?.signer

    if (!txnSigner) return false

    const decodedAddress = algosdk.decodeAddress(account.address)
    return Buffer.from(txnSigner).equals(decodedAddress.publicKey)
  } catch (error) {
    console.error('Error verifying signature:', error)
    return false
  }
}

/**
 * Get transaction group size details
 */
export function analyzeTransactionGroup(transactions: Uint8Array[]) {
  return {
    count: transactions.length,
    totalSize: transactions.reduce((sum, txn) => sum + txn.length, 0),
    averageSize: transactions.reduce((sum, txn) => sum + txn.length, 0) / transactions.length,
  }
}

/**
 * Format a transaction amount with proper decimals for display
 */
export function formatAmount(amount: bigint | number, decimals: number = 6): string {
  const amountStr = amount.toString()
  const decimalPoints = decimals

  if (amountStr.length <= decimalPoints) {
    return `0.${amountStr.padStart(decimalPoints, '0')}`
  }

  const integerPart = amountStr.slice(0, -decimalPoints)
  const decimalPart = amountStr.slice(-decimalPoints)

  return `${integerPart}.${decimalPart}`
}

/**
 * Parse a user-input amount string to base units (reverse of formatAmount)
 */
export function parseAmount(amount: string, decimals: number = 6): bigint {
  const trimmed = amount.trim()

  if (!trimmed) {
    throw new Error('Amount is required')
  }

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Invalid amount format')
  }

  const [integerPart = '0', decimalPart = ''] = trimmed.split('.')

  if (decimalPart.length > decimals) {
    throw new Error(`Too many decimal places (maximum ${decimals})`)
  }

  const paddedDecimal = decimalPart.padEnd(decimals, '0')
  const combined = integerPart + paddedDecimal
  return BigInt(combined)
}

/**
 * Check if Web3Auth account has sufficient balance for a transaction
 */
export function hasSufficientBalance(balance: bigint, requiredAmount: bigint, minFee: bigint = BigInt(1000)): boolean {
  const totalRequired = requiredAmount + minFee
  return balance >= totalRequired
}
