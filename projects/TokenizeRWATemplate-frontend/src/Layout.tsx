import { useWallet } from '@txnlab/use-wallet-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import ConnectWallet from './components/ConnectWallet'
import ThemeToggle from './components/ThemeToggle'

/**
 * Main Layout Component
 * Wraps the entire app with navigation, footer, and wallet connection modal
 */
export default function Layout() {
  const [openWalletModal, setOpenWalletModal] = useState(false)
  const { activeAddress } = useWallet()

  const toggleWalletModal = () => setOpenWalletModal(!openWalletModal)

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Navbar */}
      <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <NavLink
            to="/"
            className="text-2xl font-bold text-slate-900 dark:text-white hover:text-teal-600 dark:hover:text-teal-400 transition"
          >
            TokenizeRWA
          </NavLink>

          <div className="hidden sm:flex items-center gap-6">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 font-medium transition ${isActive ? 'text-slate-900 dark:text-slate-100 border-b-2 border-teal-600' : ''}`
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/tokenize"
              className={({ isActive }) =>
                `text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 font-medium transition ${isActive ? 'text-slate-900 dark:text-slate-100 border-b-2 border-teal-600' : ''}`
              }
            >
              Tokenize
            </NavLink>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={toggleWalletModal}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition text-sm shadow-sm"
            >
              {activeAddress ? 'Wallet Connected' : 'Connect Wallet'}
            </button>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 dark:bg-slate-950 text-slate-300 dark:text-slate-400 border-t border-slate-800 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <div className="text-xl font-bold text-white">TokenizeRWA</div>
              <p className="mt-3 text-sm leading-relaxed">
                A lightweight proof-of-concept template for tokenizing real-world assets on Algorand.
              </p>
            </div>

            <div>
              <div className="font-semibold text-white mb-4">Resources</div>
              <ul className="space-y-2 text-sm">
                <li>
                  <NavLink to="/tokenize" className="hover:text-white transition">
                    Tokenize an Asset
                  </NavLink>
                </li>
                <li>
                  <a
                    className="hover:text-white transition"
                    href="https://dev.algorand.co/concepts/assets/overview/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    ASA Documentation →
                  </a>
                </li>
                <li>
                  <a className="hover:text-white transition" href="https://lora.algokit.io/testnet" target="_blank" rel="noreferrer">
                    Lora Explorer →
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <div className="font-semibold text-white mb-4">About</div>
              <p className="text-sm leading-relaxed">
                A POC template for founders. For production, add compliance workflows, identity verification, and audit logs.
              </p>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-800 text-xs text-gray-400 flex flex-col sm:flex-row gap-2 sm:justify-between">
            <span>© {new Date().getFullYear()} TokenizeRWA. All rights reserved.</span>
            <span>Built with AlgoKit + Algorand</span>
          </div>
        </div>
      </footer>

      <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
    </div>
  )
}
