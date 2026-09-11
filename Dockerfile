# Use a lightweight Node base image
FROM node:22-alpine

# Install openssl (needed for prisma in alpine)
RUN apk add --no-cache openssl

# Create working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (including dev, since prisma needs it for generate)
RUN npm ci

# Copy remaining files
COPY . .

# Generate Prisma client at build time
RUN npx prisma generate

# Remove dev dependencies after generating prisma (optional, keeps image small)
RUN npm prune --production

# Expose the app port
EXPOSE 3002

# Run migrations then start app with pm2
CMD sh -c "npx prisma migrate deploy && node ./node_modules/pm2/bin/pm2-runtime server.js"