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
      linkedin_url,
      bio,
      country,
      city,
      phone,
      website_url,
      birth_date,
      gender,
      username,
      profile_type,
      cover_url,
      title,
      company,
      expertise,
      years_experience,
      visibility
    } = req.body;

    if (!first_name) {
      return res.status(400).json({
        success: false,
        message: 'First name is required'
      });
    }

    // Validate username if provided
    if (username) {
      if (username.length < 3 || username.length > 30) {
        return res.status(400).json({
          success: false,
          message: 'Username must be between 3 and 30 characters'
        });
      }
      
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({
          success: false,
          message: 'Username can only contain letters, numbers, and underscores'
        });
      }

      // Check if username is already taken by another user
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .neq('id', userId)
        .single();

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Username is already taken'
        });
      }
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
    if (website_url) validateUrl(website_url, 'Website');

    const updateData: any = {
      first_name,
      last_name, 
      avatar_url,
      facebook_url: facebook_url || null,
      twitter_url: twitter_url || null,
      instagram_url: instagram_url || null,
      linkedin_url: linkedin_url || null,
      bio: bio || null,
      country: country || null,
      city: city || null,
      phone: phone || null,
      website_url: website_url || null,
      birth_date: birth_date || null,
      gender: gender || null,
      updated_at: new Date().toISOString()
    };

    // Add new fields if provided
    if (username) updateData.username = username;
    if (profile_type) updateData.profile_type = profile_type;
    if (cover_url) updateData.cover_url = cover_url;
    if (title) updateData.title = title;
    if (company) updateData.company = company;
    if (expertise) updateData.expertise = expertise;
    if (years_experience !== undefined) updateData.years_experience = years_experience;
    if (visibility) updateData.visibility = visibility;

    const { data, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select(`
        id,
        email,
        first_name,
        last_name,
        avatar_url,
        cover_url,
        facebook_url,
        twitter_url,
        instagram_url,
        linkedin_url,
        bio,
        country,
        city,
        phone,
        website_url,
        birth_date,
        gender,
        created_at,
        updated_at,
        is_active,
        is_deleted,
        username,
        profile_type,
        title,
        company,
        expertise,
        years_experience,
        user_level,
        approved_status,
        verification_level,
        followers,
        following,
        visibility,
        friends,
        referral_code,
        is_asian
      `)
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
      .select(`
        id,
        email,
        first_name,
        last_name,
        avatar_url,
        cover_url,
        facebook_url,
        twitter_url,
        instagram_url,
        linkedin_url,
        bio,
        country,
        city,
        phone,
        website_url,
        birth_date,
        gender,
        created_at,
        updated_at,
        is_active,
        is_deleted,
        username,
        profile_type,
        title,
        company,
        expertise,
        years_experience,
        user_level,
        approved_status,
        verification_level,
        verification_submitted_at,
        verification_reviewed_at,
        followers,
        following,
        visibility,
        friends,
        referral_code,
        is_asian,
        two_factor_enabled,
        two_factor_setup_at
      `)
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({
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

export const getAboutInfo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        first_name,
        last_name,
        email,
        bio,
        country,
        city,
        phone,
        website_url,
        birth_date,
        gender,
        facebook_url,
        twitter_url,
        instagram_url,
        linkedin_url,
        created_at,
        avatar_url,
        cover_url,
        username,
        profile_type,
        title,
        company,
        expertise,
        years_experience,
        user_level,
        followers,
        following,
        friends,
        visibility
      `)
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found'
      });
    }

    // Format the about info
    const aboutInfo = {
      fullName: `${data.first_name} ${data.last_name || ''}`.trim(),
      username: data.username,
      email: data.email,
      bio: data.bio,
      country: data.country,
      city: data.city,
      location: data.city && data.country ? `${data.city}, ${data.country}` : data.city || data.country || null,
      phone: data.phone,
      website: data.website_url,
      birthDate: data.birth_date,
      gender: data.gender,
      socialMedia: {
        facebook: data.facebook_url,
        twitter: data.twitter_url,
        instagram: data.instagram_url,
        linkedin: data.linkedin_url
      },
      joinDate: data.created_at,
      avatar_url: data.avatar_url || null,
      cover_url: data.cover_url || null,
      profileType: data.profile_type,
      title: data.title,
      company: data.company,
      expertise: data.expertise,
      yearsExperience: data.years_experience,
      userLevel: data.user_level,
      followers: data.followers || 0,
      following: data.following || 0,
      friends: data.friends || 0,
      visibility: data.visibility || 'public'
    };

    res.status(200).json({
      success: true,
      data: aboutInfo
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching about information'
    });
  }
};