#!/usr/bin/env node

import dotenv from "dotenv";
dotenv.config();

import { program } from "commander";
import registerCommands from "./commands";

(async function grep3Cli() {
  try {
    program
      .name("grep3")
      .description("CLI for interacting with grep3 APIs")
      .version(require("../package.json").version, "-v, --version");

    // Register all commands
    registerCommands(program);

    // Handle invalid commands
    program.on("command:*", function invalidCommand() {
      console.error(
        "Invalid command: %s\nSee --help for a list of available commands.",
        program.args.join(" ")
      );
      process.exit(1);
    });

    program.parse(process.argv);

    // Show help if no command provided
    if (program.args.length === 0) {
      program.outputHelp();
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
