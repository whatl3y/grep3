import { Request, Response } from "express";
import { IRoute } from "./index";
import {
  checkDepositNote,
  generateDepositNote,
  depositToTornado,
  withdrawFromTornado,
  executeWithdrawalWithProof,
  getAvailableDepositAmounts,
  getSupportedCurrencies,
  isValidDepositNote,
} from "../libs/TornadoOperations";
import { getWeb3Instance } from "../libs/Web3Initializer";
import config from "../config";
import log from "../logger";

/**
 * Helper to get Web3 instance for network
 */
function getWeb3(networkId?: number) {
  return getWeb3Instance(networkId);
}

/**
 * POST /note/generate
 * Generate a new deposit note
 * Body: { currency: string, amount: string, networkId?: number }
 */
export const generateNote: IRoute = {
  method: "post",
  path: "/note/generate",
  async handler(req: Request, res: Response) {
    try {
      const { currency, amount, networkId } = req.body;

      if (!currency || !amount) {
        return res.status(400).json({
          error: "Missing required fields: currency, amount",
        });
      }

      const web3 = getWeb3(networkId);
      const result = await generateDepositNote(web3, currency, amount);

      res.json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      log.error("Error generating deposit note", err);
      res.status(500).json({
        error: err.message || "Failed to generate deposit note",
      });
    }
  },
};

/**
 * POST /note/check
 * Check the status of a deposit note
 * Body: { depositNote: string, networkId?: number }
 */
export const checkNote: IRoute = {
  method: "post",
  path: "/note/check",
  async handler(req: Request, res: Response) {
    try {
      const { depositNote, networkId } = req.body;

      if (!depositNote) {
        return res.status(400).json({
          error: "Missing required field: depositNote",
        });
      }

      if (!isValidDepositNote(depositNote)) {
        return res.status(400).json({
          error: "Invalid deposit note format",
        });
      }

      const web3 = getWeb3(networkId);
      const result = await checkDepositNote(web3, depositNote);

      res.json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      log.error("Error checking deposit note", err);
      res.status(500).json({
        error: err.message || "Failed to check deposit note",
      });
    }
  },
};

// /**
//  * POST /deposit
//  * Deposit funds into Tornado Cash
//  * Body: { currency: string, amount: string, userPrivateKey: string, networkId?: number }
//  */
// export const deposit: IRoute = {
//   method: "post",
//   path: "/deposit",
//   async handler(req: Request, res: Response) {
//     try {
//       const { currency, amount, userPrivateKey, networkId } = req.body;

//       if (!currency || !amount || !userPrivateKey) {
//         return res.status(400).json({
//           error: "Missing required fields: currency, amount, userPrivateKey",
//         });
//       }

//       const web3 = getWeb3(networkId);
//       const result = await depositToTornado(
//         web3,
//         currency,
//         amount,
//         userPrivateKey
//       );

//       res.json({
//         success: true,
//         data: result,
//       });
//     } catch (err: any) {
//       log.error("Error depositing to Tornado", err);
//       res.status(500).json({
//         error: err.message || "Failed to deposit to Tornado Cash",
//       });
//     }
//   },
// };

/**
 * POST /withdraw
 * Withdraw funds from Tornado Cash
 * Body: {
 *   depositNote: string,
 *   destinationAddress: string,
 *   networkId?: number
 * }
 */
export const withdraw: IRoute = {
  method: "post",
  path: "/withdraw",
  async handler(req: Request, res: Response) {
    try {
      const { depositNote, destinationAddress, networkId } = req.body;

      if (!depositNote || !destinationAddress) {
        return res.status(400).json({
          error: "Missing required fields: depositNote, destinationAddress",
        });
      }

      if (!isValidDepositNote(depositNote)) {
        return res.status(400).json({
          error: "Invalid deposit note format",
        });
      }

      const web3 = getWeb3(networkId);

      if (!web3.utils.isAddress(destinationAddress)) {
        return res.status(400).json({
          error: "Invalid destination address",
        });
      }

      const result = await withdrawFromTornado(
        web3,
        depositNote,
        destinationAddress,
        config.withdrawalPkey,
        config.relayAddress,
        "0" // TODO: put percentage here
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      log.error("Error withdrawing from Tornado", err);
      res.status(500).json({
        error: err.message || "Failed to withdraw from Tornado Cash",
      });
    }
  },
};

/**
 * POST /withdraw/execute
 * Execute a withdrawal with pre-generated proof and args
 * Body: {
 *   tornadoInstanceAddress: string,
 *   proof: string,
 *   args: any[] (6-element array: [root, nullifierHash, recipient, relayer, fee, refund]),
 *   networkId?: number
 * }
 */
export const withdrawWithProof: IRoute = {
  method: "post",
  path: "/withdraw/execute",
  async handler(req: Request, res: Response) {
    try {
      const { tornadoInstanceAddress, proof, args, networkId } = req.body;

      if (!tornadoInstanceAddress || !proof || !args) {
        return res.status(400).json({
          error: "Missing required fields: tornadoInstanceAddress, proof, args",
        });
      }

      const web3 = getWeb3(networkId);

      if (!web3.utils.isAddress(tornadoInstanceAddress)) {
        return res.status(400).json({
          error: "Invalid tornado instance address",
        });
      }

      if (!Array.isArray(args) || args.length !== 6) {
        return res.status(400).json({
          error:
            "Invalid args format. Expected array of 6 elements: [root, nullifierHash, recipient, relayer, fee, refund]",
        });
      }

      const result = await executeWithdrawalWithProof(
        web3,
        tornadoInstanceAddress,
        proof,
        args,
        config.withdrawalPkey
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      log.error("Error executing withdrawal with proof", err);
      res.status(500).json({
        error: err.message || "Failed to execute withdrawal",
      });
    }
  },
};

/**
 * GET /currencies
 * Get supported currencies for the network
 * Query: ?networkId=1
 */
export const currencies: IRoute = {
  method: "get",
  path: "/currencies",
  async handler(req: Request, res: Response) {
    try {
      const networkId = req.query.networkId
        ? parseInt(req.query.networkId as string, 10)
        : 1;

      const web3 = getWeb3(networkId);
      const result = await getSupportedCurrencies(web3);

      res.json({
        success: true,
        data: {
          networkId,
          currencies: result,
        },
      });
    } catch (err: any) {
      log.error("Error getting supported currencies", err);
      res.status(500).json({
        error: err.message || "Failed to get supported currencies",
      });
    }
  },
};

/**
 * GET /amounts/:currency
 * Get available deposit amounts for a currency
 * Query: ?networkId=1
 */
export const amounts: IRoute = {
  method: "get",
  path: "/amounts/:currency",
  async handler(req: Request, res: Response) {
    try {
      const { currency } = req.params;
      const networkId = req.query.networkId
        ? parseInt(req.query.networkId as string, 10)
        : 1;

      if (!currency) {
        return res.status(400).json({
          error: "Missing required parameter: currency",
        });
      }

      const web3 = getWeb3(networkId);
      const result = await getAvailableDepositAmounts(web3, currency);

      res.json({
        success: true,
        data: {
          currency,
          networkId,
          amounts: result,
        },
      });
    } catch (err: any) {
      log.error("Error getting available amounts", err);
      res.status(500).json({
        error: err.message || "Failed to get available deposit amounts",
      });
    }
  },
};
