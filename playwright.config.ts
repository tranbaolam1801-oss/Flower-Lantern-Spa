import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',fullyParallel:true,use:{baseURL:'http://127.0.0.1:5173',viewport:{width:1440,height:900}},
  webServer:[
    {command:'npm.cmd run dev -w frontend',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI},
    {command:'npm.cmd run start -w backend',url:'http://127.0.0.1:3000/api/health/live',reuseExistingServer:!process.env.CI},
  ],
});
