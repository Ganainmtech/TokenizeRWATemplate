import { useWallet } from '@txnlab/use-wallet-react'
import { Link } from 'react-router-dom'

/**
 * Home Page
 * Landing page showcasing the RWA tokenization platform
 * Displays features, how it works, and CTAs to connect wallet and create assets
 */
export default function Home() {
  const { activeAddress } = useWallet()

  return (
    <div className="bg-white dark:bg-slate-950">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32">
        <div className="text-center">
          <div className="inline-block mb-4 px-3 py-1 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-sm font-semibold rounded-full">
            RWA Tokenization Platform
          </div>

          <h1 className="mt-4 text-5xl sm:text-6xl font-bold text-slate-900 dark:text-white leading-tight">
            Tokenize Real-World Assets on Algorand
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Create Algorand Standard Assets (ASA) with built-in compliance features. Perfect for founders prototyping RWA solutions.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/tokenize"
              className={`px-8 py-3 rounded-lg font-semibold transition text-white shadow-md ${
                activeAddress ? 'bg-teal-600 hover:bg-teal-700' : 'bg-slate-400 cursor-not-allowed'
              }`}
            >
              Start Tokenizing
            </Link>

            <a
              className="px-8 py-3 border-2 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg font-semibold hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
              target="_blank"
              rel="noreferrer"
              href="https://dev.algorand.co/concepts/assets/overview/"
            >
              Learn about ASAs
            </a>
          </div>

          {!activeAddress && (
            <p className="mt-6 text-slate-500 dark:text-slate-400">Connect your wallet using the button in the top-right to get started.</p>
          )}
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-slate-50 dark:bg-slate-900 py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">How It Works</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8 hover:shadow-lg transition">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 font-bold text-lg mb-4">
                1
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Connect Wallet</h3>
              <p className="text-slate-600 dark:text-slate-300">Use Pera, Defly, Exodus, or KMD on localnet. One click to connect.</p>
            </div>

            {/* Step 2 */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8 hover:shadow-lg transition">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 font-bold text-lg mb-4">
                2
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Create ASA</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Define asset properties: name, symbol, supply, and optional metadata URL.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8 hover:shadow-lg transition">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 font-bold text-lg mb-4">
                3
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Track Assets</h3>
              <p className="text-slate-600 dark:text-slate-300">
                View your created assets in a local history table (stored in your browser).
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Features Highlight */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-6">Compliance-Ready Features</h2>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <span className="text-blue-600 font-bold text-xl">✓</span>
                <span className="text-gray-700 dark:text-gray-300">
                  <strong>Manager Role:</strong> Update asset settings
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-blue-600 font-bold text-xl">✓</span>
                <span className="text-gray-700 dark:text-gray-300">
                  <strong>Freeze Account:</strong> Restrict transfers
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-blue-600 font-bold text-xl">✓</span>
                <span className="text-gray-700 dark:text-gray-300">
                  <strong>Clawback Authority:</strong> Recover tokens if needed
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-blue-600 font-bold text-xl">✓</span>
                <span className="text-gray-700 dark:text-gray-300">
                  <strong>Metadata Support:</strong> Link off-chain documentation
                </span>
              </li>
            </ul>
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-8">
            <div className="bg-white dark:bg-slate-700 rounded border border-slate-300 dark:border-slate-600 p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 font-mono">Asset Configuration Example</p>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Name:</span>{' '}
                  <span className="font-semibold text-gray-900 dark:text-white">Real Estate Token</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Symbol:</span>{' '}
                  <span className="font-semibold text-gray-900 dark:text-white">PROPERTY</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Total Supply:</span>{' '}
                  <span className="font-semibold text-gray-900 dark:text-white">1,000,000</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Decimals:</span>{' '}
                  <span className="font-semibold text-gray-900 dark:text-white">2</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Manager:</span>{' '}
                  <span className="font-semibold text-gray-900 dark:text-white">Your Wallet</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-teal-600 dark:bg-teal-700 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-lg text-teal-100 mb-8 max-w-2xl mx-auto">
            Launch your first RWA token in minutes. No complicated setup, no hidden fees.
          </p>
          <Link
            to="/tokenize"
            className={`inline-block px-8 py-3 rounded-lg font-semibold transition ${
              activeAddress
                ? 'bg-white text-teal-600 dark:bg-slate-800 dark:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-md'
                : 'bg-teal-400 text-white cursor-not-allowed'
            }`}
          >
            Create Your First Asset
          </Link>
        </div>
      </div>
    </div>
  )
}
