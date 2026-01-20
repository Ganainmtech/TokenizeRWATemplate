import { SupportedWallet, WalletId, WalletManager, WalletProvider } from '@txnlab/use-wallet-react'
import { Analytics } from '@vercel/analytics/next'
import { SnackbarProvider } from 'notistack'
import { useMemo } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Home from './Home'
import Layout from './Layout'
import TokenizePage from './TokenizePage'
import { getAlgodConfigFromViteEnvironment, getKmdConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs'

// Get Web3Auth client ID from environment
const web3AuthClientId = (import.meta.env.VITE_WEB3AUTH_CLIENT_ID ?? '').trim()

/**
 * Build supported wallets list based on env/network.
 * NOTE: Web3Auth defaults to sapphire_mainnet unless web3AuthNetwork is provided.
 */
function buildSupportedWallets(): SupportedWallet[] {
  if (import.meta.env.VITE_ALGOD_NETWORK === 'localnet') {
    const kmdConfig = getKmdConfigFromViteEnvironment()
    return [
      {
        id: WalletId.KMD,
        options: {
          baseServer: kmdConfig.server,
          token: String(kmdConfig.token),
          port: String(kmdConfig.port),
        },
      },
      { id: WalletId.LUTE },
    ]
  }

  // TestNet/MainNet wallets
  const wallets: SupportedWallet[] = [{ id: WalletId.PERA }, { id: WalletId.DEFLY }, { id: WalletId.LUTE }]

  // Only add Web3Auth if we actually have a client id
  // use-wallet v4.4.0+ includes built-in Web3Auth provider
  if (web3AuthClientId) {
    wallets.push({
      id: WalletId.WEB3AUTH,
      options: {
        clientId: web3AuthClientId,
        web3AuthNetwork: 'sapphire_devnet', // Use 'sapphire_mainnet' for production
        uiConfig: {
          appName: 'Tokenize RWA Template',
          mode: 'auto', // 'auto' | 'light' | 'dark'
        },
      },
    })
  }

  return wallets
}

export default function App() {
  const algodConfig = getAlgodConfigFromViteEnvironment()

  const supportedWallets = useMemo(() => buildSupportedWallets(), [])
  const walletManager = useMemo(() => {
    return new WalletManager({
      wallets: supportedWallets,
      defaultNetwork: algodConfig.network,
      networks: {
        [algodConfig.network]: {
          algod: {
            baseServer: algodConfig.server,
            port: algodConfig.port,
            token: String(algodConfig.token),
          },
        },
      },
      options: {
        resetNetwork: true,
      },
    })
  }, [algodConfig.network, algodConfig.server, algodConfig.port, algodConfig.token, supportedWallets])

  return (
    <SnackbarProvider maxSnack={3}>
      <WalletProvider manager={walletManager}>
        <BrowserRouter>
          <Analytics />
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/tokenize" element={<TokenizePage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </WalletProvider>
    </SnackbarProvider>
  )
}
