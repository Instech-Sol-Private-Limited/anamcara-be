

import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../config/generateTokens"; 

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export const authenticateUser = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Response | void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization token missing or malformed." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }

    req.user = decoded; 
    next();
  } catch (error: any) {
    console.error("Authentication error:", error);
    return res.status(500).json({ error: "Failed to authenticate user." });
  }
};