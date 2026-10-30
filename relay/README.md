# GUPPI relay (optional)

You only need this for **GUPPI Mobile without your PC**. Controlling GUPPI on your PC from the phone (Settings → Phone & agent access) needs nothing here.

In standalone mode the phone talks to the game with your own API key. That needs two things a phone browser can't provide on its own:

1. **A home for the app on `https://`.** iPhone home-screen apps should come from a secure address.
2. **Permission to call the game from a web page.** Browsers block calls to another site unless that site allows them (CORS). If neumann-probe.net doesn't allow this, the phone needs a relay.

This folder solves both with one free Cloudflare Worker. It serves GUPPI Mobile and relays game calls from the same address, for example `https://guppi-relay.<you>.workers.dev`.

## What the relay does

- It forwards only `/api/...` requests, and only to `https://neumann-probe.net`.
- It holds no key. The phone sends your key with each request and the relay passes it along. The relay stores nothing and logs nothing. Cloudflare's own request logs stay off unless you turn on Workers Logs.
- It never follows redirects, and it passes back only the content type and rate-limit headers.
- `ALLOWED_ORIGINS` in `wrangler.toml` can restrict which other sites may use it. The relay's own site always works.

## Deploy with GitHub Actions (no tools on your PC)

1. Create a free account at [cloudflare.com](https://dash.cloudflare.com/sign-up). Open **Workers & Pages** once so Cloudflare sets up your `workers.dev` address.
2. In Cloudflare go to **My Profile → API Tokens → Create Token**. Choose the **Edit Cloudflare Workers** template and create the token.
3. In GitHub go to **this repository → Settings → Secrets and variables → Actions → New repository secret**. Name it `CLOUDFLARE_API_TOKEN` and paste the token. If your Cloudflare login has more than one account, also add `CLOUDFLARE_ACCOUNT_ID`, which is shown on the Workers overview page.
4. Go to **Actions → GUPPI Mobile web app → Run workflow**. After that it redeploys on every merge to `main`.
5. The run log prints the address, for example `https://guppi-relay.<you>.workers.dev`. Open it in Safari on the iPhone, choose **Direct**, enter your API key, then tap **Share → Add to Home Screen**.

## Deploy from a computer

You need Node.js 22+ and pnpm.

```bash
cd relay
npx wrangler login      # opens the browser once
npx wrangler deploy     # builds GUPPI Mobile into ./public, then deploys
```

## Relay only (paste into the dashboard)

If you host GUPPI Mobile somewhere else, such as GitHub Pages, you can run only the relay. In Cloudflare go to **Workers & Pages → Create → Create Worker**, then **Edit code**. Replace the code with the contents of [`worker.js`](worker.js) and click **Deploy**. In GUPPI Mobile choose **Direct → Use a relay** and enter the Worker's address.

## Check it

Opening `https://<your-worker>/relay-info` should show `{"guppiRelay":1}`.
