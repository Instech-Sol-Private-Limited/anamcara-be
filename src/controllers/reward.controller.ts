// src/api/reward.controller.ts
import { Request, Response } from "express";
import { awardPointsService } from "../services/reward.service";

export const awardPoints = async (req: Request, res: Response): Promise<any> => {
  const debug = req.query.debug === "true";

  try {
    const { userId, actionType, targetId } = req.body;

    if (!userId || !actionType) {
      return res
        .status(400)
        .json({ error: "userId and actionType are required" });
    }

    const result = await awardPointsService({
      userId,
      actionType,
      targetId,
      debug,
    });

    // Blocked due to rules (not server error)
    if (result.blocked) {
      return res.status(200).json(result);
    }

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (err: any) {
    console.error("Reward Controller Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
