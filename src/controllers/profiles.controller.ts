import { Request, Response } from 'express';
import { supabase } from '../utils/supabase';

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
       res.status(401).json({
        success: false,
        message: 'Unauthorized: Please login to update your profile'
      });
    }

    const { first_name, last_name, avatar_url } = req.body;


    if (!first_name) {
      res.status(400).json({
        success: false,
        message: 'First name is required'
      });
    }


    const { data, error } = await supabase
      .from('profiles')
      .update({
        first_name,
        last_name, 
        avatar_url,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
       res.status(500).json({
        success: false,
        message: error.message
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data
    });
  } catch (error: any) {
     res.status(500).json({
      success: false,
      message: error.message || 'Error updating profile'
    });
  }
};

export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;


    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
       res.status(404).json({
        success: false,
        message: 'User profile not found'
      });
    }

   res.status(200).json({
      success: true,
      user: data
    });
  } catch (error: any) {
     res.status(500).json({
      success: false,
      message: error.message || 'Error fetching user profile'
    });
  }
};