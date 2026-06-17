# Setting Up GSTIN Auto-Verify (Sandbox.co.in)

Free tier: **1,000 GSTIN verifications/month** — no credit card needed.

---

## Step 1 — Create a Sandbox.co.in account

1. Go to **https://sandbox.co.in** → click **Get Started Free**
2. Sign up with your email and verify
3. After login, go to **Dashboard → API Keys**
4. Copy your **API Key** and **API Secret**

---

## Step 2 — Add keys to Vercel

1. Open **https://vercel.com** → your `nhance-app` project
2. Go to **Settings → Environment Variables**
3. Add these two variables (for all environments: Production, Preview, Development):

| Name | Value |
|------|-------|
| `SANDBOX_API_KEY` | *(your API key from Step 1)* |
| `SANDBOX_API_SECRET` | *(your API secret from Step 1)* |

4. Click **Save**
5. Go to **Deployments** → click **Redeploy** on the latest deployment (env vars require a redeploy to take effect)

---

## Step 3 — Test it

Open the app → Clients → Add New Client → enter your GSTIN → click Verify.

It should now auto-fill your business name, registered address, and status from the GST portal.

---

## Troubleshooting

- **Still showing "unavailable"**: Make sure you redeployed after adding the env vars (Vercel caches env vars at deploy time)
- **FO8000 "No records found"**: The GSTIN genuinely doesn't exist in the GST portal yet (newly registered GSTs can take a few days to appear)
- **Monthly limit**: 1,000 free calls/month is enough for ~33 new clients/day. Upgrade at sandbox.co.in if needed.
