# TMI app (site + /api handlers) for Coolify / any container host.
FROM node:20-slim

WORKDIR /app

# Root deps (express + the API runtime: firebase, resend, twilio, qstash, supabase)
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Agent deps (api routes dynamically import ../agents/gtm/* and the audit renderer)
COPY agents/package*.json ./agents/
RUN cd agents && npm install --omit=dev --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
