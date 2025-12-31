import { Command } from "commander";
import createMerkletreeNamespace from "./merkletree";

export default function registerCommands(program: Command): void {
  // Register merkletree namespace
  program.addCommand(createMerkletreeNamespace());
}
