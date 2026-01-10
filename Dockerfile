# Use Node.js 20 slim image
FROM node:20-slim

# Set the working directory
WORKDIR /usr/src/app

# Copy package files first (for Docker caching)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy the rest of the application
COPY . .

# Ensure public folder has correct permissions
RUN chown -R node:node /usr/src/app

# Fly.io uses PORT env variable
ENV PORT=8080
EXPOSE 8080

# Run as non-root user for security
USER node

# Start the server
CMD [ "node", "server.js" ]
