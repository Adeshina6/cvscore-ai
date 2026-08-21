# CVScore AI — Netlify Deployment Guide

## How it works

```
Browser → POST /api/scan → Netlify Function → Anthropic API → JSON response → Browser renders results
```

Your API key lives only in Netlify's environment variables — never in the browser.

---

## Step 1 — Get your Anthropic API key

1. Go to https://console.anthropic.com
2. Click **API Keys** → **Create Key**
3. Copy the key (starts with `sk-ant-...`)
4. Keep it somewhere safe — you won't see it again

---

## Step 2 — Push to GitHub

```bash
# In this project folder
git init
git add .
git commit -m "Initial CVScore AI deploy"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/cvscore-ai.git
git push -u origin main
```

---

## Step 3 — Deploy on Netlify

1. Go to https://app.netlify.com
2. Click **Add new site** → **Import an existing project**
3. Connect GitHub → select your repo
4. Build settings are auto-detected from `netlify.toml`:
   - **Publish directory:** `.`
   - **Functions directory:** `netlify/functions`
5. Click **Deploy site**

---

## Step 4 — Add your API key (critical)

1. In Netlify dashboard → **Site configuration** → **Environment variables**
2. Click **Add a variable**
3. Set:
   - **Key:** `ANTHROPIC_API_KEY`
   - **Value:** `sk-ant-api03-...` (your key from Step 1)
4. Click **Save**
5. Go to **Deploys** → **Trigger deploy** → **Deploy site**

> The function won't work until this variable is set and the site is redeployed.

---

## Step 5 — Set your custom domain (optional)

1. Netlify dashboard → **Domain management** → **Add custom domain**
2. Enter `cvscore.ai` (or whatever you own)
3. Update your DNS records as shown
4. SSL certificate is provisioned automatically

---

## File structure

```
atscv/
├── index.html                  ← Main landing page
├── faq.html                    ← FAQ page
├── thank-you.html              ← Post-scan page
├── 404.html                    ← Custom error page
├── robots.txt                  ← Search engine rules
├── shared.css                  ← Design system (both themes)
├── shared.js                   ← Theme toggle + FAQ accordion
├── netlify.toml                ← Build config + redirects + headers
└── netlify/
    └── functions/
        └── scan.js             ← API proxy (scan + jdmatch modes)
```

---

## Testing locally

Install Netlify CLI:
```bash
npm install -g netlify-cli
```

Create a `.env` file in the project root:
```
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

Run locally:
```bash
netlify dev
```

Open http://localhost:8888 — the function runs at `/api/scan` exactly as it will in production.

---

## Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |

---

## Troubleshooting

**"API key not configured" error**
→ Add `ANTHROPIC_API_KEY` in Netlify environment variables and redeploy.

**Scan hangs or times out**
→ Netlify functions have a 10-second default timeout. Go to **Site configuration → Functions** and increase to 26 seconds (the max on free plan).

**CORS errors in browser console**
→ The function already sets `Access-Control-Allow-Origin: *`. If you still see CORS errors, check the function is deployed by visiting `https://yoursite.netlify.app/.netlify/functions/scan` — you should get a 405 Method Not Allowed (not a 404).

**PDF not parsing**
→ Make sure the file is a real PDF, not a renamed .doc. Re-export from Word or Google Docs as PDF and try again.
