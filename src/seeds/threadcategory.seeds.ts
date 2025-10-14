import { supabase } from '../app';

export async function ensureThreadCategoryTableExists() {
  const sql = `
    CREATE TABLE IF NOT EXISTS public.threadcategory (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      category_name text NOT NULL,
      category_slug text UNIQUE NOT NULL,
      created_at timestamp with time zone DEFAULT now()
    );
  `;

  const { error } = await supabase.rpc('execute_sql', { sql });

  if (error) {
    console.error('Failed to create "threadcategory" table:', error.message);
  }
}
