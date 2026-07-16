FROM node:20-alpine

WORKDIR /app

# Install deps first for better layer caching. tsx + TypeScript live in
# devDependencies and are needed at runtime (we run .ts directly via tsx).
COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

# Default to the API; the worker service overrides this with `npm run worker`.
CMD ["npm", "start"]
