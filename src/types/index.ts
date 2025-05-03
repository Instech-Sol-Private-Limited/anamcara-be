// src/types/index.ts
import * as express from 'express';


declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export interface User {
  id: string;
  email: string;
  role: string;
  name?: string;
  avatar_url?: string;
  [key: string]: any;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}