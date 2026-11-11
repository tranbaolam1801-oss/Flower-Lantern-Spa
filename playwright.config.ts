import { defineConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';
// Ephemeral key for the isolated E2E server only; never changes local credentials.
const testJwtSecret = randomBytes(48).toString('base64url');
export default defineConfig({
  testDir:'./tests',fullyParallel:true,use:{baseURL:'http://127.0.0.1:5183',viewport:{width:1440,height:900}},
  webServer:[
    {command:'node node_modules/vite/bin/vite.js frontend --host 127.0.0.1 --port 5183',url:'http://127.0.0.1:5183',reuseExistingServer:false,env:{API_PROXY_TARGET:'http://127.0.0.1:3100'}},
    {command:'node --env-file=backend/.env backend/dist/main.js',url:'http://127.0.0.1:3100/api/health/live',reuseExistingServer:false,env:{PORT:'3100',FRONTEND_ORIGIN:'http://127.0.0.1:5183',JWT_SECRET:testJwtSecret}},
  ],
});
