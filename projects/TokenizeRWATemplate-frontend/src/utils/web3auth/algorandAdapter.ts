import { IProvider } from '@web3auth/base'
import algosdk from 'algosdk'

/**
 * Algorand Account derived from Web3Auth provider
 *
 * Contains the Algorand address, mnemonic, and secret key
 * Can be used directly with AlgorandClient for signing transactions
 */
export interface AlgorandAccountFromWeb3Auth {
  address: string
  mnemonic: string
  secretKey: Uint8Array
}

/**
 * Convert Web3Auth provider's private key to Algorand account
 *
 * Web3Auth returns a private key in hex format from the OpenLogin adapter.
 * This function:
 * 1. Extracts the private key from the provider
 * 2. Converts it to an Algorand mnemonic using algosdk
 * 3. Derives the account details from the mnemonic
 * 4. Returns address, mnemonic, and secret key for Algorand use
 *
 * @param provider - Web3Auth IProvider instance
 * @returns AlgorandAccountFromWeb3Auth with address, mnemonic, and secretKey
 * @throws Error if provider is invalid or key conversion fails
 *
 * @example
 * ```typescript
 * const provider = web3authInstance.provider;
 * const account = await getAlgorandAccount(provider);
 * console.log('Algorand address:', account.address);
 * // Use account.secretKey with algosdk to sign transactions
 * ```
 */
export async function getAlgorandAccount(provider: IProvider): Promise<AlgorandAccountFromWeb3Auth> {
  if (!provider) {
    throw new Error('Provider is required to derive Algorand account')
  }

  try {
    // Get the private key from Web3Auth provider
    // The private key is stored as a hex string in the provider's private key storage
    const privKey = await provider.request({
      method: 'private_key',
    })

    if (!privKey || typeof privKey !== 'string') {
      throw new Error('Failed to retrieve private key from Web3Auth provider')
    }

    // Remove '0x' prefix if present
    const cleanHexKey = privKey.startsWith('0x') ? privKey.slice(2) : privKey

    // Convert hex string to Uint8Array
    const privateKeyBytes = new Uint8Array(Buffer.from(cleanHexKey, 'hex'))

    // Use only the first 32 bytes for Ed25519 key (Web3Auth may provide more)
    const ed25519SecretKey = privateKeyBytes.slice(0, 32)

    // Convert Ed25519 private key to Algorand mnemonic
    // This creates a standard BIP39/Algorand-compatible mnemonic
    const mnemonic = algosdk.secretKeyToMnemonic(ed25519SecretKey)

    // Derive Algorand account from mnemonic
    // This gives us the address that corresponds to this key
    const accountFromMnemonic = algosdk.mnemonicToSecretKey(mnemonic)

    return {
      address: accountFromMnemonic.addr,
      mnemonic: mnemonic,
      secretKey: accountFromMnemonic.sk, // This is the full 64-byte secret key (32-byte private + 32-byte public)
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to derive Algorand account from Web3Auth: ${error.message}`)
    }
    throw error
  }
}

/**
 * Create a transaction signer function compatible with AlgorandClient
 *
 * This function creates a signer that can be used with @algorandfoundation/algokit-utils
 * for signing transactions with the Web3Auth-derived Algorand account.
 *
 * @param secretKey - The Algorand secret key from getAlgorandAccount()
 * @returns A signer function that accepts transactions and returns signed transactions
 *
 * @example
 * ```typescript
 * const account = await getAlgorandAccount(provider);
 * const signer = createAlgorandSigner(account.secretKey);
 *
 * const result = await algorand.send.assetCreate({
 *   sender: account.address,
 *   signer: signer,
 *   total: BigInt(1000000),
 *   decimals: 6,
 *   assetName: 'My Token',
 *   unitName: 'MYT',
 * });
 * ```
 */
export function createAlgorandSigner(secretKey: Uint8Array) {
  return async (transactions: Uint8Array[]): Promise<Uint8Array[]> => {
    const signedTxns: Uint8Array[] = []

    for (const txn of transactions) {
      try {
        // Sign each transaction with the secret key
        const signedTxn = algosdk.signTransaction(txn, secretKey)
        signedTxns.push(signedTxn.blob)
      } catch (error) {
        throw new Error(`Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    return signedTxns
  }
}

/**
 * Validate if an Algorand address is valid
 * Useful for checking if account derivation succeeded
 *
 * @param address - The address to validate
 * @returns boolean
 */
export function isValidAlgorandAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false
  }

  try {
    algosdk.decodeAddress(address)
    return true
  } catch {
    return false
  }
}

/**
 * Get the public key from an Algorand secret key
 *
 * @param secretKey - The secret key (64 bytes)
 * @returns Uint8Array The public key (32 bytes)
 */
export function getPublicKeyFromSecretKey(secretKey: Uint8Array): Uint8Array {
  if (secretKey.length !== 64) {
    throw new Error(`Invalid secret key length: expected 64 bytes, got ${secretKey.length}`)
  }

  // The public key is the second 32 bytes of the secret key in Ed25519
  return secretKey.slice(32)
}
