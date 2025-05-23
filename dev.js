import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting development servers...\n');

// Start the backend server
const backend = spawn('npm', ['run', 'dev:server'], {
    stdio: ['inherit', 'inherit', 'inherit'],
    shell: true,
    cwd: __dirname
});

// Start the frontend development server
const frontend = spawn('npm', ['run', 'dev'], {
    stdio: ['inherit', 'inherit', 'inherit'],
    shell: true,
    cwd: __dirname
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down development servers...');
    backend.kill();
    frontend.kill();
    process.exit(0);
});

backend.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
    frontend.kill();
});

frontend.on('close', (code) => {
    console.log(`Frontend process exited with code ${code}`);
    backend.kill();
});
