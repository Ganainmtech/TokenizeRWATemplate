import { useWallet } from '@txnlab/use-wallet-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import ConnectWallet from './components/ConnectWallet'
import ThemeToggle from './components/ThemeToggle'
import { ellipseAddress } from './utils/ellipseAddress'

export default function Layout() {
  const [openWalletModal, setOpenWalletModal] = useState(false)
  const { activeAddress } = useWallet()

  const toggleWalletModal = () => setOpenWalletModal(!openWalletModal)

  // Check if wallet is connected - activeAddress is the primary indicator
  // isActive might be undefined for Web3Auth, so we check activeAddress
  const isConnected = Boolean(activeAddress)

  // Helper to format address: "ZBC...WXYZ"
  const displayAddress = isConnected && activeAddress ? ellipseAddress(activeAddress, 4) : 'Sign in'

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Navbar */}
      <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <NavLink to="/" className="text-2xl font-bold text-slate-900 dark:text-white hover:text-teal-600 transition">
            TokenizeRWA
          </NavLink>

          {/* Desktop Navigation */}
          <div className="hidden sm:flex items-center gap-8">
            {['Home', 'Tokenize'].map((item) => (
              <NavLink
                key={item}
                to={item === 'Home' ? '/' : `/${item.toLowerCase()}`}
                className={({ isActive }) =>
                  `text-sm font-semibold transition ${isActive ? 'text-teal-600' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`
                }
              >
                {item}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />

            {/* Sign In / Account Button */}
            <button
              onClick={toggleWalletModal}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm transition shadow-sm border ${
                isConnected
                  ? 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  : 'bg-teal-600 border-teal-600 text-white hover:bg-teal-700'
              }`}
            >
              {isConnected && <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />}
              {displayAddress}
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto grid gap-8 md:grid-cols-3">
          <div>
            <div className="text-xl font-bold text-white mb-3">TokenizeRWA</div>
            <p className="text-sm">POC template for tokenizing real-world assets on Algorand.</p>
          </div>
          <div className="text-sm">
            <span className="text-white font-bold block mb-2">Connect</span>
            <a href="https://lora.algokit.io" target="_blank" className="hover:text-teal-400 transition">
              Lora Explorer →
            </a>
          </div>
          <div className="text-xs">© {new Date().getFullYear()} TokenizeRWA. All rights reserved.</div>
        </div>
      </footer>

      {/* Wallet Modal */}
      <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
    </div>
  )
}
