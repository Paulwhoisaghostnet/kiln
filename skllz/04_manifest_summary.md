# Manifest Summary

## Bowers/package.json
{
  "name": "bowers",
  "version": "1.0.0",
  "private": null,
  "type": "module",
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "tsx script/build.ts",
    "build:netlify": "tsx script/build.ts --netlify",
    "start": "NODE_ENV=production node dist/index.cjs",
    "check": "tsc",
    "check:styles": "tsx script/verify-style-support.ts",
    "db:push": "drizzle-kit push",
    "db:up": "docker compose up -d",
    "db:down": "docker compose down",
    "compile:contracts": "bash scripts/compile-contracts.sh",
    "test:e2e": "playwright test",
    "test:e2e:smoke": "playwright test e2e/smoke.spec.ts e2e/api-health.spec.ts e2e/wallet.spec.ts e2e/collection.spec.ts e2e/auth-session.spec.ts e2e/dashboard.spec.ts",
    "test:e2e:headed": "playwright test --headed",
    "lighthouse": "lhci autorun"
  },
  "dependencies": {
    "@airgap/beacon-sdk": "^4.7.0",
    "@hookform/resolvers": "^3.10.0",
    "@jridgewell/trace-mapping": "^0.3.25",
    "@radix-ui/react-accordion": "^1.2.4",
    "@radix-ui/react-alert-dialog": "^1.1.7",
    "@radix-ui/react-aspect-ratio": "^1.1.3",
    "@radix-ui/react-avatar": "^1.1.4",
    "@radix-ui/react-checkbox": "^1.1.5",
    "@radix-ui/react-collapsible": "^1.1.4",
    "@radix-ui/react-context-menu": "^2.2.7",
    "@radix-ui/react-dialog": "^1.1.7",
    "@radix-ui/react-dropdown-menu": "^2.1.7",
    "@radix-ui/react-hover-card": "^1.1.7",
    "@radix-ui/react-label": "^2.1.3",
    "@radix-ui/react-menubar": "^1.1.7",
    "@radix-ui/react-navigation-menu": "^1.2.6",
    "@radix-ui/react-popover": "^1.1.7",
    "@radix-ui/react-progress": "^1.1.3",
    "@radix-ui/react-radio-group": "^1.2.4",
    "@radix-ui/react-scroll-area": "^1.2.4",
    "@radix-ui/react-select": "^2.1.7",
    "@radix-ui/react-separator": "^1.1.3",
    "@radix-ui/react-slider": "^1.2.4",
    "@radix-ui/react-slot": "^1.2.0",
    "@radix-ui/react-switch": "^1.1.4",
    "@radix-ui/react-tabs": "^1.1.4",
    "@radix-ui/react-toast": "^1.2.7",
    "@radix-ui/react-toggle": "^1.1.3",
    "@radix-ui/react-toggle-group": "^1.1.3",
    "@radix-ui/react-tooltip": "^1.2.0",
    "@tanstack/react-query": "^5.60.5",
    "@taquito/beacon-wallet": "^24.0.2",
    "@taquito/michel-codec": "^24.0.2",
    "@taquito/taquito": "^24.0.2",
    "@taquito/tzip12": "^24.0.2",
    "@taquito/tzip16": "^24.0.2",
    "@taquito/utils": "^24.0.2",
    "@tezos-x/octez.connect-sdk": "^1.0.0",
    "buffer": "^6.0.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "connect-pg-simple": "^10.0.0",
    "cors": "^2.8.6",
    "date-fns": "^3.6.0",
    "dotenv": "^17.3.1",
    "drizzle-orm": "^0.39.3",
    "drizzle-zod": "^0.7.0",
    "embla-carousel-react": "^8.6.0",
    "express": "^5.0.1",
    "express-session": "^1.19.0",
    "framer-motion": "^11.13.1",
    "helmet": "^8.1.0",
    "input-otp": "^1.4.2",
    "lucide-react": "^0.453.0",
    "memorystore": "^1.6.7",
    "multer": "^2.0.2",
    "next-themes": "^0.4.6",
    "passport": "^0.7.0",
    "passport-local": "^1.0.0",
    "pg": "^8.16.3",
    "react": "^18.3.1",
    "react-day-picker": "^8.10.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.55.0",
    "react-icons": "^5.4.0",
    "react-resizable-panels": "^2.1.7",
    "recharts": "^2.15.2",
    "serverless-http": "^4.0.0",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7",
    "tw-animate-css": "^1.2.5",
    "vaul": "^1.1.2",
    "wouter": "^3.3.5",
    "ws": "^8.18.0",
    "zod": "^3.24.2",
    "zod-validation-error": "^3.4.0"
  },
  "devDependencies": {
    "@lhci/cli": "^0.15.1",
    "@playwright/test": "^1.58.2",
    "@tailwindcss/typography": "^0.5.15",
    "@tailwindcss/vite": "^4.1.18",
    "@types/connect-pg-simple": "^7.0.3",
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.0",
    "@types/express-session": "^1.18.2",
    "@types/multer": "^2.0.0",
    "@types/node": "20.19.27",
    "@types/passport": "^1.0.17",
    "@types/passport-local": "^1.0.38",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@types/ws": "^8.5.13",
    "@vitejs/plugin-react": "^4.7.0",
    "autoprefixer": "^10.4.20",
    "drizzle-kit": "^0.31.8",
    "esbuild": "^0.25.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.17",
    "tsx": "^4.20.5",
    "typescript": "5.6.3",
    "vite": "^7.3.0",
    "vite-plugin-node-polyfills": "^0.25.0"
  }
}

---

## Conflict-Atlas/package.json
{
  "name": "conflict-atlas",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node server.js",
    "ingest": "node scripts/run-ingest.js",
    "reclassify": "node scripts/reclassify-events.js",
    "backfill:2018": "node scripts/backfill-google-news.js --start=2018-01-01",
    "backfill:domains": "node scripts/backfill-domain-batch.js --start=2018-01-01 --step-months=2"
  },
  "dependencies": {
    "better-sqlite3": "^12.4.1",
    "cors": "^2.8.5",
    "express": "^5.1.0",
    "node-cron": "^4.2.1",
    "rss-parser": "^3.13.0",
    "world-countries": "^5.1.0"
  },
  "devDependencies": {
    "playwright": "^1.58.2"
  }
}

---

## Guidance/package.json
{
  "name": "guidance",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "NODE_ENV=production node dist/server/index.js",
    "check": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "better-sqlite3": "^12.4.1",
    "cors": "^2.8.5",
    "express": "^5.1.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/node": "^24.7.2",
    "tsx": "^4.20.5",
    "typescript": "^5.9.3"
  }
}

---

## Image-Battle-Arena/package.json
{
  "name": "rest-express",
  "version": "1.0.0",
  "private": null,
  "type": "module",
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "tsx script/build.ts",
    "start": "NODE_ENV=production node dist/index.cjs",
    "check": "tsc",
    "db:push": "drizzle-kit push"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.10.0",
    "@jridgewell/trace-mapping": "^0.3.25",
    "@radix-ui/react-accordion": "^1.2.4",
    "@radix-ui/react-alert-dialog": "^1.1.7",
    "@radix-ui/react-aspect-ratio": "^1.1.3",
    "@radix-ui/react-avatar": "^1.1.4",
    "@radix-ui/react-checkbox": "^1.1.5",
    "@radix-ui/react-collapsible": "^1.1.4",
    "@radix-ui/react-context-menu": "^2.2.7",
    "@radix-ui/react-dialog": "^1.1.7",
    "@radix-ui/react-dropdown-menu": "^2.1.7",
    "@radix-ui/react-hover-card": "^1.1.7",
    "@radix-ui/react-label": "^2.1.3",
    "@radix-ui/react-menubar": "^1.1.7",
    "@radix-ui/react-navigation-menu": "^1.2.6",
    "@radix-ui/react-popover": "^1.1.7",
    "@radix-ui/react-progress": "^1.1.3",
    "@radix-ui/react-radio-group": "^1.2.4",
    "@radix-ui/react-scroll-area": "^1.2.4",
    "@radix-ui/react-select": "^2.1.7",
    "@radix-ui/react-separator": "^1.1.3",
    "@radix-ui/react-slider": "^1.2.4",
    "@radix-ui/react-slot": "^1.2.0",
    "@radix-ui/react-switch": "^1.1.4",
    "@radix-ui/react-tabs": "^1.1.4",
    "@radix-ui/react-toast": "^1.2.7",
    "@radix-ui/react-toggle": "^1.1.3",
    "@radix-ui/react-toggle-group": "^1.1.3",
    "@radix-ui/react-tooltip": "^1.2.0",
    "@tanstack/react-query": "^5.60.5",
    "@types/memoizee": "^0.4.12",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "connect-pg-simple": "^10.0.0",
    "date-fns": "^3.6.0",
    "drizzle-orm": "^0.39.3",
    "drizzle-zod": "^0.7.0",
    "embla-carousel-react": "^8.6.0",
    "express": "^5.0.1",
    "express-session": "^1.19.0",
    "framer-motion": "^11.18.2",
    "input-otp": "^1.4.2",
    "lucide-react": "^0.453.0",
    "memoizee": "^0.4.17",
    "memorystore": "^1.6.7",
    "next-themes": "^0.4.6",
    "openid-client": "^6.8.1",
    "passport": "^0.7.0",
    "passport-local": "^1.0.0",
    "pg": "^8.16.3",
    "react": "^18.3.1",
    "react-day-picker": "^8.10.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.55.0",
    "react-icons": "^5.4.0",
    "react-resizable-panels": "^2.1.7",
    "recharts": "^2.15.2",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7",
    "tw-animate-css": "^1.2.5",
    "vaul": "^1.1.2",
    "wouter": "^3.3.5",
    "ws": "^8.18.0",
    "zod": "^3.24.2",
    "zod-validation-error": "^3.4.0"
  },
  "devDependencies": {
    "@replit/vite-plugin-cartographer": "^0.4.4",
    "@replit/vite-plugin-dev-banner": "^0.1.1",
    "@replit/vite-plugin-runtime-error-modal": "^0.0.3",
    "@tailwindcss/typography": "^0.5.15",
    "@tailwindcss/vite": "^4.1.18",
    "@types/connect-pg-simple": "^7.0.3",
    "@types/express": "^5.0.0",
    "@types/express-session": "^1.18.2",
    "@types/node": "20.19.27",
    "@types/passport": "^1.0.17",
    "@types/passport-local": "^1.0.38",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@types/ws": "^8.5.13",
    "@vitejs/plugin-react": "^4.7.0",
    "autoprefixer": "^10.4.20",
    "drizzle-kit": "^0.31.8",
    "esbuild": "^0.25.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.17",
    "tsx": "^4.20.5",
    "typescript": "5.6.3",
    "vite": "^7.3.0"
  }
}

---

## Objkt-Advisor/package.json
{
  "name": "rest-express",
  "version": "1.0.0",
  "private": null,
  "type": "module",
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "tsx script/build.ts",
    "start": "NODE_ENV=production node dist/index.cjs",
    "check": "tsc",
    "db:push": "drizzle-kit push",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.10.0",
    "@jridgewell/trace-mapping": "^0.3.25",
    "@radix-ui/react-accordion": "^1.2.4",
    "@radix-ui/react-alert-dialog": "^1.1.7",
    "@radix-ui/react-aspect-ratio": "^1.1.3",
    "@radix-ui/react-avatar": "^1.1.4",
    "@radix-ui/react-checkbox": "^1.1.5",
    "@radix-ui/react-collapsible": "^1.1.4",
    "@radix-ui/react-context-menu": "^2.2.7",
    "@radix-ui/react-dialog": "^1.1.7",
    "@radix-ui/react-dropdown-menu": "^2.1.7",
    "@radix-ui/react-hover-card": "^1.1.7",
    "@radix-ui/react-label": "^2.1.3",
    "@radix-ui/react-menubar": "^1.1.7",
    "@radix-ui/react-navigation-menu": "^1.2.6",
    "@radix-ui/react-popover": "^1.1.7",
    "@radix-ui/react-progress": "^1.1.3",
    "@radix-ui/react-radio-group": "^1.2.4",
    "@radix-ui/react-scroll-area": "^1.2.4",
    "@radix-ui/react-select": "^2.1.7",
    "@radix-ui/react-separator": "^1.1.3",
    "@radix-ui/react-slider": "^1.2.4",
    "@radix-ui/react-slot": "^1.2.0",
    "@radix-ui/react-switch": "^1.1.4",
    "@radix-ui/react-tabs": "^1.1.4",
    "@radix-ui/react-toast": "^1.2.7",
    "@radix-ui/react-toggle": "^1.1.3",
    "@radix-ui/react-toggle-group": "^1.1.3",
    "@radix-ui/react-tooltip": "^1.2.0",
    "@tanstack/react-query": "^5.60.5",
    "@types/better-sqlite3": "^7.6.13",
    "better-sqlite3": "^12.5.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "connect-pg-simple": "^10.0.0",
    "date-fns": "^3.6.0",
    "drizzle-orm": "^0.45.1",
    "drizzle-zod": "^0.7.0",
    "embla-carousel-react": "^8.6.0",
    "express": "^4.21.2",
    "express-session": "^1.18.1",
    "framer-motion": "^11.18.2",
    "graphql": "^16.12.0",
    "graphql-request": "^7.4.0",
    "input-otp": "^1.4.2",
    "lucide-react": "^0.453.0",
    "memorystore": "^1.6.7",
    "next-themes": "^0.4.6",
    "passport": "^0.7.0",
    "passport-local": "^1.0.0",
    "pg": "^8.16.3",
    "react": "^18.3.1",
    "react-day-picker": "^8.10.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.55.0",
    "react-icons": "^5.4.0",
    "react-resizable-panels": "^2.1.7",
    "recharts": "^2.15.4",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7",
    "tw-animate-css": "^1.2.5",
    "vaul": "^1.1.2",
    "wouter": "^3.3.5",
    "ws": "^8.18.0",
    "zod": "^3.24.2",
    "zod-validation-error": "^3.4.0"
  },
  "devDependencies": {
    "@replit/vite-plugin-cartographer": "^0.4.4",
    "@replit/vite-plugin-dev-banner": "^0.1.1",
    "@replit/vite-plugin-runtime-error-modal": "^0.0.3",
    "@tailwindcss/typography": "^0.5.15",
    "@tailwindcss/vite": "^4.1.18",
    "@types/connect-pg-simple": "^7.0.3",
    "@types/express": "4.17.21",
    "@types/express-session": "^1.18.0",
    "@types/jest": "^30.0.0",
    "@types/node": "20.19.27",
    "@types/passport": "^1.0.16",
    "@types/passport-local": "^1.0.38",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@types/ws": "^8.5.13",
    "@vitejs/plugin-react": "^4.7.0",
    "autoprefixer": "^10.4.20",
    "drizzle-kit": "^0.31.8",
    "esbuild": "^0.25.0",
    "jest": "^30.2.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.17",
    "ts-jest": "^29.4.6",
    "tsx": "^4.20.5",
    "typescript": "5.6.3",
    "vite": "^7.3.0"
  }
}

---

## Particle Painting/particle-studio/package.json
{
  "name": "particle-studio",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint ."
  },
  "dependencies": {
    "@airgap/beacon-sdk": "^4.7.0",
    "@ffmpeg/ffmpeg": "^0.12.15",
    "@ffmpeg/util": "^0.12.2",
    "@radix-ui/react-select": "^2.1.2",
    "@radix-ui/react-slider": "^1.2.2",
    "@radix-ui/react-switch": "^1.1.2",
    "@radix-ui/react-tabs": "^1.1.2",
    "@taquito/beacon-wallet": "^24.0.2",
    "@taquito/taquito": "^24.0.2",
    "@taquito/utils": "^24.0.2",
    "buffer": "^6.0.3",
    "clsx": "^2.1.1",
    "gif.js": "^0.2.0",
    "mp4-muxer": "^5.2.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tone": "^15.1.22",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@eslint/js": "^9.9.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "eslint": "^9.9.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-react-hooks": "^5.1.0-rc.0",
    "eslint-plugin-react-refresh": "^0.4.11",
    "globals": "^17.2.0",
    "prettier": "^3.3.3",
    "typescript": "^5.5.4",
    "typescript-eslint": "^8.54.0",
    "vite": "^5.4.2",
    "vite-plugin-node-polyfills": "^0.25.0"
  }
}

---

## Tezos-Intel/package.json
{
  "name": "rest-express",
  "version": "1.0.0",
  "private": null,
  "type": "module",
  "scripts": {
    "dev:client": "vite dev --port 5000",
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "tsx script/build.ts",
    "start": "NODE_ENV=production node dist/index.cjs",
    "check": "tsc",
    "db:push": "drizzle-kit push"
  },
  "dependencies": {
    "@airgap/beacon-dapp": "^4.7.0",
    "@hookform/resolvers": "^3.10.0",
    "@jridgewell/trace-mapping": "^0.3.25",
    "@radix-ui/react-accordion": "^1.2.12",
    "@radix-ui/react-alert-dialog": "^1.1.15",
    "@radix-ui/react-aspect-ratio": "^1.1.8",
    "@radix-ui/react-avatar": "^1.1.11",
    "@radix-ui/react-checkbox": "^1.3.3",
    "@radix-ui/react-collapsible": "^1.1.12",
    "@radix-ui/react-context-menu": "^2.2.16",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.16",
    "@radix-ui/react-hover-card": "^1.1.15",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-menubar": "^1.1.16",
    "@radix-ui/react-navigation-menu": "^1.2.14",
    "@radix-ui/react-popover": "^1.1.15",
    "@radix-ui/react-progress": "^1.1.8",
    "@radix-ui/react-radio-group": "^1.3.8",
    "@radix-ui/react-scroll-area": "^1.2.10",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-separator": "^1.1.8",
    "@radix-ui/react-slider": "^1.3.6",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-switch": "^1.2.6",
    "@radix-ui/react-tabs": "^1.1.13",
    "@radix-ui/react-toast": "^1.2.7",
    "@radix-ui/react-toggle": "^1.1.10",
    "@radix-ui/react-toggle-group": "^1.1.11",
    "@radix-ui/react-tooltip": "^1.2.8",
    "@tanstack/react-query": "^5.60.5",
    "axios": "^1.13.5",
    "buffer": "^6.0.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "connect-pg-simple": "^10.0.0",
    "date-fns": "^3.6.0",
    "drizzle-orm": "^0.39.3",
    "drizzle-zod": "^0.7.0",
    "embla-carousel-react": "^8.6.0",
    "events": "^3.3.0",
    "express": "^5.0.1",
    "express-session": "^1.18.1",
    "framer-motion": "^12.23.24",
    "input-otp": "^1.4.2",
    "lucide-react": "^0.545.0",
    "memorystore": "^1.6.7",
    "next-themes": "^0.4.6",
    "passport": "^0.7.0",
    "passport-local": "^1.0.0",
    "pg": "^8.16.3",
    "react": "^19.2.0",
    "react-day-picker": "^9.11.1",
    "react-dom": "^19.2.0",
    "react-hook-form": "^7.66.0",
    "react-resizable-panels": "^2.1.9",
    "recharts": "^2.15.4",
    "sonner": "^2.0.7",
    "stream-browserify": "^3.0.0",
    "tailwind-merge": "^3.3.1",
    "tailwindcss-animate": "^1.0.7",
    "tw-animate-css": "^1.4.0",
    "util": "^0.12.5",
    "vaul": "^1.1.2",
    "wouter": "^3.3.5",
    "ws": "^8.18.0",
    "zod": "^3.25.76",
    "zod-validation-error": "^3.4.0"
  },
  "devDependencies": {
    "@replit/vite-plugin-cartographer": "^0.4.4",
    "@replit/vite-plugin-dev-banner": "^0.1.1",
    "@replit/vite-plugin-runtime-error-modal": "^0.0.4",
    "@tailwindcss/vite": "^4.1.14",
    "@types/connect-pg-simple": "^7.0.3",
    "@types/express": "^5.0.0",
    "@types/express-session": "^1.18.0",
    "@types/node": "^20.19.0",
    "@types/passport": "^1.0.16",
    "@types/passport-local": "^1.0.38",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@types/ws": "^8.5.13",
    "@vitejs/plugin-react": "^5.0.4",
    "autoprefixer": "^10.4.21",
    "drizzle-kit": "^0.31.4",
    "esbuild": "^0.25.0",
    "postcss": "^8.5.6",
    "tailwindcss": "^4.1.14",
    "tsx": "^4.20.5",
    "typescript": "5.6.3",
    "vite": "^7.1.9"
  }
}

---

## Tezos-Scout/package.json
{
  "name": "rest-express",
  "version": "1.0.0",
  "private": null,
  "type": "module",
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "tsx script/build.ts",
    "start": "NODE_ENV=production node dist/index.cjs",
    "check": "tsc",
    "db:push": "drizzle-kit push"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.10.0",
    "@jridgewell/trace-mapping": "^0.3.25",
    "@radix-ui/react-accordion": "^1.2.4",
    "@radix-ui/react-alert-dialog": "^1.1.7",
    "@radix-ui/react-aspect-ratio": "^1.1.3",
    "@radix-ui/react-avatar": "^1.1.4",
    "@radix-ui/react-checkbox": "^1.1.5",
    "@radix-ui/react-collapsible": "^1.1.4",
    "@radix-ui/react-context-menu": "^2.2.7",
    "@radix-ui/react-dialog": "^1.1.7",
    "@radix-ui/react-dropdown-menu": "^2.1.7",
    "@radix-ui/react-hover-card": "^1.1.7",
    "@radix-ui/react-label": "^2.1.3",
    "@radix-ui/react-menubar": "^1.1.7",
    "@radix-ui/react-navigation-menu": "^1.2.6",
    "@radix-ui/react-popover": "^1.1.7",
    "@radix-ui/react-progress": "^1.1.3",
    "@radix-ui/react-radio-group": "^1.2.4",
    "@radix-ui/react-scroll-area": "^1.2.4",
    "@radix-ui/react-select": "^2.1.7",
    "@radix-ui/react-separator": "^1.1.3",
    "@radix-ui/react-slider": "^1.2.4",
    "@radix-ui/react-slot": "^1.2.0",
    "@radix-ui/react-switch": "^1.1.4",
    "@radix-ui/react-tabs": "^1.1.4",
    "@radix-ui/react-toast": "^1.2.7",
    "@radix-ui/react-toggle": "^1.1.3",
    "@radix-ui/react-toggle-group": "^1.1.3",
    "@radix-ui/react-tooltip": "^1.2.0",
    "@tanstack/react-query": "^5.60.5",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "connect-pg-simple": "^10.0.0",
    "date-fns": "^3.6.0",
    "drizzle-orm": "^0.39.3",
    "drizzle-zod": "^0.7.0",
    "embla-carousel-react": "^8.6.0",
    "express": "^4.21.2",
    "express-session": "^1.18.1",
    "framer-motion": "^11.18.2",
    "graphql": "^16.12.0",
    "graphql-request": "^7.4.0",
    "input-otp": "^1.4.2",
    "lucide-react": "^0.453.0",
    "memorystore": "^1.6.7",
    "next-themes": "^0.4.6",
    "passport": "^0.7.0",
    "passport-local": "^1.0.0",
    "pg": "^8.16.3",
    "react": "^18.3.1",
    "react-day-picker": "^8.10.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.55.0",
    "react-icons": "^5.4.0",
    "react-resizable-panels": "^2.1.7",
    "recharts": "^2.15.4",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7",
    "tw-animate-css": "^1.2.5",
    "vaul": "^1.1.2",
    "wouter": "^3.3.5",
    "ws": "^8.18.0",
    "zod": "^3.24.2",
    "zod-validation-error": "^3.4.0"
  },
  "devDependencies": {
    "@replit/vite-plugin-cartographer": "^0.4.4",
    "@replit/vite-plugin-dev-banner": "^0.1.1",
    "@replit/vite-plugin-runtime-error-modal": "^0.0.3",
    "@tailwindcss/typography": "^0.5.15",
    "@tailwindcss/vite": "^4.1.18",
    "@types/connect-pg-simple": "^7.0.3",
    "@types/express": "4.17.21",
    "@types/express-session": "^1.18.0",
    "@types/node": "20.19.27",
    "@types/passport": "^1.0.16",
    "@types/passport-local": "^1.0.38",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@types/ws": "^8.5.13",
    "@vitejs/plugin-react": "^4.7.0",
    "autoprefixer": "^10.4.20",
    "drizzle-kit": "^0.31.8",
    "esbuild": "^0.25.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.17",
    "tsx": "^4.20.5",
    "typescript": "5.6.3",
    "vite": "^7.3.0"
  }
}

---

## WTF/package.json
{
  "name": "wtf-gameshow",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx server/index.ts",
    "build": "vite build && esbuild server/index.ts --bundle --platform=node --format=cjs --outfile=dist/index.cjs --external:pg-native --external:bufferutil --external:utf-8-validate --external:passport-google-oauth20 --external:passport-github2 --external:passport-twitter --external:passport-discord",
    "build:netlify": "vite build && esbuild netlify/functions/api.ts --bundle --platform=node --format=cjs --outfile=dist/functions/api.cjs --external:pg-native --external:bufferutil --external:utf-8-validate --external:passport-google-oauth20 --external:passport-github2 --external:passport-twitter --external:passport-discord",
    "start": "NODE_ENV=production node dist/index.cjs",
    "db:push": "drizzle-kit push",
    "db:generate": "drizzle-kit generate",
    "db:studio": "drizzle-kit studio",
    "db:check": "node scripts/check-db-connection.mjs",
    "db:print-url": "node scripts/resolve-database-url.mjs",
    "db:seed-admin": "tsx scripts/seed-admin.ts",
    "contract:test": "bash scripts/test-marketplace-contract.sh",
    "check": "tsc --noEmit",
    "supabase": "supabase",
    "supabase:start": "supabase start",
    "supabase:stop": "supabase stop",
    "supabase:status": "supabase status",
    "supabase:link": "supabase link",
    "supabase:db:reset": "supabase db reset"
  },
  "dependencies": {
    "@hookform/resolvers": "^5.2.2",
    "@octokit/rest": "^22.0.1",
    "@supabase/supabase-js": "^2.101.1",
    "@tanstack/react-query": "^5.96.2",
    "@taquito/beacon-wallet": "^24.2.0",
    "@taquito/taquito": "^24.2.0",
    "@taquito/tzip12": "^24.2.0",
    "@taquito/tzip16": "^24.2.0",
    "@taquito/utils": "^24.2.0",
    "@tezos-x/octez.connect-sdk": "^4.8.3",
    "buffer": "^6.0.3",
    "connect-pg-simple": "^10.0.0",
    "cors": "^2.8.6",
    "date-fns": "^4.1.0",
    "dotenv": "^17.4.1",
    "drizzle-orm": "^0.45.2",
    "drizzle-zod": "^0.8.3",
    "express": "^5.2.1",
    "express-session": "^1.19.0",
    "helmet": "^8.1.0",
    "lucide-react": "^1.7.0",
    "memorystore": "^1.6.7",
    "multer": "^2.1.1",
    "passport": "^0.7.0",
    "passport-github2": "^0.1.12",
    "passport-discord": "^0.1.4",
    "passport-google-oauth20": "^2.0.0",
    "passport-local": "^1.0.0",
    "passport-twitter": "^1.0.4",
    "pg": "^8.20.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-hook-form": "^7.72.1",
    "react95": "^4.0.0",
    "serverless-http": "^4.0.0",
    "styled-components": "^6.3.12",
    "wouter": "^3.9.0",
    "ws": "^8.20.0",
    "zod": "^4.3.6",
    "zod-validation-error": "^5.0.0"
  },
  "devDependencies": {
    "@types/connect-pg-simple": "^7.0.3",
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.6",
    "@types/express-session": "^1.18.2",
    "@types/multer": "^2.1.0",
    "@types/node": "^25.5.2",
    "@types/passport": "^1.0.17",
    "@types/passport-github2": "^1.2.9",
    "@types/passport-google-oauth20": "^2.0.17",
    "@types/passport-local": "^1.0.38",
    "@types/pg": "^8.20.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@types/styled-components": "^5.1.36",
    "@types/ws": "^8.18.1",
    "@vitejs/plugin-react": "^6.0.1",
    "drizzle-kit": "^0.31.10",
    "esbuild": "0.28.0",
    "supabase": "^2.84.10",
    "tsx": "^4.21.0",
    "typescript": "^6.0.2",
    "vite": "^8.0.3"
  }
}

---

## album packager/package.json
{
  "name": "analbumpacker",
  "version": "0.1.0",
  "private": true,
  "type": null,
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": null,
  "devDependencies": null
}

---

## color wars/package.json
{
  "name": "color-wars",
  "version": "0.1.0",
  "private": true,
  "type": null,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "db:init": "tsx scripts/initDb.ts",
    "db:audit": "tsx scripts/auditDb.ts",
    "test": "vitest",
    "test:watch": "vitest --watch",
    "seed:stock": "tsx scripts/seedStock.ts"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "better-sqlite3": "^11.0.0",
    "canvas": "^2.11.2",
    "crypto": "^1.0.1",
    "drizzle-orm": "^0.33.0",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitest/ui": "^1.6.0",
    "autoprefixer": "^10.4.0",
    "drizzle-kit": "^0.24.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  }
}

---

## fafo tax/frontend/package.json
{
  "name": "fafo-tax-frontend",
  "version": "1.0.0",
  "private": null,
  "type": null,
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject",
    "lint": "eslint src --ext .js,.jsx,.ts,.tsx",
    "lint:fix": "eslint src --ext .js,.jsx,.ts,.tsx --fix"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.8.0",
    "react-scripts": "5.0.1",
    "axios": "^1.6.0",
    "typescript": "^4.9.5",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@types/node": "^20.0.0",
    "recharts": "^2.8.0",
    "react-table": "^7.8.0",
    "@types/react-table": "^7.7.0",
    "react-datepicker": "^4.25.0",
    "@types/react-datepicker": "^4.19.0",
    "react-select": "^5.8.0",
    "react-query": "^3.39.0",
    "react-hook-form": "^7.48.0",
    "styled-components": "^6.1.0",
    "@types/styled-components": "^5.1.0",
    "lucide-react": "^0.294.0",
    "date-fns": "^2.30.0",
    "lodash": "^4.17.21",
    "@types/lodash": "^4.14.0"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0",
    "eslint-plugin-react": "^7.33.0",
    "eslint-plugin-react-hooks": "^4.6.0"
  }
}

---

## ledger-village/package.json
{
  "name": "ledger-village",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently -k \"npm:dev:server\" \"npm:dev:client\"",
    "dev:client": "vite",
    "dev:server": "tsx watch server/index.ts",
    "build": "npm run build:client && npm run build:server",
    "build:client": "tsc -b && vite build",
    "build:server": "tsc -p tsconfig.server.json",
    "lint": "eslint .",
    "test": "vitest run",
    "preview": "vite preview"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^5.1.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.4",
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.3",
    "@types/node": "^24.12.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.0",
    "concurrently": "^9.2.1",
    "eslint": "^9.39.4",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "^17.4.0",
    "playwright": "^1.58.2",
    "tsx": "^4.20.6",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.56.1",
    "vite": "^8.0.0",
    "vitest": "^4.0.8"
  }
}

---

## local-video-review-lab/pyproject.toml
[project]
name = "local-video-review-lab"
version = "0.1.0"
description = "Local macOS video review and clipping pipeline powered by ffmpeg and MLX models."
requires-python = ">=3.11"
dependencies = [
  "Pillow>=10.0.0",
  "mlx-lm>=0.31.1",
  "mlx-vlm>=0.4.0",
  "mlx-whisper>=0.4.3",
  "torchvision>=0.26.0",
]

[project.scripts]
local-video-review-lab = "local_video_review_lab.cli:main"

[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[tool.setuptools]
package-dir = {"" = "src"}

[tool.setuptools.packages.find]
where = ["src"]

---

## model-match-lab/package.json
{
  "name": "model-match-lab",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.4",
    "react-dom": "^19.2.4"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.4",
    "@types/node": "^24.12.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.0",
    "electron": "^41.0.2",
    "eslint": "^9.39.4",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "^17.4.0",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.56.1",
    "vite": "^8.0.0",
    "vite-plugin-electron": "^0.29.1",
    "vite-plugin-electron-renderer": "^0.14.6"
  }
}

---

## p5js/package.json
{
  "name": "signal-foundry",
  "version": "1.0.0",
  "private": null,
  "type": "module",
  "scripts": {
    "start": "http-server -p 8001 -o -c-1",
    "dev": "http-server -p 8001 -o -c-1",
    "smoke": "node scripts/smoke-studio.mjs http://127.0.0.1:8001 output/manual/smoke-studio",
    "build": "echo 'No build step required for Signal Foundry'"
  },
  "dependencies": {
    "gif.js": "^0.2.0",
    "jspdf": "^4.2.1",
    "three": "^0.183.2"
  },
  "devDependencies": {
    "http-server": "^14.1.1"
  }
}

---

## projects/Sandbox/Visualize Anything/package.json
{
  "name": "visualize-anything",
  "version": "1.0.0",
  "private": null,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "postinstall": "mkdir -p src/assets/ffmpeg && cp node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js src/assets/ffmpeg/ && cp node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm src/assets/ffmpeg/ && cp node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js src/assets/ffmpeg/"
  },
  "dependencies": {
    "@ffmpeg/core": "^0.12.4",
    "@ffmpeg/ffmpeg": "^0.12.7",
    "@ffmpeg/util": "^0.12.1",
    "p5": "^1.9.0",
    "three": "^0.160.1",
    "tone": "^15.0.4"
  },
  "devDependencies": {
    "vite": "^5.0.0"
  }
}

---

## projects/Sandbox/lil guy app/package.json
{
  "name": "lil-guys-studio",
  "version": "0.1.0",
  "private": true,
  "type": null,
  "scripts": {
    "install:all": "npm install && cd frontend && npm install && cd ../backend && npm install && cd ../contracts && npm install && cd ..",
    "compile": "cd contracts && npx hardhat compile",
    "test": "npm run test:contracts && npm run test:frontend && npm run test:backend",
    "test:contracts": "cd contracts && npx hardhat test",
    "test:frontend": "cd frontend && npm run test",
    "test:backend": "cd backend && npm run test",
    "test:integration": "npm run test:contracts && npm run test:e2e",
    "test:e2e": "cd frontend && npm run test:e2e",
    "test:gas": "cd contracts && REPORT_GAS=true npx hardhat test",
    "coverage": "cd contracts && npx hardhat coverage",
    "dev:frontend": "cd frontend && npm run dev",
    "dev:backend": "cd backend && npm run dev",
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "build:frontend": "cd frontend && npm run build",
    "build:backend": "cd backend && npm run build",
    "build": "npm run compile && npm run build:frontend && npm run build:backend",
    "deploy:testnet": "cd contracts && npx hardhat run scripts/deploy.ts --network testnet",
    "deploy:mainnet": "cd contracts && npx hardhat run scripts/deploy.ts --network mainnet",
    "verify": "cd contracts && npx hardhat verify --network",
    "script:add-traits": "cd contracts && npx hardhat run scripts/addTraits.ts",
    "script:setup-franchise": "cd contracts && npx hardhat run scripts/setupFranchise.ts",
    "lint": "npm run lint:contracts && npm run lint:frontend && npm run lint:backend",
    "lint:contracts": "cd contracts && npx solhint 'contracts/**/*.sol'",
    "lint:frontend": "cd frontend && npm run lint",
    "lint:backend": "cd backend && npm run lint",
    "format": "prettier --write \"**/*.{js,jsx,ts,tsx,json,css,md,sol}\"",
    "clean": "rm -rf node_modules frontend/node_modules backend/node_modules contracts/node_modules artifacts cache typechain-types"
  },
  "dependencies": null,
  "devDependencies": {
    "concurrently": "^8.2.2",
    "prettier": "^3.1.1",
    "prettier-plugin-solidity": "^1.3.1"
  }
}

---

## projects/Sandbox/mafiabot/package.json
{
  "name": "mafiabot",
  "version": "1.0.0",
  "private": null,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "deploy": "tsx src/discord/deploy.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "format": "prettier --write \"src/**/*.ts\"",
    "migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "better-sqlite3": "^11.8.1",
    "discord.js": "^14.18.0",
    "dotenv": "^16.5.0",
    "pino": "^9.6.0",
    "pino-pretty": "^13.0.0",
    "zod": "^3.25.42"
  },
  "devDependencies": {
    "@eslint/js": "^9.28.0",
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.15.29",
    "eslint": "^9.28.0",
    "prettier": "^3.5.3",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.33.1",
    "vitest": "^4.0.16"
  }
}

---

## r00t/app/package.json
{
  "name": "r00t-wallet-summary",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@airgap/beacon-sdk": "^4.7.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^5",
    "typescript": "~5.9",
    "vite": "^6"
  }
}

---

## r00t/arb/package.json
{
  "name": "r00t-arb-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {},
  "devDependencies": null
}

---

## r00t/reference/Objkt-Advisor/package.json
{
  "name": "rest-express",
  "version": "1.0.0",
  "private": null,
  "type": "module",
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "tsx script/build.ts",
    "start": "NODE_ENV=production node dist/index.cjs",
    "check": "tsc",
    "db:push": "drizzle-kit push",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.10.0",
    "@jridgewell/trace-mapping": "^0.3.25",
    "@radix-ui/react-accordion": "^1.2.4",
    "@radix-ui/react-alert-dialog": "^1.1.7",
    "@radix-ui/react-aspect-ratio": "^1.1.3",
    "@radix-ui/react-avatar": "^1.1.4",
    "@radix-ui/react-checkbox": "^1.1.5",
    "@radix-ui/react-collapsible": "^1.1.4",
    "@radix-ui/react-context-menu": "^2.2.7",
    "@radix-ui/react-dialog": "^1.1.7",
    "@radix-ui/react-dropdown-menu": "^2.1.7",
    "@radix-ui/react-hover-card": "^1.1.7",
    "@radix-ui/react-label": "^2.1.3",
    "@radix-ui/react-menubar": "^1.1.7",
    "@radix-ui/react-navigation-menu": "^1.2.6",
    "@radix-ui/react-popover": "^1.1.7",
    "@radix-ui/react-progress": "^1.1.3",
    "@radix-ui/react-radio-group": "^1.2.4",
    "@radix-ui/react-scroll-area": "^1.2.4",
    "@radix-ui/react-select": "^2.1.7",
    "@radix-ui/react-separator": "^1.1.3",
    "@radix-ui/react-slider": "^1.2.4",
    "@radix-ui/react-slot": "^1.2.0",
    "@radix-ui/react-switch": "^1.1.4",
    "@radix-ui/react-tabs": "^1.1.4",
    "@radix-ui/react-toast": "^1.2.7",
    "@radix-ui/react-toggle": "^1.1.3",
    "@radix-ui/react-toggle-group": "^1.1.3",
    "@radix-ui/react-tooltip": "^1.2.0",
    "@tanstack/react-query": "^5.60.5",
    "@types/better-sqlite3": "^7.6.13",
    "better-sqlite3": "^12.5.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "connect-pg-simple": "^10.0.0",
    "date-fns": "^3.6.0",
    "drizzle-orm": "^0.45.1",
    "drizzle-zod": "^0.7.0",
    "embla-carousel-react": "^8.6.0",
    "express": "^4.21.2",
    "express-session": "^1.18.1",
    "framer-motion": "^11.18.2",
    "graphql": "^16.12.0",
    "graphql-request": "^7.4.0",
    "input-otp": "^1.4.2",
    "lucide-react": "^0.453.0",
    "memorystore": "^1.6.7",
    "next-themes": "^0.4.6",
    "passport": "^0.7.0",
    "passport-local": "^1.0.0",
    "pg": "^8.16.3",
    "react": "^18.3.1",
    "react-day-picker": "^8.10.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.55.0",
    "react-icons": "^5.4.0",
    "react-resizable-panels": "^2.1.7",
    "recharts": "^2.15.4",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7",
    "tw-animate-css": "^1.2.5",
    "vaul": "^1.1.2",
    "wouter": "^3.3.5",
    "ws": "^8.18.0",
    "zod": "^3.24.2",
    "zod-validation-error": "^3.4.0"
  },
  "devDependencies": {
    "@replit/vite-plugin-cartographer": "^0.4.4",
    "@replit/vite-plugin-dev-banner": "^0.1.1",
    "@replit/vite-plugin-runtime-error-modal": "^0.0.3",
    "@tailwindcss/typography": "^0.5.15",
    "@tailwindcss/vite": "^4.1.18",
    "@types/connect-pg-simple": "^7.0.3",
    "@types/express": "4.17.21",
    "@types/express-session": "^1.18.0",
    "@types/jest": "^30.0.0",
    "@types/node": "20.19.27",
    "@types/passport": "^1.0.16",
    "@types/passport-local": "^1.0.38",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@types/ws": "^8.5.13",
    "@vitejs/plugin-react": "^4.7.0",
    "autoprefixer": "^10.4.20",
    "drizzle-kit": "^0.31.8",
    "esbuild": "^0.25.0",
    "jest": "^30.2.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.17",
    "ts-jest": "^29.4.6",
    "tsx": "^4.20.5",
    "typescript": "5.6.3",
    "vite": "^7.3.0"
  }
}

---

## r00t/reference/taxmaster/package.json
{
  "name": "taxmaster",
  "version": "0.1.0",
  "private": true,
  "type": null,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "date-fns": "^4.1.0",
    "idb": "^8.0.3",
    "lucide-react": "^0.563.0",
    "next": "16.1.5",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.1.5",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}

---

## r00t/reference/tezpulse/package.json
{
  "name": "tezpulse",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@types/node": "^24.10.1",
    "@types/react": "^19.2.5",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.5.0",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.46.4",
    "vite": "^7.2.4"
  }
}

---

## r00t/reference/web3 simulator/package.json
{
  "name": "tezos-blockchain-simulator",
  "version": "1.0.0",
  "private": true,
  "type": null,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "recharts": "^2.10.0",
    "lucide-react": "^0.294.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.3.0",
    "tailwindcss": "^3.3.6",
    "postcss": "^8.4.32",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.55.0",
    "eslint-config-next": "^14.0.0"
  }
}

---

## r00t/signer/package.json
{
  "name": "r00t-signer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "gen-keypair": "node scripts/gen-keypair.js"
  },
  "dependencies": {
    "@taquito/signer": "^20.0.0",
    "@taquito/taquito": "^20.0.0",
    "bip39": "^3.1.0",
    "dotenv": "^17.2.3",
    "express": "^4.21.0"
  },
  "devDependencies": null
}

---

## taxmaster/package.json
{
  "name": "taxmaster",
  "version": "0.1.0",
  "private": true,
  "type": null,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "date-fns": "^4.1.0",
    "idb": "^8.0.3",
    "lucide-react": "^0.563.0",
    "next": "16.1.5",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.1.5",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}

---

## tezpulse/package.json
{
  "name": "tezpulse",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@types/node": "^24.10.1",
    "@types/react": "^19.2.5",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.5.0",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.46.4",
    "vite": "^7.2.4"
  }
}

---

## tui_tools-main/pyproject.toml
[build-system]
requires = ["setuptools>=78.1.1", "wheel>=0.45.0"]
build-backend = "setuptools.build_meta"

[project]
name = "sassy-wallet"
version = "1.3.0"
description = "A bold Tezos wallet with attitude - TUI wallet with personality"
readme = "README.md"
authors = [
    {name = "Sassy Wallet Contributors"}
]
license = {text = "MIT"}
classifiers = [
    "Development Status :: 4 - Beta",
    "Environment :: Console",
    "Intended Audience :: End Users/Desktop",
    "License :: OSI Approved :: MIT License",
    "Operating System :: OS Independent",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3.10",
    "Programming Language :: Python :: 3.11",
    "Programming Language :: Python :: 3.12",
    "Topic :: Office/Business :: Financial",
    "Topic :: Security :: Cryptography",
]
keywords = ["tezos", "wallet", "cryptocurrency", "tui", "cli", "blockchain"]
requires-python = ">=3.10"
dependencies = [
    "textual==7.5.0",
    "pytezos==3.17.0",
    "cryptography==46.0.4",
    "base58==2.1.1",
    "requests==2.32.5",
    "urllib3==2.6.3",
    "mnemonic==0.21",
    "bip_utils==2.10.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0.0",
    "pytest-cov>=4.0.0",
    "ruff>=0.9.0",
    "ty>=0.0.1",
    "bandit>=1.7.0",
    "pip-audit>=2.7.0",
]

[project.urls]
Homepage = "https://github.com/BakingLiberteZ/tui-tezos-wallet"
Repository = "https://github.com/BakingLiberteZ/tui-tezos-wallet"
Issues = "https://github.com/BakingLiberteZ/tui-tezos-wallet/issues"
Changelog = "https://github.com/BakingLiberteZ/tui-tezos-wallet/blob/main/CHANGELOG.md"

[project.scripts]
sassy-wallet = "sassy_wallet.__main__:main"

[tool.setuptools]
packages = ["sassy_wallet", "sassy_wallet.ui", "sassy_wallet.core", "sassy_wallet.messages"]

[tool.setuptools.package-data]
sassy_wallet = ["assets/*"]

[tool.ruff]
line-length = 100
target-version = "py310"

[tool.pytest.ini_options]
markers = [
    "smoke_pilot: interactive Textual Pilot smoke test (optional)",
]

[tool.ty.analysis]
allowed-unresolved-imports = ["pytest", "setuptools"]

[dependency-groups]
dev = [
    "ty>=0.0.15",
]

---

## vlm-video-archivist/pyproject.toml
[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "vlm-video-archivist"
version = "0.1.0"
description = "Model-first local video ingest, timeline labeling, clip extraction, and relic archiving"
requires-python = ">=3.11"
dependencies = [
  "httpx>=0.27.0",
  "Pillow>=10.0.0",
  "openai-whisper>=20250625",
]

[project.optional-dependencies]
cutouts = [
  "rembg>=2.0.60",
]

[project.scripts]
vlm-video-archivist = "vlm_video_archivist.cli:main"

[tool.setuptools.packages.find]
where = ["src"]

---

## wallet-constellations/package.json
{
  "name": "wallet-constellations",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node scripts/dev.mjs",
    "dev:stack": "concurrently -k -n server,client -c cyan,magenta \"npm:dev:server\" \"npm:dev:client\"",
    "dev:client": "vite --host 127.0.0.1 --open",
    "dev:server": "tsx watch server/index.ts",
    "build": "tsc -b && vite build",
    "check": "tsc -b",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "cors": "^2.8.6",
    "d3-force": "^3.0.0",
    "express": "^5.2.1",
    "p5": "^2.2.2",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "three": "^0.183.2"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.4",
    "@types/cors": "^2.8.19",
    "@types/d3-force": "^3.0.10",
    "@types/express": "^5.0.6",
    "@types/node": "^24.12.0",
    "@types/p5": "^1.7.7",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@types/three": "^0.183.1",
    "@vitejs/plugin-react": "^6.0.0",
    "concurrently": "^9.2.1",
    "eslint": "^9.39.4",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "^17.4.0",
    "tsx": "^4.21.0",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.56.1",
    "vite": "^8.0.0"
  }
}

---

## web3 simulator/nft-pipeline/package.json
{
  "name": "tezos-nft-market-pressure",
  "version": "1.0.0",
  "private": null,
  "type": null,
  "scripts": {
    "build": "tsc",
    "tzkt:cheatsheet": "node tools/gen-tzkt-cheatsheet.mjs",
    "sync": "node dist/index.js sync",
    "sync-xtz": "node dist/index.js sync-xtz",
    "sync-all": "node dist/index.js sync-all",
    "sync-week": "node dist/index.js sync-week",
    "analyze": "node dist/index.js analyze",
    "full": "node dist/index.js full",
    "discover": "node dist/index.js discover",
    "resolve": "node dist/index.js resolve",
    "classify": "node dist/index.js classify",
    "network": "node dist/index.js network",
    "status": "node dist/index.js status",
    "start": "node dist/index.js full",
    "dev": "node dist/server.js",
    "serve": "node dist/server.js",
    "dev:sync": "ts-node src/index.ts sync",
    "dev:analyze": "ts-node src/index.ts analyze",
    "dev:sync-xtz": "ts-node src/index.ts sync-xtz"
  },
  "dependencies": {
    "@tzkt/sdk-api": "^2.2.1",
    "cors": "^2.8.6",
    "express": "^5.2.1",
    "p-limit": "^3.1.0",
    "papaparse": "^5.4.1",
    "sql.js": "^1.10.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.6",
    "@types/node": "^20.10.0",
    "@types/papaparse": "^5.3.14",
    "@types/sql.js": "^1.4.9",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.0"
  }
}

---

## web3 simulator/package.json
{
  "name": "tezos-blockchain-simulator",
  "version": "1.0.0",
  "private": true,
  "type": null,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "recharts": "^2.10.0",
    "lucide-react": "^0.294.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.3.0",
    "tailwindcss": "^3.3.6",
    "postcss": "^8.4.32",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.55.0",
    "eslint-config-next": "^14.0.0"
  }
}

---

