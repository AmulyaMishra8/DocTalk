FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build the production bundle; we serve it with `vite preview` (which also
# proxies /ask, /pdfs, /hello to the API — see vite.config.ts).
RUN npm run build

EXPOSE 5173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
