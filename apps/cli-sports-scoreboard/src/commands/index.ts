import { Command } from 'commander';
import { createScoresCommand } from './scores';

export function registerCommands(program: Command): void {
  program.addCommand(createScoresCommand());
}
