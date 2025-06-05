import { Request, Response } from 'express';
import { supabase } from '../app';

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Please login to update your profile'
      });
    }

    const { 
      first_name, 
      last_name, 
      avatar_url,
      facebook_url,
      twitter_url,
      instagram_url,
      linkedin_url
    } = req.body;

    if (!first_name) {
      return res.status(400).json({
        success: false,
        message: 'First name is required'
      });
    }

    // Validate social media URLs if provided
    const validateUrl = (url: string, platform: string) => {
      if (!url) return true; // Allow empty URLs
      try {
        new URL(url);
        return true;
      } catch {
        throw new Error(`Invalid ${platform} URL format`);
      }
    };

    if (facebook_url) validateUrl(facebook_url, 'Facebook');
    if (twitter_url) validateUrl(twitter_url, 'Twitter');
    if (instagram_url) validateUrl(instagram_url, 'Instagram');
    if (linkedin_url) validateUrl(linkedin_url, 'LinkedIn');

    const { data, error } = await supabase
      .from('profiles')
      .update({
        first_name,
        last_name, 
        avatar_url,
        facebook_url: facebook_url || null,
        twitter_url: twitter_url || null,
        instagram_url: instagram_url || null,
        linkedin_url: linkedin_url || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
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