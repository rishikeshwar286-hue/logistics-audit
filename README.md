# LogisticsAI Audit ⚡

AI-powered logistics invoice auditing for D2C brands. Cross-checks every AWB against contracted rates and flags overcharges automatically.

## Features
- 📋 Invoice upload & AI extraction (Delhivery, BlueDart, Ecom Express, Shadowfax)
- 🔍 7-point automated audit per line item
- 📊 Dashboard with overcharge breakdown by provider
- ◎ AWB shipment tracking
- 💬 AI chat assistant
- 🔊 Voice mode (AI reads responses aloud)
- ⬇ Export: Verified Payout CSV + Discrepancy Report

---

## Deploy to Vercel (3 steps)

### Step 1 — Get your Anthropic API Key
1. Go to https://console.anthropic.com
2. Click **API Keys** → **Create Key**
3. Copy the key (starts with `sk-ant-...`)

### Step 2 — Deploy to Vercel
1. Go to https://vercel.com/new
2. Click **"Upload"** and upload this ZIP file
3. Vercel will auto-detect it as a Vite project

### Step 3 — Add Environment Variable
In your Vercel project dashboard:
1. Go to **Settings** → **Environment Variables**
2. Add:
   - **Name:** `VITE_ANTHROPIC_API_KEY`
   - **Value:** `sk-ant-your-key-here`
3. Click **Save** → go to **Deployments** → **Redeploy**

Your app is live! 🚀

---

## Local Development

```bash
npm install
cp .env.example .env.local
# Edit .env.local and add your API key
npm run dev
```

Open http://localhost:3000
