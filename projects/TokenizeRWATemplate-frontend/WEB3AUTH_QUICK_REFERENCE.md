# Web3Auth Quick Reference

## Installation & Setup

### 1. Install Dependencies

```bash
npm install @web3auth/modal @web3auth/base @web3auth/openlogin-adapter
```

### 2. Get Client ID

1. Go to https://dashboard.web3auth.io
2. Create a new application
3. Copy your **Client ID**

### 3. Add to .env

```dotenv
VITE_WEB3AUTH_CLIENT_ID=your_client_id_here
```

## Files Created

| File                                        | Purpose                       |
| ------------------------------------------- | ----------------------------- |
| `src/utils/web3auth/web3authConfig.ts`      | Web3Auth initialization       |
| `src/utils/web3auth/algorandAdapter.ts`     | Key conversion utilities      |
| `src/utils/web3auth/web3authIntegration.ts` | AlgorandClient integration    |
| `src/components/Web3AuthProvider.tsx`       | React Context Provider        |
| `src/components/Web3AuthButton.tsx`         | Login/Logout UI button        |
| `src/hooks/useWeb3AuthHooks.ts`             | Custom hooks for common tasks |
| `src/components/Web3AuthExamples.tsx`       | Implementation examples       |

## Most Common Usage Patterns

### Pattern 1: Basic Login Button

```tsx
import Web3AuthButton from './components/Web3AuthButton'

export function Header() {
  return (
    <header>
      <h1>My App</h1>
      <Web3AuthButton />
    </header>
  )
}
```

### Pattern 2: Check if User is Logged In

```tsx
import { useWeb3Auth } from './components/Web3AuthProvider'

export function MyComponent() {
  const { isConnected, algorandAccount } = useWeb3Auth()

  if (!isConnected) {
    return <p>Please sign in</p>
  }

  return <p>Address: {algorandAccount?.address}</p>
}
```

### Pattern 3: Create Asset with Web3Auth

```tsx
import { useWeb3Auth } from './components/Web3AuthProvider'
import { createWeb3AuthSigner } from './utils/web3auth/web3authIntegration'
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { getAlgodConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs'

export function CreateAsset() {
  const { algorandAccount } = useWeb3Auth()

  const handleCreate = async () => {
    const algodConfig = getAlgodConfigFromViteEnvironment()
    const algorand = AlgorandClient.fromConfig({ algodConfig })

    const signer = createWeb3AuthSigner(algorandAccount)

    const result = await algorand.send.assetCreate({
      sender: algorandAccount.address,
      signer: signer,
      total: BigInt(1000000),
      decimals: 6,
      assetName: 'My Token',
      unitName: 'MYT',
    })

    console.log('Asset ID:', result.confirmation?.assetIndex)
  }

  return <button onClick={handleCreate}>Create Asset</button>
}
```

### Pattern 4: Using Custom Hooks

```tsx
import { useAccountBalance, useCreateAsset } from './hooks/useWeb3AuthHooks'

export function Dashboard() {
  const { balance, loading: balanceLoading } = useAccountBalance()
  const { createAsset, loading: createLoading } = useCreateAsset()

  return (
    <div>
      <p>Balance: {balance} ALGO</p>
      <button
        onClick={() =>
          createAsset({
            total: 1000000n,
            decimals: 6,
            assetName: 'Token',
            unitName: 'TKN',
          })
        }
        disabled={createLoading}
      >
        Create Asset
      </button>
    </div>
  )
}
```

## useWeb3Auth() Hook

Main context hook - use this everywhere!

```typescript
const {
  // Connection state
  isConnected: boolean,
  isLoading: boolean,
  isInitialized: boolean,
  error: string | null,

  // Data
  provider: IProvider | null,
  web3AuthInstance: Web3Auth | null,
  algorandAccount: AlgorandAccountFromWeb3Auth | null,
  userInfo: Web3AuthUserInfo | null,

  // Functions
  login: () => Promise<void>,
  logout: () => Promise<void>,
  refreshUserInfo: () => Promise<void>,
} = useWeb3Auth()
```

## Custom Hooks Reference

### useAlgorandClient()

Get initialized AlgorandClient for Web3Auth account

```typescript
const algorand = useAlgorandClient()
// Use with algorand.send.assetCreate(...), etc.
```

### useAlgod()

Get algosdk Algodv2 client

```typescript
const algod = useAlgod()
const accountInfo = await algod.accountInformation(address).do()
```

### useAccountBalance()

Get account balance in Algos

```typescript
const { balance, loading, error, refetch } = useAccountBalance()
// balance is a string like "123.456789"
```

### useHasSufficientBalance(amount, fee)

Check if account has enough funds

```typescript
const { hasSufficientBalance } = useHasSufficientBalance('10') // 10 ALGO
if (!hasSufficientBalance) {
  /* show error */
}
```

### useSendTransaction()

Sign and submit transactions

```typescript
const { sendTransaction, loading } = useSendTransaction()
const txnId = await sendTransaction([signedTxn])
```

### useWaitForConfirmation(txnId)

Wait for transaction confirmation

```typescript
const { confirmed, confirmation } = useWaitForConfirmation(txnId)
if (confirmed) console.log('Round:', confirmation['confirmed-round'])
```

### useCreateAsset()

Create a new ASA

```typescript
const { createAsset, loading } = useCreateAsset()
const assetId = await createAsset({
  total: 1000000n,
  decimals: 6,
  assetName: 'My Token',
  unitName: 'MYT',
})
```

### useSendAsset()

Transfer ASA or Algo

```typescript
const { sendAsset, loading } = useSendAsset()
const txnId = await sendAsset({
  to: recipientAddress,
  assetId: 12345,
  amount: 100n,
})
```

## Integration Utilities Reference

### createWeb3AuthSigner(account)

Create signer for AlgorandClient

```typescript
const signer = createWeb3AuthSigner(algorandAccount)
// Use with: algorand.send.assetCreate({ ..., signer })
```

### getWeb3AuthAccountInfo(account)

Get account info in various formats

```typescript
const { address, publicKeyBytes, publicKeyBase64, secretKeyHex, mnemonicPhrase } = getWeb3AuthAccountInfo(account)
```

### formatAmount(amount, decimals)

Format amount for display

```typescript
formatAmount(BigInt(1000000), 6) // Returns "1.000000"
```

### parseAmount(amount, decimals)

Parse user input to base units

```typescript
parseAmount('1.5', 6) // Returns 1500000n
```

### verifyWeb3AuthSignature(signedTxn, account)

Verify transaction was signed by account

```typescript
const isValid = verifyWeb3AuthSignature(signedTxn, account)
```

### hasSufficientBalance(balance, required, fee)

Check balance programmatically

```typescript
if (hasSufficientBalance(balanceBigInt, requiredBigInt)) {
  // Proceed
}
```

## Common Issues & Solutions

| Issue                        | Solution                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| Web3Auth modal not appearing | Check `VITE_WEB3AUTH_CLIENT_ID` is set in `.env`               |
| Account derivation fails     | Verify provider is connected and try logout/login again        |
| Transactions won't sign      | Ensure `algorandAccount` is not null before creating signer    |
| Network errors               | Verify Algonode endpoints are accessible (may be rate-limited) |
| TypeScript errors            | Check you're using the correct types from imports              |

## Network Configuration

### Switch to Different Network

In `src/utils/web3auth/web3authConfig.ts`:

**For TestNet (development):**

```typescript
web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET // ← Already set
```

**For MainNet (production):**

```typescript
web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE
```

Also update in OpenloginAdapter:

```typescript
network: 'sapphire' // from 'sapphire_devnet'
```

## Environment Variables

```dotenv
# Required
VITE_WEB3AUTH_CLIENT_ID=<your-client-id>

# Optional (Web3Auth uses defaults)
# VITE_WEB3AUTH_NETWORK=sapphire_devnet
# VITE_WEB3AUTH_ENV=development
```

## Troubleshooting Checklist

- [ ] Dependencies installed: `npm install @web3auth/modal @web3auth/base @web3auth/openlogin-adapter`
- [ ] Client ID added to `.env`
- [ ] Web3AuthProvider wraps your app in App.tsx
- [ ] Browser console shows no errors
- [ ] Test with `Web3AuthButton` component first
- [ ] Check network configuration matches your desired network
- [ ] Try logout and login again for persistent issues

## Next Steps After Setup

1. **Add to UI**: Import `Web3AuthButton` in your header/navbar
2. **Test Login**: Click button and complete Google OAuth flow
3. **Verify Address**: See Algorand address in dropdown menu
4. **Try Transactions**: Use `useCreateAsset()` hook to create ASA
5. **Get TestNet Funds**: Visit [Algorand TestNet Dispenser](https://dispenser.algorand-testnet.com)
6. **Go Live**: Switch Web3Auth to SAPPHIRE network for production

## Resources

- Web3Auth Docs: https://web3auth.io/docs
- Web3Auth Dashboard: https://dashboard.web3auth.io
- AlgoKit Utils: https://github.com/algorandfoundation/algokit-utils-ts
- algosdk.js: https://github.com/algorand/js-algorand-sdk
