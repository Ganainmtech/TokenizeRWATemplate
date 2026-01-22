# 🧱 RWA Tokenization Template (Algorand)

A beginner-friendly, end-to-end template for tokenizing real-world assets (RWAs) on Algorand testnet using Algorand Standard Assets (ASAs).

**This repository is designed for:**
- Founders exploring RWA proofs-of-concept
- Builders new to Algorand
- Hackathons, demos, workshops, and early product experiments

No prior blockchain or smart contract experience required. By the end, you'll have a working tokenized asset with a real Algorand Asset ID.

---

## ✨ What This Template Gives You

- ✅ Full-stack Algorand project (frontend + backend server - no smart contract logic used)
- ✅ Simple ASA creation and transferring flow for assets
- ✅ Web2 & Web3-style logins
- ✅ TestNet-ready setup
- ✅ One-command setup using GitHub Codespaces
- ✅ Hosting capability with Vercel + Analytics enabled

---

## 🧠 What "RWA Tokenization" Means Here

This template focuses on the **on-chain token layer** of RWA tokenization:

- Each real-world asset is represented by an **Algorand Standard Asset (ASA)**
- Ownership, supply, and transfers are handled on-chain
- The real-world linkage (documents, custody, legal structure) lives off-chain

> ⚠️ This is a technical proof-of-concept template, not legal or financial advice.

---

## 🚀 Getting Started (5 Minutes)

### Option 1: GitHub Codespaces (Recommended)

This is the fastest and easiest way to run the project.

#### 1️⃣ Fork the repository

Click **Fork** (top-right of this page) to create your own copy.

https://github.com/user-attachments/assets/92e746e1-3143-4769-8a5a-1339e4bd7a14

#### 2️⃣ Open in Codespaces

1. Go to your forked repository
2. Click **Code → Codespaces → Create codespace**
3. Wait for the environment to load and enter the workspace

> When the Codespace loads, you may see an **"Open Workspace?"** popup in the bottom-right — click **Yes**.

Or manually enter it like below:

<img width="2794" height="1524" alt="Codespace workspace setup" src="https://github.com/user-attachments/assets/41f25490-1284-4998-b342-27f7a0ffb420" />

#### 3️⃣ Run the setup script

In the Codespaces terminal, run:

```bash
bash setup.sh
```

This script will:
- Install dependencies
- Automatically create required environment files
- Launch the frontend automatically

👉 When it finishes, a web app link will open automatically in Codespaces.

> ⚠️ You do not need to manually create `.env` files for the frontend.

---

## 🔐 Required Frontend Configuration (Web3Auth)

To enable email / social (Web2-style) login, you must configure Web3Auth.

### Steps

1. Go to the [Web3Auth Dashboard](https://dashboard.web3auth.io/)
2. Create a new project
3. Copy your **Client ID**

### Where to paste it

Open the file:

```
frontend/.env
```

Add (or update) the following value:

```env
VITE_WEB3AUTH_CLIENT_ID=YOUR_CLIENT_ID_HERE
```

Save the file and restart the frontend if it's already running.

> 🔑 **This is the only required manual environment step.**

---

## 🖼 Optional: NFT Minting (IPFS / Pinata)

NFT minting and metadata uploads are handled by a small backend server.

> ⚠️ **ONLY required if you want NFT / metadata minting**  
> If you're just creating and transferring ASAs, you can skip this section.

### Backend path

```
projects/TokenizeRWATemplate-contracts/NFT_mint_server
```

### Steps

1. Go to https://app.pinata.cloud/developers/api-keys
2. Create a new API key
3. Copy the **JWT token**

### Where to paste it

Open:

```
projects/TokenizeRWATemplate-contracts/NFT_mint_server/.env
```

Add:

```env
PINATA_JWT=YOUR_PINATA_JWT_HERE
```

Save the file.

---

## 🌐 Running the Frontend Again

After running `setup.sh` once, you have two options whenever you open your Codespace if you don't want to run the setup script again:

### Option A: Terminal

```bash
cd frontend
npm run dev
```

### Option B: GitHub UI

You can also start the frontend directly using the GitHub Codespaces UI, which is useful for demos and workshops.

## Pro Tip!
GitHub Codespaces is included with free accounts but comes with a monthly limit of 60 hours. 

To avoid losing your progress, be sure to **commit AND sync your changes regularly** — just like shown in the video demo below — so your updates are saved to your forked repository.

https://github.com/user-attachments/assets/dd452ea1-3070-4718-af34-bea978e208ab

---

## 🧠 Final Note (Important for Learners)

- ✅ Frontend setup is fully automated
- ✅ Web3Auth Client ID is **required**
- ✅ Pinata is **optional**

**If something isn't working, it's almost always because of:**
- A missing Web3Auth Client ID
- No TestNet ALGO or USDC

---

## 🪙 Tokenization Flow (High Level)

This template guides you through the core steps of tokenizing a real-world asset on Algorand using Algorand Standard Assets (ASAs).

### Basic Flow

1. **Connect with Algorand**  
   Use Pera, Defly, Lute, or Web3Auth to interact with the app.

2. **Define your asset parameters**  
   Choose the asset name, unit name, total supply, decimals, and optional metadata.

3. **Create an Algorand Standard Asset (ASA)**  
   The asset is created on-chain and represents your real-world asset digitally.

4. **Receive an Asset ID**  
   Algorand assigns a unique Asset ID, which becomes the on-chain identifier for your tokenized asset.

5. **Use or extend the token as your RWA representation**  
   The ASA can now be transferred, held, integrated into apps, or extended with additional logic.

### Advanced Asset Controls (Optional)

ASAs support advanced management features commonly used in RWA and compliance-focused setups:

| Role | Description |
|------|-------------|
| **Manager** | Can modify asset configuration |
| **Reserve** | Holds non-circulating supply |
| **Freeze** | Can freeze/unfreeze accounts |
| **Clawback** | Can revoke assets from accounts |

These controls are optional and depend on your use case and trust model.

---

## 🧪 Disclaimer

> This repository is provided for **educational and experimental purposes only**.  
> It does not constitute legal, financial, or investment advice.

---

## 📹 Video Guides

Below are videos on:
- How to connect to TestNet on [Pera](https://perawallet.app/)
- How to use the [Algo Dispenser](https://bank.testnet.algorand.network/)
- How to use the [USDC Dispenser](https://faucet.circle.com/)

### How to connect to TestNet on Pera Wallet

https://github.com/user-attachments/assets/31df8135-119e-4529-9539-4943de979719

### How to use the Algo Dispenser

https://github.com/user-attachments/assets/643cae10-4673-4b68-8e95-4a3f16fbba60

### How to use the USDC Dispenser

https://github.com/user-attachments/assets/a76e90fa-97f4-44f8-a7e8-a8ccabd24398
