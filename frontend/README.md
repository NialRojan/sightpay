# SightPay frontend

Vite + React. Every page reads the FastAPI backend in `../backend`; there is no demo data in the frontend.
See the repository [README](../README.md) ("Run the full app") for running both together.

```bash
npm install
npm run dev        # http://localhost:5173, also on the LAN (Network: URL)
npm run build      # static build in dist/
npx oxlint src     # lint (npm run lint)
```

- **Backend proxy:** `npm run dev` / `npm run preview` proxy `/api` and `/media` to `BACKEND_URL`
  (default `http://localhost:8000`; set it in the shell or `frontend/.env.local`). A static build that calls a
  backend directly: `VITE_API_URL=http://<host>:8000/api npm run build`.
- **HTTPS on a phone:** `ngrok http 5173` works with no extra config (`*.ngrok-free.app`, `*.ngrok-free.dev`,
  `*.ngrok.app`, `*.ngrok.io` are allowed hosts). Set the backend's `PUBLIC_BASE_URL` to the tunnel URL.
- **Code map:** `src/services/*` has one module per backend area (the API client is `services/api.js`; errors are
  `ApiError` with the backend's `detail`); `src/pages/*` are the routes in `src/SightPayRoutes.jsx`;
  `src/components/mobile/*` is the FSE mobile app (`/fse/mobile`: capture, live pipeline, outcome, voice assistant).
  The backend contract is [`docs/api-contract.md`](../docs/api-contract.md); the page-to-endpoint map is
  [`docs/frontend-integration.md`](../docs/frontend-integration.md).
- **Who is signed in:** the Login page stores the chosen rep or manager in `localStorage` (`services/session.js`);
  the backend has no auth.
