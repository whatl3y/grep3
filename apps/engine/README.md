# @grep3/engine

Execute any code you want that can be built into a docker container: Powered by x402, web3, git, and docker

## Requirements

1. [Node.js](https://nodejs.org/en/), ideally current LTS. Do yourself a favor and manage your Node.js versions with [nvm](https://github.com/nvm-sh/nvm)
2. [Docker](https://docs.docker.com/engine/install/) and [Docker Compose](https://docs.docker.com/compose/)

## Usage

To execute your code remotely through grep3, you will perform the following steps:

1. `git push` your repo to a web3-compose endpoint
2. Make an API request to execute the pushed repo
   - This is paywalled through x402. You will pay $1 per execution

## Install

```sh
$ git clone https://github.com/whatl3y/grep3
$ cd grep3
$ npm install
$ docker compose up
```

## API

### Health Check

**GET** `/status`

Check if the server is running.

```sh
curl -X GET https://api.grep3.com/status
```

### Repository Endpoints

**GET** `/repos/:address/all`

Get all repositories for a given Ethereum address.

```sh
curl -X GET https://api.grep3.com/repos/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb/all
```

**GET** `/repos/:id/get`

Get a specific repository by its ID.

```sh
curl -X GET https://api.grep3.com/repos/1/get
```

**ALL** `/repos/:id/execute`

Execute a repository (accepts any HTTP method). Queues the repository for execution and returns an execution record.

```sh
curl -X POST https://api.grep3.com/repos/1/execute
```

### Execution Endpoints

**GET** `/executions/:repoId/all`

Get all executions for a specific repository ID.

```sh
curl -X GET https://api.grep3.com/executions/1/all
```

**GET** `/executions/:id/get`

Get a specific execution record by its ID.

```sh
curl -X GET https://api.grep3.com/executions/1/get
```

**GET** `/executions/:id/stdout`

Stream the stdout output of a specific execution from S3.

```sh
curl -X GET https://api.grep3.com/executions/1/stdout
```

### Git Endpoint

`/:username`

Git server endpoint for pushing and pulling repositories. The username should be an Ethereum address.

```sh
# Add remote
git remote add web3 https://api.grep3.com/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb/my-repo

# Push code
git push web3 main

# Clone repository
git clone https://api.grep3.com/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb/my-repo
```
