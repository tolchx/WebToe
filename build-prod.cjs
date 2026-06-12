process.env.BASE_URL = '/webtoe/';
const { execSync } = require('child_process');
execSync('npx vite build', { cwd: __dirname + '/apps/web', stdio: 'inherit' });
