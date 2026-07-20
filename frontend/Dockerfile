# Stage 1 — Install dependencies & build the React app
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Socket.io client connects via nginx reverse-proxy to backend
ENV VITE_API_URL=http://localhost

RUN npm run build

# Stage 2 — Serve static files with Nginx
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
