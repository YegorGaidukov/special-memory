# Publishing Apps via GitHub Pages + ki-pc Server

Guide for InfAU chair members who want to deploy a web app with a frontend on GitHub Pages and a backend on the chair's GPU server (`ki-pc.architektur.uni-weimar.de`).

## Architecture Overview

```
GitHub Pages (frontend)  ──HTTPS──>  ki-pc server (backend)
  Static HTML/JS/CSS                   Caddy reverse proxy (:443)
  yourorg.github.io/app                  ↓
                                       Docker containers (:8000, etc.)
                                         ↓
                                       Ollama / Qdrant / your services
```

* **Frontend** : Hosted free on GitHub Pages, served over HTTPS automatically
* **Backend** : Runs in Docker on `ki-pc`, exposed via Caddy with auto-TLS at `https://ki-pc.architektur.uni-weimar.de`
* **Caddy** : Reverse proxy that handles HTTPS certificates from Let's Encrypt automatically

## Server Details

| Property     | Value                                |
| ------------ | ------------------------------------ |
| Hostname     | `ki-pc.architektur.uni-weimar.de`  |
| IP           | `141.54.181.55`                    |
| Ethernet MAC | `A0:AD:9F:7E:B7:1D`(Intel I226-LM) |
| OS           | Windows 11 Pro for Workstations      |
| GPU          | 96 GB VRAM                           |
| Connection   | Ethernet (LAN),**not WiFi**    |

> **Important** : The server must be connected via  **Ethernet cable** , not Eduroam WiFi. Eduroam does not allow inbound connections, so Let's Encrypt certificate issuance and all external access will fail over WiFi.

## Prerequisites

* Docker Desktop installed on ki-pc
* Ethernet cable connected (wall socket SV055D2R, switch s-ba1-3, port 1/11)
* Static IP `141.54.181.55` configured on the Ethernet adapter
* Ports 80 and 443 open on the university firewall (contact SCC/network admin)

## Step 1: Backend — Add Your Service to Docker Compose

All services are defined in `config/docker-compose.yml`. Add your backend service:

```yaml
services:
  # ... existing services ...

  my-app-backend:
    build:
      context: ../my-app-backend
      dockerfile: Dockerfile
    container_name: my-app-backend
    expose:
      - "8001"  # pick an unused port
    restart: unless-stopped
```

Key points:

* Use `expose` (not `ports`) — Caddy handles external access
* Only add `ports` if you need direct access for local development

## Step 2: Caddy — Route Traffic to Your Service

Edit `config/Caddyfile` to add a route for your app. Two options:

### Option A: Path-based routing (share the domain)

```
ki-pc.architektur.uni-weimar.de {
    # Existing backend
    reverse_proxy /chat* backend:8000
    reverse_proxy /search* backend:8000
    reverse_proxy /session* backend:8000
    reverse_proxy /health backend:8000

    # Your new app
    reverse_proxy /my-app/* my-app-backend:8001
}
```

### Option B: Catch-all (if only one backend exists)

```
ki-pc.architektur.uni-weimar.de {
    reverse_proxy backend:8000
}
```

After editing, reload Caddy:

```bash
cd config
docker-compose restart caddy
```

Caddy handles TLS certificates automatically — no manual cert management needed.

## Step 3: Backend — Enable CORS

Your backend must allow requests from your GitHub Pages origin. Example with FastAPI:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "<https://bauhaus-infau.github.io>",  # GitHub Pages
        "<http://localhost:5173>",              # local dev
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)
```

## Step 4: Frontend — Point API Calls to the Server

In your frontend code, set the API base URL depending on the environment:

```tsx
function getApiBaseUrl(): string {
  // Production: frontend on GitHub Pages → backend on ki-pc
  if (window.location.hostname.includes("github.io")) {
    return "<https://ki-pc.architektur.uni-weimar.de>";
  }
  // Local development
  if (window.location.port === "5173") {
    return "<http://localhost:8000>";
  }
  return "";
}
```

## Step 5: Frontend — Deploy to GitHub Pages

1. Create a GitHub repo under the `Bauhaus-InfAU` org (or your own account)
2. Add a GitHub Actions workflow at `.github/workflows/pages.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install and build
        working-directory: frontend
        run: |
          npm ci
          npm run build

      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: frontend/dist

      - id: deployment
        uses: actions/deploy-pages@v4
```

1. In repo Settings > Pages, set source to "GitHub Actions"
2. Push to `main` — the site deploys automatically to `https://bauhaus-infau.github.io/your-repo/`

## Step 6: Start Everything

```bash
cd config
docker-compose up -d

# Verify
docker-compose ps          # all containers should be "Up"
docker-compose logs caddy   # should show "certificate obtained successfully"
curl <http://localhost:8000/health>  # backend health check
```

## Managing Services

```bash
# View logs
cd config && docker-compose logs -f caddy
cd config && docker-compose logs -f backend

# Restart a single service
docker-compose restart backend

# Rebuild after code changes
docker-compose up -d --build backend

# Stop everything
docker-compose down

# Stop and remove volumes (deletes data!)
docker-compose down -v
```

## Troubleshooting

### CORS errors in browser console

* Check that your GitHub Pages URL is in the backend's `CORS_ORIGINS`
* Restart the backend: `docker-compose restart backend`

### "Mixed content" error

* Your frontend on HTTPS is calling an HTTP backend URL
* Make sure the frontend uses `https://ki-pc.architektur.uni-weimar.de` (not `http://`)

### TLS certificate not issuing

1. Verify the server is on  **Ethernet** , not WiFi
2. Check Caddy logs: `docker-compose logs caddy`
3. Ports 80 and 443 must be open on the university firewall for all external IPs
4. Restart Caddy: `docker-compose restart caddy`

### "Website can't be reached" from outside

* Server is likely on Eduroam WiFi instead of Ethernet
* Or the university firewall hasn't opened ports 80/443

### Backend not reachable through Caddy

* Check that your service is in the same Docker network (docker-compose handles this automatically)
* Verify the service name in the Caddyfile matches the service name in docker-compose.yml
* Check backend logs: `docker-compose logs backend`

## Network Admin Contacts

When requesting firewall changes, provide:

* **Server** : [ki-pc.architektur.uni-weimar.de](http://ki-pc.architektur.uni-weimar.de/)
* **IP** : 141.54.181.55
* **MAC** : A0:AD:9F:7E:B7:1D
* **Required ports** : TCP 80, 443 (inbound, all external IPs)
