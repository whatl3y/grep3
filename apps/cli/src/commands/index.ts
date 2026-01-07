import { Command } from "commander";
import createMerkletreeNamespace from "./merkletree";
import createReposNamespace from "./repos";
import createExecutionsNamespace from "./executions";
import createTornadoNamespace from "./tornado";

export default function registerCommands(program: Command): void {
  // Register merkletree namespace
  program.addCommand(createMerkletreeNamespace());

  // Register repos namespace
  program.addCommand(createReposNamespace());

  // Register executions namespace
  program.addCommand(createExecutionsNamespace());

  // Register tornado namespace
  program.addCommand(createTornadoNamespace());
}
