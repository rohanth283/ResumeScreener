# Stage 1: Build the React Application
FROM node:20-alpine AS build

# Set work directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build Vite application for production
RUN npm run build

# Stage 2: Serve the built static files using Nginx
FROM nginx:alpine

# Copy built files from Stage 1 to Nginx default document root
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Run Nginx
CMD ["nginx", "-g", "daemon off;"]
