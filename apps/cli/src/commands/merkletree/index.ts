import { Command } from "commander";
import generateRaw from "./generate-raw";
import generateFile from "./generate-file";
import status from "./status";
import proof from "./proof";

export default function createMerkletreeNamespace(): Command {
  const merkletree = new Command("merkletree");
  merkletree.description("Commands for interacting with the merkletree API");

  merkletree
    .command("generate-raw <data>")
    .description(generateRaw.description)
    .action(generateRaw.action);

  merkletree
    .command("generate-file <file-path>")
    .description(generateFile.description)
    .action(generateFile.action);

  merkletree
    .command("status <uuid>")
    .description(status.description)
    .action(status.action);

  merkletree
    .command("proof <root-hash> <unique-id>")
    .description(proof.description)
    .action(proof.action);

  return merkletree;
}
