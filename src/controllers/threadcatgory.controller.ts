import { Request, Response } from 'express';
import { supabase } from '../app';

interface Category {
    id?: string;
    category_name: string;
    category_slug: string;
    is_active?: boolean;
}

const formatSlug = (slug: string): string => slug.trim().toLowerCase().replace(/[\s_]+/g, '-');

// get all categories
const getAllCategories = async (_req: Request, res: Response): Promise<any> => {
    const { data, error } = await supabase
        .from('threadcategory')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        return res.status(500).json({ error: 'Error fetching categories' });
    }

    return res.status(200).json(data);
};

// Add a new category
const addNewCategory = async (
    req: Request<{}, {}, Category> & { user?: { role?: string } },
    res: Response
): Promise<any> => {
    if (req.user?.role !== 'superadmin')
        return res.status(403).json({ error: 'Access denied!' });

    const { category_name, category_slug } = req.body;
    if (!category_name || !category_slug)
        return res.status(400).json({ error: 'Category name and slug are required!' });

    const formattedSlug = formatSlug(category_slug);

    const { data: existing, error: fetchError } = await supabase
        .from('threadcategory')
        .select('id')
        .eq('category_slug', formattedSlug)
        .maybeSingle();

    if (fetchError) return res.status(500).json({ error: fetchError.message });
    if (existing)
        return res.status(409).json({ error: 'Slug already exists. Use a different one.' });

    const { data, error } = await supabase
        .from('threadcategory')
        .insert([{ category_name, category_slug: formattedSlug }])
        .select();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({
        message: 'Category added successfully!',
    });
};

// Update a category
const updateCategory = async (
    req: Request<{ id: string }, {}, Category> & { user?: { role?: string } },
    res: Response
): Promise<any> => {
    const { id } = req.params;

    if (req.user?.role !== 'superadmin')
        return res.status(403).json({ error: 'Access denied!' });

    const { category_name, category_slug } = req.body;
    if (!category_name || !category_slug)
        return res.status(400).json({ error: 'Category name and slug are required!' });

    const formattedSlug = formatSlug(category_slug);

    const { data: existingCategory, error: idCheckError } = await supabase
        .from('threadcategory')
        .select('id')
        .eq('id', id)
        .maybeSingle();

    if (idCheckError) return res.status(500).json({ error: idCheckError.message });
    if (!existingCategory)
        return res.status(404).json({ error: 'Category with this ID does not exist.' });

    const { data: existing, error: fetchError } = await supabase
        .from('threadcategory')
        .select('id')
        .eq('category_slug', formattedSlug)
        .neq('id', id)
        .maybeSingle();

    if (fetchError) return res.status(500).json({ error: fetchError.message });
    if (existing)
        return res.status(409).json({ error: 'Slug already exists. Use a different one.' });

    const { data, error } = await supabase
        .from('threadcategory')
        .update({ category_name, category_slug: formattedSlug })
        .eq('id', id)
        .select();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
        message: 'Category updated successfully!',
    });
};

// Delete a category
const removeCategory = async (
    req: Request<{ id: string }> & { user?: { role?: string } },
    res: Response
): Promise<any> => {
    const { id } = req.params;

    if (req.user?.role !== 'superadmin')
        return res.status(403).json({ error: 'Access denied!' });

    const { error } = await supabase.from('threadcategory').delete().eq('id', id);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ message: 'Category removed successfully!' });
};

// Toggle category activation
const toggleCategoryStatus = async (
    req: Request<{ id: string }, {}, { is_active?: boolean }> & { user?: { role?: string } },
    res: Response
): Promise<any> => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        if (!id) {
            return res.status(400).json({ error: 'Category ID is required in params.' });
        }
        if (is_active === undefined || typeof is_active !== 'boolean') {
            return res.status(400).json({
                error: '`is_active` is required in the body and must be a boolean.',
            });
        }

        if (req.user?.role !== 'superadmin') {
            return res.status(403).json({ error: 'Access denied! Only superadmin can change category status.' });
        }

        const { data: existingCategory, error: fetchError } = await supabase
            .from('threadcategory')
            .select('id')
            .eq('id', id)
            .single();

        if (fetchError || !existingCategory) {
            return res.status(404).json({ error: 'Category not found. Cannot update status.' });
        }

        const { data, error: updateError } = await supabase
            .from('threadcategory')
            .update({ is_active })
            .eq('id', id)
            .select();

        if (updateError) {
            return res.status(500).json({ error: updateError.message });
        }

        return res.status(200).json({
            message: `Category has been ${is_active ? 'activated' : 'deactivated'} successfully.`,
        });

    } catch (err: any) {
        return res.status(500).json({
            error: 'Internal server error while toggling category status.',
            message: err.message || 'Unexpected failure.',
        });
    }
};

export {
    getAllCategories,
    addNewCategory,
    updateCategory,
    removeCategory,
    toggleCategoryStatus,
};
