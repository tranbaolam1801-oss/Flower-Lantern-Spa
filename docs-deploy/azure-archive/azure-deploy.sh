#!/usr/bin/env bash
# Flower Lantern Spa — Azure free-tier deployment commands (az CLI).
#
# NOT EXECUTED by anyone automatically. This is a reference script for YOU to run yourself, command
# by command, after reviewing each one — not a one-shot "./azure-deploy.sh". Every resource it creates
# is a real, billable-capable Azure resource. Run `az login` first and confirm `az account show`
# points at the subscription you intend to use.
#
# Fill in the placeholders below, then run sections one at a time (copy/paste), checking the output
# of each before moving to the next.

set -euo pipefail

# ---- 0. Placeholders — edit these ----
RESOURCE_GROUP="rg-spa-demo"
LOCATION="southeastasia"              # Confirm Azure SQL free tier is actually offered here first (see docs-deploy/AZURE_FREE_TIER_DEPLOYMENT.md §1). Fallback: eastus.
SQL_SERVER_NAME="spa-demo-sql-$RANDOM"  # Must be globally unique.
SQL_DB_NAME="FlowerLanternSpaDemo"
SQL_ADMIN_USER="spa_admin"
SQL_ADMIN_PASSWORD='CHANGE_ME_STRONG_PASSWORD'   # Do not commit a real value here; export it as an env var instead and reference $SQL_ADMIN_PASSWORD.
APP_SERVICE_PLAN="plan-spa-demo"
APP_NAME="spa-demo-backend-$RANDOM"             # Must be globally unique; becomes <APP_NAME>.azurewebsites.net
ACR_NAME="spademoacr$RANDOM"                    # Alphanumeric only, globally unique. See note in step 5 about cost.
SWA_NAME="spa-demo-frontend"

# ---- 1. Resource group ----
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

# ---- 2. Azure SQL Database, free tier ----
# "az sql db create" does not yet have a dedicated --use-free-limit flag in all CLI versions; the
# Free tier offer is most reliably selected in the Portal (Create SQL Database -> Compute + storage ->
# "Configure database" -> enable "Apply free tier offer") rather than CLI. Create the logical server
# via CLI, then create the database itself in the Portal so you can see and tick the free-tier box.
az sql server create \
  --name "$SQL_SERVER_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --admin-user "$SQL_ADMIN_USER" \
  --admin-password "$SQL_ADMIN_PASSWORD"

# Allow Azure services (App Service) to reach this server. Still requires a SQL login — this rule
# alone does not grant data access, only network access from Azure's own IP ranges.
az sql server firewall-rule create \
  --resource-group "$RESOURCE_GROUP" --server "$SQL_SERVER_NAME" \
  --name AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0

echo ">>> Now go to the Portal: SQL server '$SQL_SERVER_NAME' -> Create database -> name '$SQL_DB_NAME' -> Compute+storage -> enable the Free tier checkbox -> Apply. CLI database creation does not reliably expose the free-tier toggle."

# ---- 3. Database schema (after you approve each migration individually — see
#      database/AZURE_MIGRATION_APPROVAL_CHECKLIST.md). Example for migration 001 only:
# sqlcmd -S "$SQL_SERVER_NAME.database.windows.net" -d "$SQL_DB_NAME" -U "$SQL_ADMIN_USER" -P "$SQL_ADMIN_PASSWORD" -N -C \
#   -i database/migrations/001-srs-baseline.sql

# ---- 4. A dedicated, least-privilege SQL login for the app (never use the server admin login at runtime) ----
# Run interactively via sqlcmd against $SQL_DB_NAME, after step 3. Example (adjust password placeholder):
# CREATE LOGIN spa_app WITH PASSWORD = 'CHANGE_ME';
# CREATE USER spa_app FOR LOGIN spa_app;
# ALTER ROLE db_datareader ADD MEMBER spa_app;
# ALTER ROLE db_datawriter ADD MEMBER spa_app;
# -- EXECUTE permission is needed too, since some backend code may call stored behavior; grant narrowly if any procs are added later.

# ---- 5. Container registry (OPTIONAL — Basic tier has a small daily cost, ~0.167 USD/day as of
#      general ACR Basic pricing; NOT part of the "0 cost" plan). Prefer Docker Hub's free public tier
#      instead if you want to stay at zero: push there and skip this whole step, pointing App Service
#      at the Docker Hub image in step 7 instead of ACR.
az acr create --resource-group "$RESOURCE_GROUP" --name "$ACR_NAME" --sku Basic --admin-enabled true

# Build and push (requires Docker, or use "az acr build" which builds in the cloud without any local Docker):
az acr build --registry "$ACR_NAME" --image spa-backend:latest --file backend/Dockerfile .

# ---- 6. App Service plan (F1, Linux) + Web App for Containers ----
az appservice plan create \
  --name "$APP_SERVICE_PLAN" --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" --is-linux --sku F1

az webapp create \
  --resource-group "$RESOURCE_GROUP" --plan "$APP_SERVICE_PLAN" --name "$APP_NAME" \
  --deployment-container-image-name "$ACR_NAME.azurecr.io/spa-backend:latest"

az webapp config container set \
  --resource-group "$RESOURCE_GROUP" --name "$APP_NAME" \
  --docker-registry-server-url "https://$ACR_NAME.azurecr.io"
# (az CLI will prompt for/attach ACR admin credentials automatically if --admin-enabled true was used above.)

# ---- 7. Application settings — copy every value from docs-deploy/azure.env.example, filled in ----
az webapp config appsettings set --resource-group "$RESOURCE_GROUP" --name "$APP_NAME" --settings \
  NODE_ENV=production HOST=0.0.0.0 \
  FRONTEND_ORIGIN="https://$SWA_NAME.azurestaticapps.net" \
  COOKIE_SECURE=true COOKIE_SAMESITE=none TRUST_PROXY=1 \
  DB_HOST="$SQL_SERVER_NAME.database.windows.net" DB_PORT=1433 DB_NAME="$SQL_DB_NAME" \
  DB_USER=spa_app DB_PASSWORD='CHANGE_ME' \
  DB_CONNECT_TIMEOUT_MS=30000 DB_REQUEST_TIMEOUT_MS=30000 DB_CONNECT_RETRIES=3 DB_CONNECT_RETRY_DELAY_MS=5000 \
  JWT_SECRET='CHANGE_ME_32_BYTES_OR_MORE' AUTH_SESSION_STORE=sql \
  UPLOAD_DIR=/home/uploads \
  SEPAY_WEBHOOK_AUTH=apikey PAYMENT_MOCK_ENABLED=false PAYMENT_EXPIRY_MINUTES=15 SEPAY_PAYMENT_PREFIX=FLS

# ---- 8. Static Web Apps (Free) — frontend ----
az staticwebapp create \
  --name "$SWA_NAME" --resource-group "$RESOURCE_GROUP" --location "$LOCATION" \
  --sku Free
echo ">>> Link this Static Web App to your GitHub repo in the Portal (or via --source/--branch flags) so its build pipeline runs, with VITE_API_BASE_URL=https://$APP_NAME.azurewebsites.net set as a build environment variable in the generated GitHub Actions workflow."

# ---- 9. Budget alert (cost safety net, see §7/8 of AZURE_FREE_TIER_DEPLOYMENT.md) ----
# Portal: Cost Management + Billing -> Budgets -> Add -> scope this resource group -> amount small
# (e.g. $1) -> alert at 1% so any unexpected charge emails you immediately. No reliable CLI one-liner
# for budget creation across all subscription types; do this step in the Portal.

# ---- 10. Health check ----
curl -i "https://$APP_NAME.azurewebsites.net/api/health/live"
