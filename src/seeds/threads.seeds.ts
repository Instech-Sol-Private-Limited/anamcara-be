import { supabase } from '../app';

export async function ensureThreadsTableExists() {
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

  const { error } = await supabase.rpc('execute_sql', { sql });

  if (error) {
    console.error('❌ Failed to create "threads" table:', error.message);
  } else {
    console.log('✅ "threads" table exists or was created successfully.');
  }
}
