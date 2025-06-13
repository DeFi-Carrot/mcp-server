# Build stage
FROM --platform=linux/amd64 node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Production stage
FROM --platform=linux/amd64 node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --production

# Copy built files from builder stage
COPY --from=builder /app/build ./build

# Set environment variables
ENV NODE_ENV=production

# Start the application
CMD ["node", "build/index.js"]
