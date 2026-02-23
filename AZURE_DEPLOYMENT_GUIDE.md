# Copilot Ambassador Tracker — Azure Deployment Guide

## Architecture Overview

```
Browser (React SPA)
        │
        ▼
Azure Static Web Apps      ← hosts your React frontend
        │
        ▼
Azure Functions (API)      ← serverless backend (Node.js)
        │
        ▼
Azure Cosmos DB            ← database (NoSQL)
        │
        ▼
Azure Blob Storage         ← screenshot file uploads
```

---

## What You Need (Prerequisites)

- Node.js 18+ installed on your computer
- Azure account (free tier works to start)
- Azure CLI installed: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli
- VS Code + Azure Static Web Apps extension (recommended)

---

## PART 1 — Set Up Azure Resources

### Step 1: Login to Azure

```bash
az login
```

### Step 2: Create a Resource Group

```bash
az group create \
  --name copilot-ambassador-rg \
  --location southeastasia
```

> Use `southeastasia` if your campuses are in Singapore/Asia. Otherwise use `eastus` or `westeurope`.

### Step 3: Create Cosmos DB Account

```bash
az cosmosdb create \
  --name copilot-ambassador-db \
  --resource-group copilot-ambassador-rg \
  --kind GlobalDocumentDB \
  --capabilities EnableServerless
```

> EnableServerless = pay per request, ideal for this use case (no idle cost).

### Step 4: Create Cosmos DB Database and Containers

```bash
# Create the database
az cosmosdb sql database create \
  --account-name copilot-ambassador-db \
  --resource-group copilot-ambassador-rg \
  --name AmbassadorDB

# Create containers (one per collection)
az cosmosdb sql container create \
  --account-name copilot-ambassador-db \
  --resource-group copilot-ambassador-rg \
  --database-name AmbassadorDB \
  --name ambassadors \
  --partition-key-path /id

az cosmosdb sql container create \
  --account-name copilot-ambassador-db \
  --resource-group copilot-ambassador-rg \
  --database-name AmbassadorDB \
  --name events \
  --partition-key-path /id

az cosmosdb sql container create \
  --account-name copilot-ambassador-db \
  --resource-group copilot-ambassador-rg \
  --database-name AmbassadorDB \
  --name submissions \
  --partition-key-path /id

az cosmosdb sql container create \
  --account-name copilot-ambassador-db \
  --resource-group copilot-ambassador-rg \
  --database-name AmbassadorDB \
  --name admins \
  --partition-key-path /id
```

### Step 5: Get Your Cosmos DB Connection String

```bash
az cosmosdb keys list \
  --name copilot-ambassador-db \
  --resource-group copilot-ambassador-rg \
  --type connection-strings
```

Copy the **Primary SQL Connection String** — you'll need it shortly.

### Step 6: Create Azure Blob Storage (for screenshot uploads)

```bash
az storage account create \
  --name copilotambassadorstorage \
  --resource-group copilot-ambassador-rg \
  --sku Standard_LRS \
  --allow-blob-public-access true

az storage container create \
  --name screenshots \
  --account-name copilotambassadorstorage \
  --public-access blob
```

Get the storage connection string:
```bash
az storage account show-connection-string \
  --name copilotambassadorstorage \
  --resource-group copilot-ambassador-rg
```

---

## PART 2 — Project Structure

Set up your project folder like this:

```
copilot-ambassador/
├── frontend/               ← React app (your existing JSX, converted)
│   ├── src/
│   │   ├── App.jsx         ← modified version of the Claude artifact
│   │   ├── api.js          ← NEW: API client replacing window.storage
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── api/                    ← Azure Functions backend
│   ├── ambassadors/
│   │   └── index.js
│   ├── events/
│   │   └── index.js
│   ├── submissions/
│   │   └── index.js
│   ├── auth/
│   │   └── index.js
│   ├── upload/
│   │   └── index.js
│   ├── package.json
│   └── local.settings.json ← secrets (never commit this)
│
└── staticwebapp.config.json
```

---

## PART 3 — Backend: Azure Functions

### Step 7: Initialize the API folder

```bash
mkdir copilot-ambassador && cd copilot-ambassador
mkdir api && cd api
npm init -y
npm install @azure/cosmos @azure/storage-blob bcryptjs jsonwebtoken
```

### Step 8: Create `api/local.settings.json` (DO NOT commit to git)

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "COSMOS_CONNECTION_STRING": "YOUR_COSMOS_CONNECTION_STRING_HERE",
    "BLOB_CONNECTION_STRING": "YOUR_BLOB_CONNECTION_STRING_HERE",
    "JWT_SECRET": "your-random-secret-string-min-32-chars"
  }
}
```

### Step 9: Create `api/shared/cosmos.js` (shared DB client)

See file: `api/shared/cosmos.js` (provided separately)

### Step 10: Create each Function

See the provided files:
- `api/auth/index.js` — login endpoint
- `api/ambassadors/index.js` — GET/POST ambassadors
- `api/events/index.js` — GET/POST events
- `api/submissions/index.js` — GET/POST submissions
- `api/upload/index.js` — screenshot upload to Blob Storage

---

## PART 4 — Frontend Changes

### Step 11: Initialize the frontend

```bash
cd ../frontend
npm create vite@latest . -- --template react
npm install
```

Copy your `App.jsx` (the modified version provided) into `src/`.

The key change: replace all `window.storage` calls with `fetch()` calls to your Azure Functions API. The file `src/api.js` handles this cleanly.

---

## PART 5 — Deploy

### Step 12: Create Azure Static Web App

```bash
cd ..  # back to project root
az staticwebapp create \
  --name copilot-ambassador-app \
  --resource-group copilot-ambassador-rg \
  --location eastasia \
  --sku Free
```

### Step 13: Set environment variables in Azure

```bash
az staticwebapp appsettings set \
  --name copilot-ambassador-app \
  --setting-names \
    COSMOS_CONNECTION_STRING="YOUR_COSMOS_STRING" \
    BLOB_CONNECTION_STRING="YOUR_BLOB_STRING" \
    JWT_SECRET="your-jwt-secret"
```

### Step 14: Deploy via GitHub (recommended)

1. Push your project to a GitHub repo
2. In Azure Portal → your Static Web App → Deployment Center
3. Connect to your GitHub repo
4. Azure auto-deploys on every `git push` to main ✅

Or deploy manually:
```bash
npm run build  # in /frontend
az staticwebapp deploy \
  --name copilot-ambassador-app \
  --resource-group copilot-ambassador-rg \
  --source ./frontend/dist \
  --api-location ./api
```

---

## PART 6 — Security Checklist Before Going Live

- [ ] Change all demo passwords (aisha / ben / admin) in Cosmos DB
- [ ] Add password hashing (bcrypt is included in the API code)
- [ ] Set CORS in `staticwebapp.config.json` to your domain only
- [ ] Add rate limiting to the `/api/submissions` endpoint
- [ ] Enable Cosmos DB firewall to only allow your Static Web App IP
- [ ] Rotate JWT_SECRET before launch
- [ ] Set screenshot file size limit in the upload function (10MB recommended)

---

## Estimated Azure Cost (monthly)

| Service | Tier | Est. Cost |
|---|---|---|
| Cosmos DB Serverless | ~50K RU/month | ~$0–2 |
| Static Web App | Free tier | $0 |
| Azure Functions | Consumption plan | $0 (first 1M calls free) |
| Blob Storage | LRS, <1GB | ~$0.02 |
| **Total** | | **~$0–5/month** |

---

## Quick Reference: API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Ambassador or admin login → returns JWT |
| GET | `/api/ambassadors` | List all ambassadors (admin only) |
| POST | `/api/ambassadors` | Create ambassador (admin only) |
| GET | `/api/events` | List events (filtered by ambassador JWT) |
| POST | `/api/events` | Create event |
| GET | `/api/submissions` | List submissions |
| POST | `/api/submissions` | Submit proof (public, by event ID) |
| POST | `/api/upload` | Upload screenshot to Blob Storage |
