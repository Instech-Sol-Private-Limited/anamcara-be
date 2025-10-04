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
exports.toggleCategoryStatus = exports.removeCategory = exports.updateCategory = exports.addNewCategory = exports.getAllCategories = void 0;
const app_1 = require("../app");
const formatSlug = (slug) => slug.trim().toLowerCase().replace(/[\s_]+/g, '-');
// get all categories
const getAllCategories = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { data, error } = yield app_1.supabase
        .from('threadcategory')
        .select('*')
        .order('created_at', { ascending: true });
    if (error) {
        return res.status(500).json({ error: 'Error fetching categories' });
    }
    return res.status(200).json(data);
});
exports.getAllCategories = getAllCategories;
// Add a new category
const addNewCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) !== 'superadmin')
        return res.status(403).json({ error: 'Access denied!' });
    const { category_name, category_slug } = req.body;
    if (!category_name || !category_slug)
        return res.status(400).json({ error: 'Category name and slug are required!' });
    const formattedSlug = formatSlug(category_slug);
    const { data: existing, error: fetchError } = yield app_1.supabase
        .from('threadcategory')
        .select('id')
        .eq('category_slug', formattedSlug)
        .maybeSingle();
    if (fetchError)
        return res.status(500).json({ error: fetchError.message });
    if (existing)
        return res.status(409).json({ error: 'Slug already exists. Use a different one.' });
    const { data, error } = yield app_1.supabase
        .from('threadcategory')
        .insert([{ category_name, category_slug: formattedSlug }])
        .select();
    if (error)
        return res.status(500).json({ error: error.message });
    return res.status(201).json({
        message: 'Category added successfully!',
    });
});
exports.addNewCategory = addNewCategory;
// Update a category
const updateCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) !== 'superadmin')
        return res.status(403).json({ error: 'Access denied!' });
    const { category_name, category_slug } = req.body;
    if (!category_name || !category_slug)
        return res.status(400).json({ error: 'Category name and slug are required!' });
    const formattedSlug = formatSlug(category_slug);
    const { data: existingCategory, error: idCheckError } = yield app_1.supabase
        .from('threadcategory')
        .select('id')
        .eq('id', id)
        .maybeSingle();
    if (idCheckError)
        return res.status(500).json({ error: idCheckError.message });
    if (!existingCategory)
        return res.status(404).json({ error: 'Category with this ID does not exist.' });
    const { data: existing, error: fetchError } = yield app_1.supabase
        .from('threadcategory')
        .select('id')
        .eq('category_slug', formattedSlug)
        .neq('id', id)
        .maybeSingle();
    if (fetchError)
        return res.status(500).json({ error: fetchError.message });
    if (existing)
        return res.status(409).json({ error: 'Slug already exists. Use a different one.' });
    const { data, error } = yield app_1.supabase
        .from('threadcategory')
        .update({ category_name, category_slug: formattedSlug })
        .eq('id', id)
        .select();
    if (error)
        return res.status(500).json({ error: error.message });
    return res.status(200).json({
        message: 'Category updated successfully!',
    });
});
exports.updateCategory = updateCategory;
// Delete a category
const removeCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) !== 'superadmin')
        return res.status(403).json({ error: 'Access denied!' });
    const { error } = yield app_1.supabase.from('threadcategory').delete().eq('id', id);
    if (error)
        return res.status(500).json({ error: error.message });
    return res.status(200).json({ message: 'Category removed successfully!' });
});
exports.removeCategory = removeCategory;
// Toggle category activation
const toggleCategoryStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
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
        if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) !== 'superadmin') {
            return res.status(403).json({ error: 'Access denied! Only superadmin can change category status.' });
        }
        const { data: existingCategory, error: fetchError } = yield app_1.supabase
            .from('threadcategory')
            .select('id')
            .eq('id', id)
            .single();
        if (fetchError || !existingCategory) {
            return res.status(404).json({ error: 'Category not found. Cannot update status.' });
        }
        const { data, error: updateError } = yield app_1.supabase
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
    }
    catch (err) {
        return res.status(500).json({
            error: 'Internal server error while toggling category status.',
            message: err.message || 'Unexpected failure.',
        });
    }
});
exports.toggleCategoryStatus = toggleCategoryStatus;
