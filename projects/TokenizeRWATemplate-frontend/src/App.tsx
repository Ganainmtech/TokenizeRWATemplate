import { SupportedWallet, WalletId, WalletManager, WalletProvider } from '@txnlab/use-wallet-react'
import { SnackbarProvider } from 'notistack'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Web3AuthProvider } from './components/Web3AuthProvider'
import Home from './Home'
import Layout from './Layout'
import TokenizePage from './TokenizePage'
import { getAlgodConfigFromViteEnvironment, getKmdConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs'

// Configure supported wallets based on network environment
let supportedWallets: SupportedWallet[]
if (import.meta.env.VITE_ALGOD_NETWORK === 'localnet') {
  // LocalNet: KMD wallet for local development
  const kmdConfig = getKmdConfigFromViteEnvironment()
  supportedWallets = [
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
} else {
  // TestNet/MainNet: Browser extension wallets (Pera, Defly, Exodus, Lute)
  supportedWallets = [{ id: WalletId.DEFLY }, { id: WalletId.PERA }, { id: WalletId.EXODUS }, { id: WalletId.LUTE }]
}

/**
 * Main App Component
 * Sets up wallet provider and routing for the Tokenization dApp
 */
export default function App() {
  const algodConfig = getAlgodConfigFromViteEnvironment()

  const walletManager = new WalletManager({
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

  return (
    <SnackbarProvider maxSnack={3}>
      <Web3AuthProvider>
        <WalletProvider manager={walletManager}>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Home />} />
                <Route path="/tokenize" element={<TokenizePage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </WalletProvider>
      </Web3AuthProvider>
    </SnackbarProvider>
  )
}
