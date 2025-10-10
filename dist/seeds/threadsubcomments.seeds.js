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
exports.ensureThreadsCommentsTableExists = ensureThreadsCommentsTableExists;
const app_1 = require("../app");
function ensureThreadsCommentsTableExists() {
    return __awaiter(this, void 0, void 0, function* () {
        const sql = `
    create table threadsubcomments (
    id uuid primary key default gen_random_uuid(),
    comment_id uuid not null references comments(id) on delete cascade,
    content text not null,
    total_likes integer default 0,
    total_dislikes integer default 0,
    "user_name" text not null,
    user_id uuid not null references auth.users(id),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
    );
  `;
        const { error } = yield app_1.supabase.rpc('execute_sql', { sql });
        if (error) {
            console.error('❌ Failed to create "threads" table:', error.message);
        }
    });
}
