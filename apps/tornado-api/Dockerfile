FROM node:22

LABEL AUTHOR="Lance Whatley"

# specify working directory
WORKDIR /usr/tornado-api

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

ADD https://github.com/ufoscout/docker-compose-wait/releases/download/2.2.1/wait /wait
RUN chmod +x /wait

# Start web server
CMD /wait && npm start
