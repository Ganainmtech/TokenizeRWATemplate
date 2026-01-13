# Web3Auth Integration Guide

## Overview

Web3Auth has been successfully integrated into your Algorand tokenization dApp. This allows users to sign in with Google (or other social logins) and automatically get an Algorand wallet generated from their Web3Auth credentials.

## Installation

### 1. Install Dependencies

Run the following command in your `TokenizeRWATemplate-frontend` directory:

```bash
npm install @web3auth/modal @web3auth/base @web3auth/openlogin-adapter
```

### 2. Get Web3Auth Client ID

1. Go to [Web3Auth Dashboard](https://dashboard.web3auth.io)
2. Create a new application or use an existing one
3. Copy your **Client ID**
4. Add it to your `.env` file:

```dotenv
VITE_WEB3AUTH_CLIENT_ID=your_client_id_here
```

## File Structure Created

```
src/
├── utils/
│   └── web3auth/
│       ├── web3authConfig.ts          # Web3Auth initialization and config
│       ├── algorandAdapter.ts         # Convert Web3Auth keys to Algorand format
│       └── web3authIntegration.ts     # Integration helpers for AlgorandClient
├── components/
│   ├── Web3AuthProvider.tsx           # React Context Provider
│   └── Web3AuthButton.tsx             # Connect/Disconnect button component
└── hooks/
    └── (useWeb3Auth exported from Web3AuthProvider)
```

## Files Created

### 1. `src/utils/web3auth/web3authConfig.ts`

Initializes Web3Auth with:

- Google OAuth via OpenLogin adapter
- Algorand TestNet configuration (chainNamespace: OTHER)
- Sapphire DevNet for development
- Functions: `initWeb3Auth()`, `getWeb3AuthProvider()`, `isWeb3AuthConnected()`, etc.

### 2. `src/utils/web3auth/algorandAdapter.ts`

Converts Web3Auth keys to Algorand format:

- `getAlgorandAccount(provider)` - Extracts private key and converts to Algorand account
- `createAlgorandSigner(secretKey)` - Creates a signer for transactions
- Helper functions for validation and key derivation

### 3. `src/utils/web3auth/web3authIntegration.ts`

Integration utilities for AlgorandClient:

- `createWeb3AuthSigner(account)` - Drop-in signer for AlgorandClient
- Amount formatting and parsing utilities
- Transaction verification and analysis helpers
- Balance checking utilities

### 4. `src/components/Web3AuthProvider.tsx`

React Context Provider with:

- State management for Web3Auth and Algorand account
- `login()` / `logout()` functions
- `useWeb3Auth()` custom hook
- Automatic user info fetching from OAuth provider

### 5. `src/components/Web3AuthButton.tsx`

UI Component with:

- "Sign in with Google" button when disconnected
- Address display with dropdown menu when connected
- Profile picture, name, and email display
- Copy address and disconnect buttons
- Loading and error states

## Updated Files

### `src/App.tsx`

Wrapped the app with `<Web3AuthProvider>` to provide Web3Auth context throughout the application:

```tsx
<Web3AuthProvider>
  <WalletProvider manager={walletManager}>{/* your routes */}</WalletProvider>
</Web3AuthProvider>
```

### `.env.template`

Added:

```dotenv
VITE_WEB3AUTH_CLIENT_ID=""
```

## Usage Examples

### Basic Usage in Components

```typescript
import { useWeb3Auth } from './components/Web3AuthProvider'

export function MyComponent() {
  const { isConnected, algorandAccount, login, logout } = useWeb3Auth()

  if (!isConnected) {
    return <button onClick={login}>Sign in with Google</button>
  }

  return (
    <div>
      <p>Connected: {algorandAccount?.address}</p>
      <button onClick={logout}>Disconnect</button>
    </div>
  )
}
```

### Using with AlgorandClient

```typescript
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { createWeb3AuthSigner } from './utils/web3auth/web3authIntegration'
import { useWeb3Auth } from './components/Web3AuthProvider'

export function TokenizeAsset() {
  const { algorandAccount } = useWeb3Auth()

  if (!algorandAccount) {
    return <Web3AuthButton />
  }

  // Create signer from Web3Auth account
  const signer = createWeb3AuthSigner(algorandAccount)

  const algodConfig = getAlgodConfigFromViteEnvironment()
  const algorand = AlgorandClient.fromConfig({ algodConfig })

  const handleCreateAsset = async () => {
    try {
      const result = await algorand.send.assetCreate({
        sender: algorandAccount.address,
        signer: signer,
        total: BigInt(1000000),
        decimals: 6,
        assetName: 'My Token',
        unitName: 'MYT',
      })

      console.log('Asset created:', result.confirmation?.assetIndex)
    } catch (error) {
      console.error('Failed to create asset:', error)
    }
  }

  return <button onClick={handleCreateAsset}>Create Asset</button>
}
```

### Add Web3AuthButton to Your UI

```typescript
import Web3AuthButton from './components/Web3AuthButton'

export function Header() {
  return (
    <header>
      <h1>My Tokenization App</h1>
      <Web3AuthButton /> {/* Shows login/account dropdown */}
    </header>
  )
}
```

### Access User Information

```typescript
import { useWeb3Auth } from './components/Web3AuthProvider'

export function Profile() {
  const { userInfo, algorandAccount } = useWeb3Auth()

  if (!userInfo) return <p>Not logged in</p>

  return (
    <div>
      {userInfo.profileImage && <img src={userInfo.profileImage} alt="Profile" />}
      <p>Name: {userInfo.name}</p>
      <p>Email: {userInfo.email}</p>
      <p>Algorand Address: {algorandAccount?.address}</p>
    </div>
  )
}
```

## Key Features

### ✅ Multi-Wallet Support

Web3Auth works **alongside** existing `@txnlab/use-wallet-react`:

- Users can use traditional wallets (Pera, Defly, etc.)
- **OR** sign in with Google/social logins
- Both options available simultaneously

### ✅ Automatic Wallet Generation

When users sign in with Google:

1. Web3Auth generates a secure private key
2. Private key is converted to Algorand mnemonic
3. Algorand account is derived automatically
4. No seed phrases to manage - ties to Google account

### ✅ TestNet Ready

By default, Web3Auth is configured for:

- **Development**: Sapphire DevNet
- **Algorand Network**: TestNet (https://testnet-api.algonode.cloud)
- Switch to SAPPHIRE network for production

### ✅ Full TypeScript Support

All files include complete TypeScript types:

- `AlgorandAccountFromWeb3Auth` interface
- `Web3AuthContextType` for context
- Proper error handling and null checks

### ✅ Integration with AlgorandClient

Drop-in replacement for transaction signing:

```typescript
const signer = createWeb3AuthSigner(algorandAccount)

// Works with existing AlgorandClient code
await algorand.send.assetCreate({
  sender: algorandAccount.address,
  signer: signer,
  // ... other params
})
```

## Configuration

### Change Network (Development → Production)

In `src/utils/web3auth/web3authConfig.ts`:

```typescript
// For development:
web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET

// For production:
web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE
```

Also change in `OpenloginAdapter`:

```typescript
network: 'sapphire_devnet' // → 'sapphire'
```

### Add More OAuth Providers

In `src/utils/web3auth/web3authConfig.ts`, add to `loginConfig`:

```typescript
loginConfig: {
  google: { ... },
  github: {
    name: 'GitHub Login',
    verifier: 'web3auth-github-demo',
    typeOfLogin: 'github',
    clientId: clientId,
  },
  // Add more providers...
}
```

### Customize UI

In `src/utils/web3auth/web3authConfig.ts`, modify `uiConfig`:

```typescript
uiConfig: {
  appName: 'Your App Name',
  appLogo: 'https://your-logo-url.png',
  primaryButtonColour: '#FF6B35',
  dark: false,
  theme: 'light',
}
```

### Customize Button Styling

In `src/components/Web3AuthButton.tsx`, modify Tailwind classes:

```tsx
// Change button colors, sizes, styles as needed
<button className="btn btn-sm btn-primary gap-2">{/* Your customizations */}</button>
```

## Error Handling

All functions include error handling:

```typescript
const { error } = useWeb3Auth()

if (error) {
  return <div className="alert alert-error">{error}</div>
}
```

Common errors:

- `VITE_WEB3AUTH_CLIENT_ID is not configured` - Add Client ID to .env
- `Failed to derive Algorand account` - Web3Auth provider issue
- `Failed to connect Web3Auth provider` - Network or service issue

## Testing

### Test Web3Auth Login Locally

1. Install dependencies: `npm install`
2. Add `VITE_WEB3AUTH_CLIENT_ID` to `.env`
3. Run dev server: `npm run dev`
4. Click "Sign in with Google" button
5. Complete Google OAuth flow
6. See Algorand address in dropdown

### Test with TestNet

1. Ensure `.env` has TestNet configuration
2. Get TestNet tokens from [Algorand Testnet Dispenser](https://dispenser.algorand-testnet.com)
3. Use Algorand address from Web3Auth
4. Create assets or transactions

## Next Steps

1. **Install dependencies**: Run `npm install` command above
2. **Get Web3Auth Client ID**: Register at https://dashboard.web3auth.io
3. **Add to .env**: Set `VITE_WEB3AUTH_CLIENT_ID` in your `.env` file
4. **Add to UI**: Import and use `Web3AuthButton` in your header/navbar
5. **Use in components**: Import `useWeb3Auth()` to access account and signing capabilities
6. **Test**: Run `npm run dev` and test the login flow

## Troubleshooting

### Web3Auth Modal Not Appearing

- Check that `VITE_WEB3AUTH_CLIENT_ID` is set in `.env`
- Ensure Web3AuthProvider wraps your components
- Check browser console for initialization errors

### Algorand Account Derivation Fails

- Verify provider is properly connected
- Check that private key extraction works in your environment
- Try logout and login again

### Transactions Won't Sign

- Ensure `algorandAccount` is not null
- Verify signer is created from correct account
- Check transaction format is compatible with algosdk

### Network Issues

- For LocalNet: Update RPC target in web3authConfig.ts
- For TestNet: Verify Algonode endpoints are accessible
- Check firewall/CORS settings if making cross-origin requests

## Additional Resources

- [Web3Auth Documentation](https://web3auth.io/docs)
- [Web3Auth Dashboard](https://dashboard.web3auth.io)
- [Algorand Developer Docs](https://developer.algorand.org)
- [AlgoKit Utils](https://github.com/algorandfoundation/algokit-utils-ts)
- [algosdk.js](https://github.com/algorand/js-algorand-sdk)

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review [Web3Auth GitHub Issues](https://github.com/Web3Auth/web3auth-web/issues)
3. Consult [Algorand Community Forums](https://forum.algorand.org)
4. Check browser console for detailed error messages
