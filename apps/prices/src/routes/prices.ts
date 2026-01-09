import { Request, Response } from "express";
import priceService from "../libs/PriceService";
import { IRoute } from "./index";

export const getPrice: IRoute = {
  method: "get",
  path: "/:token",
  handler: async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      if (!token || token.trim() === "") {
        res.status(400).json({
          success: false,
          error: "Token parameter is required",
        });
        return;
      }

      const result = await priceService.getPrice(token.trim());

      if (!result.success) {
        res.status(404).json(result);
        return;
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || "Internal server error",
      });
    }
  },
};
