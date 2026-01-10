#!/usr/bin/env node

import dotenv from 'dotenv';
import { Command } from 'commander';
import { registerCommands } from './commands';

dotenv.config();

const program = new Command();

program
  .name('sports')
  .description('Real-time sports scoreboard CLI using ESPN API')
  .version('0.0.1');

registerCommands(program);

program.parse(process.argv);
