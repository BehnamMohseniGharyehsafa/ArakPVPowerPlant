# Render deployment

The `render.yaml` Blueprint provisions one **Free** Docker web service in Frankfurt named `behnamproject-arakpvpowerplant`, from the protected `master` branch. The Docker image builds the React interface and bakes a verified reference simulation and original Arak weather cache. Uvicorn listens on Render's `PORT` at `0.0.0.0`; `/api/health` is the readiness endpoint. No external database or paid disk is required.

Create a Blueprint from this public repository in Render, inspect the plan and service name, then deploy. If connected through a public repository URL without the Render GitHub integration, deployments are manual. If integrated, the Blueprint requests deployment after CI checks pass. Never put an API token or account password into source files.

Public mode sets `SOLAR_PUBLIC=1`, one calculation worker and one cached run. Render generates `SOLAR_SESSION_SECRET`; it signs session cookies and is never sent to the frontend. Studies and uploads belong to the browser's session. The baked reference is public. Online studies support 160 strings and up to 80 Monte Carlo samples. The local application supports larger studies within its normal validation limits.

Render free services sleep after inactivity and need time to wake. The workspace shares a monthly allowance of free instance hours; other services use the same allowance. Files on the free service are ephemeral. Export CSV/ZIP/PDF outputs before a restart or redeploy. A signed browser cookie does not replace user accounts or provide permanent backup. See [Render's free-service documentation](https://render.com/docs/free) for current quotas and behavior.

The service has no connection to physical plant controls. Browser headers, request limits, isolated storage and non-root execution reduce risk but cannot guarantee immunity to compromise or resource exhaustion. See [security](../SECURITY.md).
