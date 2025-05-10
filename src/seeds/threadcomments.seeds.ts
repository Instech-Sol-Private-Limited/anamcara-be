import { supabase } from '../app';

export async function ensureThreadsCommentsTableExists() {
    const sql = `
    create table threadcomments (
    id uuid primary key default gen_random_uuid(),
    thread_id uuid not null references threads(id) on delete cascade,
    imgs text[] default '{}',
    content text not null,
    has_subcomment boolean default false,
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
