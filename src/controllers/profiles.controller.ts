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
      youtube_url,
      tiktok_url,
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
    if (youtube_url) validateUrl(youtube_url, 'Youtube');
    if (tiktok_url) validateUrl(tiktok_url, 'Tiktok');
    if (website_url) validateUrl(website_url, 'Website');

    const updateData: any = {
      first_name,
      last_name, 
      avatar_url,
      cover_url,
      facebook_url: facebook_url || null,
      twitter_url: twitter_url || null,
      instagram_url: instagram_url || null,
      linkedin_url: linkedin_url || null,
      youtube_url: youtube_url || null,
      tiktok_url : tiktok_url || null,
      bio: bio || null,
      country: country || null,
      city: city || null,
      phone: phone || null,
      website_url: website_url || null,
      birth_date: birth_date || null,
      gender: gender || null,
      updated_at: new Date().toISOString()
    };
    
    if (username) updateData.username = username;
    if (profile_type) updateData.profile_type = profile_type;
    // if (cover_url) updateData.cover_url = cover_url;
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
        youtube_url,
        tiktok_url,
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
        youtube_url,
        tiktok_url,
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
        youtube_url,
        tiktok_url,
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
        linkedin: data.linkedin_url,
           youtube: data.youtube_url,
            tiktok: data.tiktok_url
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

function calculateProfileCompletion(profile: any, verification: any) {
  const breakdown: any[] = [];
  const missingFields: string[] = [];
  let totalScore = 0;

  const hasValue = (v: any) => v !== null && v !== undefined && String(v).trim() !== '';

  // 1️⃣ Basic Info (15%)
  const hasBasic = hasValue(profile.email) && hasValue(profile.first_name) && hasValue(profile.last_name);
  const basicScore = hasBasic ? 15 : 0;
  totalScore += basicScore;
  breakdown.push({ category: 'Basic Info', completed: hasBasic, percentage: basicScore });
  if (!hasBasic) {
    if (!hasValue(profile.email)) missingFields.push('Email');
    if (!hasValue(profile.first_name)) missingFields.push('First Name');
    if (!hasValue(profile.last_name)) missingFields.push('Last Name');
  }

  // 2️⃣ Profile Images (25%)
  const hasImage = hasValue(profile.avatar_url) || hasValue(profile.cover_url);
  const imageScore = hasImage ? 25 : 0;
  totalScore += imageScore;
  breakdown.push({ category: 'Profile Image', completed: hasImage, percentage: imageScore });
  if (!hasImage) missingFields.push('Avatar or Cover Photo');

  // 3️⃣ Social Links (10%)
  const socialLinks = [
    profile.facebook_url, profile.twitter_url, profile.instagram_url,
    profile.linkedin_url, profile.youtube_url, profile.tiktok_url
  ].filter(hasValue);
  const hasSocial = socialLinks.length > 0;
  const socialScore = hasSocial ? 10 : 0;
  totalScore += socialScore;
  breakdown.push({ category: 'Social Links', completed: hasSocial, percentage: socialScore });
  if (!hasSocial) missingFields.push('At least one social media link');

  // 4️⃣ Personal Details (30%)
  const personalComplete =
    hasValue(profile.country) &&
    hasValue(profile.city) &&
    hasValue(profile.phone) &&
    hasValue(profile.gender) &&
    hasValue(profile.birth_date);
  const personalScore = personalComplete ? 30 : 0;
  totalScore += personalScore;
  breakdown.push({ category: 'Personal Details', completed: personalComplete, percentage: personalScore });
  if (!personalComplete) {
    if (!hasValue(profile.country)) missingFields.push('Country');
    if (!hasValue(profile.city)) missingFields.push('City');
    if (!hasValue(profile.phone)) missingFields.push('Phone');
    if (!hasValue(profile.gender)) missingFields.push('Gender');
    if (!hasValue(profile.birth_date)) missingFields.push('Birth Date');
  }

  // 5️⃣ Two-Factor Authentication (10%)
  const has2FA = profile.two_factor_enabled === true;
  const twoFAScore = has2FA ? 10 : 0;
  totalScore += twoFAScore;
  breakdown.push({ category: 'Two-Factor Authentication', completed: has2FA, percentage: twoFAScore });
  if (!has2FA) missingFields.push('Enable 2FA');

  // 6️⃣ Verification (10%)
  const verifiedLevel = verification?.verification_level;
  const isVerified = verifiedLevel && ['approved', 3, 'verified'].includes(verifiedLevel);
  const verifyScore = isVerified ? 10 : 0;
  totalScore += verifyScore;
  breakdown.push({ category: 'Verification', completed: isVerified, percentage: verifyScore });
  if (!isVerified) missingFields.push('Complete Verification');

  return {
    percentage: totalScore,
    totalScore,
    maxScore: 100,
    breakdown,
    missingFields
  };
}



export const getProfileCompletion = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: User ID required' });
    }

    // 1️⃣ Fetch profile data
    const { data: profile, error: profileError } = await supabase
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
        youtube_url,
        tiktok_url,
        country,
        city,
        phone,
        gender,
        birth_date,
        two_factor_enabled
      `)
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }

    // 2️⃣ Fetch verification info
    const { data: verification } = await supabase
      .from('user_verifications')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // 3️⃣ Calculate completion accurately
    const completionData = calculateProfileCompletion(profile, verification);

    return res.status(200).json({ success: true, data: completionData });
  } catch (error: any) {
    console.error('Error calculating profile completion:', error);
    return res.status(500).json({ success: false, message: error.message || 'Error calculating profile completion' });
  }
};
