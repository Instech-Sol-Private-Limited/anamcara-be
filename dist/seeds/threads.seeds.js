"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureThreadsTableExists = ensureThreadsTableExists;
const app_1 = require("../app");
function ensureThreadsTableExists() {
    return __awaiter(this, void 0, void 0, function* () {
        const sql = `
    CREATE TABLE IF NOT EXISTS public.threads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      description text NOT NULL,
      imgs text[] DEFAULT '{}',
      category_name text NOT NULL,
      category_id uuid NOT NULL REFERENCES public.threadcategory(id) ON DELETE CASCADE,
      author_name text NOT NULL,
      author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      publish_date timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now(),
      total_likes integer DEFAULT 0,
      total_dislikes integer DEFAULT 0,
      keywords text[] DEFAULT '{}'
    );
  `;
        const { error } = yield app_1.supabase.rpc('execute_sql', { sql });
        if (error) {
            console.error('❌ Failed to create "threads" table:', error.message);
        }
        else {
            console.log('✅ "threads" table exists or was created successfully.');
        }
    });
}
