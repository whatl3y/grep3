import { Router } from "express";
import { IFactoryOptions } from "@grep3/core";
import GenerateRoutes from "./generate";
import StatusRoutes from "./status";
import ProofRoutes from "./proof";

export default function routes(opts: IFactoryOptions): { generate: Router; status: Router; proof: Router } {
  return {
    generate: GenerateRoutes(opts),
    status: StatusRoutes(opts),
    proof: ProofRoutes(opts),
  };
}
