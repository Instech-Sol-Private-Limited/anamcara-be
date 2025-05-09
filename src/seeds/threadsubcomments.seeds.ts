import { supabase } from '../app';

export async function ensureThreadsCommentsTableExists() {
    const sql = `
    create table subcomments (
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

    const { error } = await supabase.rpc('execute_sql', { sql });

    if (error) {
        console.error('❌ Failed to create "threads" table:', error.message);
    } else {
        console.log('✅ "threads" table exists or was created successfully.');
    }
}
