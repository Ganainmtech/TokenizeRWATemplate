/**
 * Unified Wallet Hook
 *
 * Combines Web3Auth (Google OAuth) and traditional wallet (Pera/Defly/etc) into ONE interface.
 * Provides a single source of truth for activeAddress and signer across the entire app.
 *
 * Features:
 * - Returns ONE activeAddress (from either Web3Auth OR traditional wallet)
 * - Returns ONE signer (compatible with AlgorandClient)
 * - Indicates which wallet type is active
 * - Handles mutual exclusion (only one can be active at a time)
 *
 * Usage:
 * ```typescript
 * const { activeAddress, signer, walletType, isConnected } = useUnifiedWallet()
 *
 * // walletType will be: 'web3auth' | 'traditional' | null
 * // signer works with: algorand.send.assetCreate({ sender: activeAddress, signer, ... })
 * ```
 */

import { useWallet } from '@txnlab/use-wallet-react'
import { useMemo } from 'react'
import { useWeb3Auth } from '../components/Web3AuthProvider'
import { createWeb3AuthSigner } from '../utils/web3auth/web3authIntegration'

export type WalletType = 'web3auth' | 'traditional' | null

export interface UnifiedWalletState {
  /** The active Algorand address (from either Web3Auth or traditional wallet) */
  activeAddress: string | null

  /** Transaction signer compatible with AlgorandClient */
  signer: any | null

  /** Which wallet system is currently active */
  walletType: WalletType

  /** Whether any wallet is connected */
  isConnected: boolean

  /** Loading state (either wallet system initializing/connecting) */
  isLoading: boolean

  /** Error from either wallet system */
  error: string | null

  /** Original Web3Auth data (for accessing userInfo, etc) */
  web3auth: {
    algorandAccount: ReturnType<typeof useWeb3Auth>['algorandAccount']
    userInfo: ReturnType<typeof useWeb3Auth>['userInfo']
    login: ReturnType<typeof useWeb3Auth>['login']
    logout: ReturnType<typeof useWeb3Auth>['logout']
  }

  /** Original traditional wallet data (for accessing wallet-specific features) */
  traditional: {
    wallets: ReturnType<typeof useWallet>['wallets']
    activeWallet: ReturnType<typeof useWallet>['activeWallet']
  }
}

/**
 * useUnifiedWallet Hook
 *
 * Combines Web3Auth and traditional wallet into a single interface.
 * Priority: Web3Auth takes precedence if both are somehow connected.
 *
 * @returns UnifiedWalletState with activeAddress, signer, and wallet metadata
 *
 * @example
 * ```typescript
 * // In TokenizeAsset.tsx:
 * const { activeAddress, signer, walletType } = useUnifiedWallet()
 *
 * if (!activeAddress) {
 *   return <p>Please connect a wallet</p>
 * }
 *
 * // Use signer with AlgorandClient - works with BOTH wallet types!
 * const result = await algorand.send.assetCreate({
 *   sender: activeAddress,
 *   signer: signer,
 *   total: BigInt(1000000),
 *   decimals: 6,
 *   assetName: 'My Token',
 *   unitName: 'MYT',
 * })
 * ```
 */
export function useUnifiedWallet(): UnifiedWalletState {
  // Get both wallet systems
  const web3auth = useWeb3Auth()
  const traditional = useWallet()

  // Compute unified state
  const state = useMemo<UnifiedWalletState>(() => {
    // Priority 1: Web3Auth (if connected)
    if (web3auth.isConnected && web3auth.algorandAccount) {
      return {
        activeAddress: web3auth.algorandAccount.address,
        signer: createWeb3AuthSigner(web3auth.algorandAccount),
        walletType: 'web3auth',
        isConnected: true,
        isLoading: web3auth.isLoading,
        error: web3auth.error,
        web3auth: {
          algorandAccount: web3auth.algorandAccount,
          userInfo: web3auth.userInfo,
          login: web3auth.login,
          logout: web3auth.logout,
        },
        traditional: {
          wallets: traditional.wallets,
          activeWallet: traditional.activeWallet,
        },
      }
    }

    // Priority 2: Traditional wallet (Pera/Defly/etc)
    if (traditional.activeAddress) {
      return {
        activeAddress: traditional.activeAddress,
        signer: traditional.transactionSigner,
        walletType: 'traditional',
        isConnected: true,
        isLoading: false,
        error: null,
        web3auth: {
          algorandAccount: null,
          userInfo: null,
          login: web3auth.login,
          logout: web3auth.logout,
        },
        traditional: {
          wallets: traditional.wallets,
          activeWallet: traditional.activeWallet,
        },
      }
    }

    // No wallet connected
    return {
      activeAddress: null,
      signer: null,
      walletType: null,
      isConnected: false,
      isLoading: web3auth.isLoading,
      error: web3auth.error,
      web3auth: {
        algorandAccount: null,
        userInfo: null,
        login: web3auth.login,
        logout: web3auth.logout,
      },
      traditional: {
        wallets: traditional.wallets,
        activeWallet: traditional.activeWallet,
      },
    }
  }, [
    web3auth.isConnected,
    web3auth.algorandAccount,
    web3auth.isLoading,
    web3auth.error,
    web3auth.userInfo,
    web3auth.login,
    web3auth.logout,
    traditional.activeAddress,
    traditional.transactionSigner,
    traditional.wallets,
    traditional.activeWallet,
  ])

  return state
}

/**
 * Helper hook: Get just the address (most common use case)
 *
 * @example
 * ```typescript
 * const address = useActiveAddress()
 * if (!address) return <ConnectButton />
 * ```
 */
export function useActiveAddress(): string | null {
  const { activeAddress } = useUnifiedWallet()
  return activeAddress
}

/**
 * Helper hook: Check if any wallet is connected
 *
 * @example
 * ```typescript
 * const isConnected = useIsWalletConnected()
 * ```
 */
export function useIsWalletConnected(): boolean {
  const { isConnected } = useUnifiedWallet()
  return isConnected
}

/**
 * Helper hook: Get wallet type
 *
 * @example
 * ```typescript
 * const walletType = useWalletType()
 * if (walletType === 'web3auth') {
 *   // Show Google profile info
 * }
 * ```
 */
export function useWalletType(): WalletType {
  const { walletType } = useUnifiedWallet()
  return walletType
}
