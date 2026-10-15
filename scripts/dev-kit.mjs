import { createServer } from 'vite';
const server = await createServer({
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
});
await server.listen();
console.log(
  'Component kit: http://127.0.0.1:5174/dev/kit.html (development only)',
);
