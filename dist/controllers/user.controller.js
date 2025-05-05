"use strict";
// // backend/src/controllers/user.controller.ts
// import { Request, Response } from 'express';
// import { supabase } from '../utils/supabase';
// // @desc    Get all users (admin only)
// // @route   GET /api/users
// // @access  Private/Superadmin
// export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { data: users, error } = await supabase
//       .from('profiles')
//       .select('*')
//       .order('created_at', { ascending: false });
//     if (error) throw error;
//     res.status(200).json({
//       success: true,
//       data: users
//     });
//   } catch (error) {
//     console.error('Error fetching users:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message
//     });
//   }
// };
// // @desc    Get user by ID
// // @route   GET /api/users/:id
// // @access  Private
// export const getUserById = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { id } = req.params;
//     const currentUser = req.user;
//     // Users can only view their own profile unless they're superadmin
//     if (id !== currentUser?.id && currentUser?.role !== 'superadmin') {
//       res.status(403).json({
//         success: false,
//         message: 'Access denied'
//       });
//       return;
//     }
//     const { data: user, error } = await supabase
//       .from('profiles')
//       .select('*')
//       .eq('id', id)
//       .single();
//     if (error || !user) {
//       res.status(404).json({
//         success: false,
//         message: 'User not found'
//       });
//       return;
//     }
//     res.status(200).json({
//       success: true,
//       data: user
//     });
//   } catch (error) {
//     console.error('Error fetching user:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message
//     });
//   }
// };
// // @desc    Update user
// // @route   PUT /api/users/:id
// // @access  Private
// export const updateUser = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { id } = req.params;
//     const { name, bio, avatar_url } = req.body;
//     const currentUser = req.user;
//     // Users can only update their own profile unless they're superadmin
//     if (id !== currentUser?.id && currentUser?.role !== 'superadmin') {
//       res.status(403).json({
//         success: false,
//         message: 'Access denied'
//       });
//       return;
//     }
//     // Check if user exists
//     const { data: existingUser, error: checkError } = await supabase
//       .from('profiles')
//       .select('*')
//       .eq('id', id)
//       .single();
//     if (checkError || !existingUser) {
//       res.status(404).json({
//         success: false,
//         message: 'User not found'
//       });
//       return;
//     }
//     // Update the user profile
//     const updates = {
//       ...(name && { name }),
//       ...(bio && { bio }),
//       ...(avatar_url && { avatar_url }),
//       updated_at: new Date().toISOString()
//     };
//     const { data, error } = await supabase
//       .from('profiles')
//       .update(updates)
//       .eq('id', id)
//       .select()
//       .single();
//     if (error) throw error;
//     res.status(200).json({
//       success: true,
//       data
//     });
//   } catch (error) {
//     console.error('Error updating user:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message
//     });
//   }
// };
// // @desc    Delete user
// // @route   DELETE /api/users/:id
// // @access  Private/Superadmin
// export const deleteUser = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { id } = req.params;
//     // First delete all related data (this is safer than relying on cascade deletes)
//     // Delete user's conversations and messages
//     const { data: conversations, error: convError } = await supabase
//       .from('conversations')
//       .select('id')
//       .eq('user_id', id);
//     if (convError) throw convError;
//     // Delete messages from each conversation
//     if (conversations && conversations.length > 0) {
//       const conversationIds = conversations.map(conv => conv.id);
//       await supabase
//         .from('messages')
//         .delete()
//         .in('conversation_id', conversationIds);
//       // Delete the conversations
//       await supabase
//         .from('conversations')
//         .delete()
//         .eq('user_id', id);
//     }
//     // Delete the user profile
//     const { error: profileError } = await supabase
//       .from('profiles')
//       .delete()
//       .eq('id', id);
//     if (profileError) throw profileError;
//     // Now delete the user from auth
//     const { error: authError } = await supabase.auth.admin.deleteUser(id);
//     if (authError) throw authError;
//     res.status(200).json({
//       success: true,
//       message: 'User deleted successfully'
//     });
//   } catch (error) {
//     console.error('Error deleting user:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message
//     });
//   }
// };
