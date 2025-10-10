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
exports.ensureThreadCategoryTableExists = ensureThreadCategoryTableExists;
const app_1 = require("../app");
function ensureThreadCategoryTableExists() {
    return __awaiter(this, void 0, void 0, function* () {
        const sql = `
    CREATE TABLE IF NOT EXISTS public.threadcategory (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      category_name text NOT NULL,
      category_slug text UNIQUE NOT NULL,
      created_at timestamp with time zone DEFAULT now()
    );
  `;
        const { error } = yield app_1.supabase.rpc('execute_sql', { sql });
        if (error) {
            console.error('Failed to create "threadcategory" table:', error.message);
        }
    });
}
