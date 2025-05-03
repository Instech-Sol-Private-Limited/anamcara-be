// src/types/express/index.d.ts
import { User } from '../../types/index'; 

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        [key: string]: any;
      };
    }
  }
}