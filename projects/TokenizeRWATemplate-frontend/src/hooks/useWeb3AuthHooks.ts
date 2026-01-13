/**
 * Custom Hooks for Web3Auth Integration
 *
 * These hooks provide convenient access to Web3Auth functionality
 * and combine common patterns.
 */

import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import algosdk from 'algosdk'
import { useCallback, useEffect, useState } from 'react'
import { useWeb3Auth } from '../components/Web3AuthProvider'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'
import { createWeb3AuthSigner, formatAmount, parseAmount } from '../utils/web3auth/web3authIntegration'

/**
 * Hook to get an initialized AlgorandClient using Web3Auth account
 *
 * @returns AlgorandClient instance or null if not connected
 *
 * @example
 * ```typescript
 * const algorand = useAlgorandClient();
 *
 * if (!algorand) return <p>Not connected</p>;
 *
 * const result = await algorand.send.assetCreate({...});
 * ```
 */
export function useAlgorandClient() {
  const { isConnected } = useWeb3Auth()
  const [client, setClient] = useState<AlgorandClient | null>(null)

  useEffect(() => {
    if (isConnected) {
      const algodConfig = getAlgodConfigFromViteEnvironment()
      const algorand = AlgorandClient.fromConfig({ algodConfig })
      setClient(algorand)
    } else {
      setClient(null)
    }
  }, [isConnected])

  return client
}

/**
 * Hook to get an algosdk Algodv2 client using Web3Auth configuration
 *
 * @returns Algodv2 client instance
 *
 * @example
 * ```typescript
 * const algod = useAlgod();
 * const accountInfo = await algod.accountInformation(address).do();
 * ```
 */
export function useAlgod() {
  const algodConfig = getAlgodConfigFromViteEnvironment()

  return new algosdk.Algodv2(algodConfig.token, algodConfig.server, algodConfig.port)
}

/**
 * Hook to get account balance in Algos
 *
 * @returns { balance: string | null, loading: boolean, error: string | null, refetch: () => Promise<void> }
 *
 * @example
 * ```typescript
 * const { balance, loading, error } = useAccountBalance();
 *
 * if (loading) return <p>Loading...</p>;
 * if (error) return <p>Error: {error}</p>;
 * return <p>Balance: {balance} ALGO</p>;
 * ```
 */
export function useAccountBalance() {
  const { algorandAccount } = useWeb3Auth()
  const algod = useAlgod()

  const [balance, setBalance] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBalance = useCallback(async () => {
    if (!algorandAccount?.address) {
      setBalance(null)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const accountInfo = await algod.accountInformation(algorandAccount.address).do()
      const balanceInAlgos = formatAmount(BigInt(accountInfo.amount), 6)

      setBalance(balanceInAlgos)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch balance'
      setError(errorMessage)
      setBalance(null)
    } finally {
      setLoading(false)
    }
  }, [algorandAccount?.address, algod])

  // Fetch balance on mount and when account changes
  useEffect(() => {
    fetchBalance()
  }, [fetchBalance])

  return {
    balance,
    loading,
    error,
    refetch: fetchBalance,
  }
}

/**
 * Hook to check if account has sufficient balance
 *
 * @param amount - Amount needed in Algos (string like "1.5")
 * @param fee - Transaction fee in Algos (default "0.001")
 * @returns { hasSufficientBalance: boolean, balance: string | null, required: string }
 *
 * @example
 * ```typescript
 * const { hasSufficientBalance } = useHasSufficientBalance("10");
 *
 * if (!hasSufficientBalance) {
 *   return <p>Insufficient balance. Need at least 10 ALGO</p>;
 * }
 * ```
 */
export function useHasSufficientBalance(amount: string, fee: string = '0.001') {
  const { balance } = useAccountBalance()

  const hasSufficientBalance = (() => {
    if (!balance) return false

    try {
      const balanceBigInt = parseAmount(balance, 6)
      const amountBigInt = parseAmount(amount, 6)
      const feeBigInt = parseAmount(fee, 6)

      return balanceBigInt >= amountBigInt + feeBigInt
    } catch {
      return false
    }
  })()

  return {
    hasSufficientBalance,
    balance,
    required: `${parseAmount(amount, 6)} (+ ${fee} fee)`,
  }
}

/**
 * Hook to sign and submit transactions
 *
 * @returns { sendTransaction: (txns: Uint8Array[]) => Promise<string>, loading: boolean, error: string | null }
 *
 * @example
 * ```typescript
 * const { sendTransaction, loading, error } = useSendTransaction();
 *
 * const handleSend = async () => {
 *   const txnId = await sendTransaction([signedTxn]);
 *   console.log('Sent:', txnId);
 * };
 * ```
 */
export function useSendTransaction() {
  const algod = useAlgod()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendTransaction = useCallback(
    async (transactions: Uint8Array[]): Promise<string> => {
      try {
        setLoading(true)
        setError(null)

        if (transactions.length === 0) {
          throw new Error('No transactions to send')
        }

        // Send the first transaction (or could batch if group)
        const result = await algod.sendRawTransaction(transactions[0]).do()

        return result.txId
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to send transaction'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [algod],
  )

  return {
    sendTransaction,
    loading,
    error,
  }
}

/**
 * Hook to wait for transaction confirmation
 *
 * @param txnId - Transaction ID to wait for
 * @param timeout - Timeout in seconds (default: 30)
 * @returns { confirmed: boolean, confirmation: any | null, loading: boolean, error: string | null }
 *
 * @example
 * ```typescript
 * const { confirmed, confirmation } = useWaitForConfirmation(txnId);
 *
 * if (confirmed) {
 *   console.log('Confirmed round:', confirmation['confirmed-round']);
 * }
 * ```
 */
export function useWaitForConfirmation(txnId: string | null, timeout: number = 30) {
  const algod = useAlgod()

  const [confirmed, setConfirmed] = useState(false)
  const [confirmation, setConfirmation] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!txnId) return

    const waitForConfirmation = async () => {
      try {
        setLoading(true)
        setError(null)

        const confirmation = await algosdk.waitForConfirmation(algod, txnId, timeout)

        setConfirmation(confirmation)
        setConfirmed(true)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to confirm transaction'
        setError(errorMessage)
        setConfirmed(false)
      } finally {
        setLoading(false)
      }
    }

    waitForConfirmation()
  }, [txnId, algod, timeout])

  return {
    confirmed,
    confirmation,
    loading,
    error,
  }
}

/**
 * Hook for creating and signing assets (ASAs)
 *
 * @returns { createAsset: (params: AssetCreateParams) => Promise<number>, loading: boolean, error: string | null }
 *
 * @example
 * ```typescript
 * const { createAsset, loading } = useCreateAsset();
 *
 * const assetId = await createAsset({
 *   total: 1000000n,
 *   decimals: 6,
 *   assetName: 'My Token',
 *   unitName: 'MYT',
 * });
 * ```
 */
export function useCreateAsset() {
  const { algorandAccount } = useWeb3Auth()
  const algorand = useAlgorandClient()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createAsset = useCallback(
    async (params: {
      total: bigint
      decimals: number
      assetName: string
      unitName: string
      url?: string
      manager?: string
      reserve?: string
      freeze?: string
      clawback?: string
    }): Promise<number> => {
      if (!algorandAccount || !algorand) {
        throw new Error('Not connected to Web3Auth')
      }

      try {
        setLoading(true)
        setError(null)

        const signer = createWeb3AuthSigner(algorandAccount)

        const result = await algorand.send.assetCreate({
          sender: algorandAccount.address,
          signer: signer,
          ...params,
        })

        const assetId = result.confirmation?.assetIndex

        if (!assetId) {
          throw new Error('Failed to get asset ID from confirmation')
        }

        return assetId
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create asset'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [algorandAccount, algorand],
  )

  return {
    createAsset,
    loading,
    error,
  }
}

/**
 * Hook for transferring assets (ASAs or Algo)
 *
 * @returns { sendAsset: (params: AssetTransferParams) => Promise<string>, loading: boolean, error: string | null }
 *
 * @example
 * ```typescript
 * const { sendAsset, loading } = useSendAsset();
 *
 * const txnId = await sendAsset({
 *   to: recipientAddress,
 *   assetId: 123456,
 *   amount: 100n,
 * });
 * ```
 */
export function useSendAsset() {
  const { algorandAccount } = useWeb3Auth()
  const algorand = useAlgorandClient()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendAsset = useCallback(
    async (params: { to: string; assetId?: number; amount: bigint; closeRemainderTo?: string }): Promise<string> => {
      if (!algorandAccount || !algorand) {
        throw new Error('Not connected to Web3Auth')
      }

      try {
        setLoading(true)
        setError(null)

        const signer = createWeb3AuthSigner(algorandAccount)

        const result = params.assetId
          ? await algorand.send.assetTransfer({
              sender: algorandAccount.address,
              signer: signer,
              ...params,
            })
          : await algorand.send.payment({
              sender: algorandAccount.address,
              signer: signer,
              receiver: params.to,
              amount: params.amount,
            })

        return result.txId
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to send asset'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [algorandAccount, algorand],
  )

  return {
    sendAsset,
    loading,
    error,
  }
}
