import { CHAIN_NAMESPACES, IProvider, WEB3AUTH_NETWORK } from '@web3auth/base'
import { CommonPrivateKeyProvider } from '@web3auth/base-provider'
import { Web3Auth } from '@web3auth/modal'

let web3authInstance: Web3Auth | null = null

export async function initWeb3Auth(): Promise<Web3Auth> {
  console.log('========================================')
  console.log('🔧 STARTING WEB3AUTH INITIALIZATION')
  console.log('========================================')

  if (web3authInstance) {
    console.log('✅ Web3Auth already initialized, returning existing instance')
    return web3authInstance
  }

  const clientId = import.meta.env.VITE_WEB3AUTH_CLIENT_ID
  console.log('📋 Client ID check:', clientId ? '✅ SET' : '❌ MISSING')
  console.log('📋 Client ID length:', clientId?.length || 0)
  console.log('📋 Client ID (first 20 chars):', clientId?.substring(0, 20) + '...')

  if (!clientId) {
    const error = new Error('VITE_WEB3AUTH_CLIENT_ID is not configured')
    console.error('❌ ERROR:', error.message)
    throw error
  }

  try {
    console.log('📦 Creating privateKeyProvider...')

    // Create the private key provider for Algorand
    const privateKeyProvider = new CommonPrivateKeyProvider({
      config: {
        chainConfig: {
          chainNamespace: CHAIN_NAMESPACES.OTHER,
          chainId: '0x1',
          rpcTarget: 'https://testnet-api.algonode.cloud',
          displayName: 'Algorand TestNet',
          blockExplorerUrl: 'https://testnet.algoexplorer.io',
          ticker: 'ALGO',
          tickerName: 'Algorand',
        },
      },
    })

    console.log('✅ privateKeyProvider created')
    console.log('📦 Creating Web3Auth configuration object...')

    const web3AuthConfig = {
      clientId,
      web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
      privateKeyProvider, // ← THIS IS REQUIRED!
      uiConfig: {
        appName: 'TokenizeRWA',
        theme: {
          primary: '#000000',
        },
        mode: 'light' as const,
        loginMethodsOrder: ['google', 'github', 'twitter'],
        defaultLanguage: 'en',
      },
    }

    console.log('📦 Config created with privateKeyProvider')
    console.log('🏗️ Instantiating Web3Auth...')

    web3authInstance = new Web3Auth(web3AuthConfig)

    console.log('✅ Web3Auth instance created successfully')
    console.log('📞 Calling initModal()...')

    await web3authInstance.initModal()

    console.log('✅ initModal() completed successfully')
    console.log('📊 Web3Auth status:', web3authInstance.status)
    console.log('📊 Web3Auth connected:', web3authInstance.connected)
    console.log('========================================')
    console.log('✅ WEB3AUTH INITIALIZATION COMPLETE')
    console.log('========================================')

    return web3authInstance
  } catch (error) {
    console.error('========================================')
    console.error('❌ WEB3AUTH INITIALIZATION FAILED')
    console.error('========================================')
    console.error('Error type:', error?.constructor?.name)
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
    console.error('Full error:', error)
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('========================================')
    throw error
  }
}

export function getWeb3AuthInstance(): Web3Auth | null {
  console.log('🔍 getWeb3AuthInstance() called, instance:', web3authInstance ? '✅ EXISTS' : '❌ NULL')
  return web3authInstance
}

export function getWeb3AuthProvider(): IProvider | null {
  const provider = web3authInstance?.provider || null
  console.log('🔍 getWeb3AuthProvider() called, provider:', provider ? '✅ EXISTS' : '❌ NULL')
  return provider
}

export function isWeb3AuthConnected(): boolean {
  const connected = web3authInstance?.status === 'connected'
  console.log('🔍 isWeb3AuthConnected() called, connected:', connected)
  return connected
}

export interface Web3AuthUserInfo {
  email?: string
  name?: string
  profileImage?: string
  [key: string]: unknown
}

export async function getWeb3AuthUserInfo(): Promise<Web3AuthUserInfo | null> {
  console.log('🔍 getWeb3AuthUserInfo() called')

  if (!web3authInstance || !isWeb3AuthConnected()) {
    console.log('❌ Cannot get user info: not connected')
    return null
  }

  try {
    const userInfo = await web3authInstance.getUserInfo()
    console.log('✅ User info retrieved:', userInfo)
    return userInfo as Web3AuthUserInfo
  } catch (error) {
    console.error('❌ Failed to get user info:', error)
    return null
  }
}

export async function logoutFromWeb3Auth(): Promise<void> {
  console.log('🚪 logoutFromWeb3Auth() called')

  if (!web3authInstance) {
    console.log('⚠️ No instance to logout from')
    return
  }

  try {
    await web3authInstance.logout()
    console.log('✅ Logged out successfully')
  } catch (error) {
    console.error('❌ Logout failed:', error)
    throw error
  }
}
