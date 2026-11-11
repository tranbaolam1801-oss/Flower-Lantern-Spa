import { defineConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';
export default defineConfig({
  testDir:'./tests',testMatch:'sessions.spec.ts',workers:1,timeout:90000,
  use:{baseURL:'http://127.0.0.1:5183',viewport:{width:1440,height:900}},
  webServer:[
    {command:'node node_modules/vite/bin/vite.js frontend --host 127.0.0.1 --port 5183',url:'http://127.0.0.1:5183',reuseExistingServer:false,env:{API_PROXY_TARGET:'http://127.0.0.1:3100'}},
    {command:'node --env-file=backend/.env backend/dist/main.js',url:'http://127.0.0.1:3100/api/health/live',reuseExistingServer:false,env:{PORT:'3100',FRONTEND_ORIGIN:'http://127.0.0.1:5183',JWT_SECRET:randomBytes(48).toString('base64url'),DB_NAME:'FlowerLanternSpa_Test',DB_AUTH:'windows',DB_HOST:'localhost',AUTH_SESSION_STORE:'sql'}},
  ],
});
