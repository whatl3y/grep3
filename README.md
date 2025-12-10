# web3-compute

Execute any code you want that can be built into a docker container: Powered by x402, web3, git, and docker

## Requirements

1. [Node.js](https://nodejs.org/en/), ideally current LTS. Do yourself a favor and manage your Node.js versions with [nvm](https://github.com/nvm-sh/nvm)
2. [Docker](https://docs.docker.com/engine/install/) and [Docker Compose](https://docs.docker.com/compose/)

## Usage

To execute your code remotely through web3-compute, you will perform the following steps:

1. `git push` your repo to a web3-compose endpoint
2. Make an API request to execute the pushed repo
   - This is paywalled through x402. You will pay $1 per execution

## Install

```sh
$ git clone https://github.com/whatl3y/web3-compute
$ cd web3-compute
$ npm install
$ docker compose up
```
