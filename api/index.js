// Vercel Function entry for the whole NestJS API (one function; Nest's router handles every /api/* path).
// Loads the PRE-BUILT tsc output so decorator metadata (needed by ValidationPipe) comes from the project's
// own TypeScript build. Built by the root `npm run build` (see vercel.json).
module.exports = require('../backend/dist/serverless.js').default;
