"use strict";
// // backend/src/controllers/profile.controller.ts
// import { Request, Response } from 'express';
// import { supabase } from '../utils/supabase';
// // @desc    Get user profile
// // @route   GET /api/auth/profile
// // @access  Private
// export const getUserProfile = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const user = req.user;
//     if (!user) {
//       res.status(401).json({
//         success: false,
//         message: 'Not authenticated'
//       });
//       return;
//     }
//     res.status(200).json({
//       success: true,
//       data: user
//     });
//   } catch (error) {
//     console.error('Error getting user profile:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message
//     });
//   }
// };
// // @desc    Update user profile
// // @route   PUT /api/auth/profile
// // @access  Private
// export const updateUserProfile = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const userId = req.user?.id;
//     const { name, avatar_url, bio } = req.body;
//     if (!userId) {
//       res.status(401).json({
//         success: false,
//         message: 'Not authenticated'
//       });
//       return;
//     }
//     const updates = {
//       ...(name && { name }),
//       ...(avatar_url && { avatar_url }),
//       ...(bio && { bio }),
//       updated_at: new Date().toISOString()
//     };
//     const { data, error } = await supabase
//       .from('profiles')
//       .update(updates)
//       .eq('id', userId)
//       .select()
//       .single();
//     if (error) throw error;
//     res.status(200).json({
//       success: true,
//       data
//     });
//   } catch (error) {
//     console.error('Error updating profile:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message
//     });
//   }
// };
// // @desc    Update user's role (superadmin only)
// // @route   PUT /api/auth/role
// // @access  Private/Superadmin
// export const updateUserRole = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { userId, role } = req.body;
//     if (!userId || !role) {
//       res.status(400).json({
//         success: false,
//         message: 'User ID and role are required'
//       });
//       return;
//     }
//     // Validate role
//     const validRoles = ['user', 'superadmin', 'guest'];
//     if (!validRoles.includes(role)) {
//       res.status(400).json({
//         success: false,
//         message: 'Invalid role'
//       });
//       return;
//     }
//     const { error } = await supabase
//       .from('profiles')
//       .update({ role })
//       .eq('id', userId);
//     if (error) throw error;
//     res.status(200).json({
//       success: true,
//       message: 'User role updated successfully'
//     });
//   } catch (error) {
//     console.error('Error updating user role:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message
//     });
//   }
// };
