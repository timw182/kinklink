const fs = require('fs');
const path = require('path');

// Parse .env file into object
function loadEnv(filePath) {
  const env = {};
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          let val = trimmed.slice(idx + 1);
          // Strip surrounding quotes (single or double)
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          env[trimmed.slice(0, idx)] = val;
        }
      }
    }
  }
  return env;
}

module.exports = {
  apps: [
    {
      name: 'venn-api',
      script: '/root/venn/.venv/bin/python',
      args: '-m uvicorn main:app --host 127.0.0.1 --port 7713 --proxy-headers --forwarded-allow-ips=127.0.0.1',
      cwd: '/root/venn/backend',
      env: loadEnv('/root/venn/backend/.env'),
    },
    // Frontend is served by nginx from frontend/dist — no pm2 process needed.
    // To rebuild: cd frontend && npm run build
  ],
};
