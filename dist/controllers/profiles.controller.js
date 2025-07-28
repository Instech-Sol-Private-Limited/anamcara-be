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
exports.getAboutInfo = exports.getUserProfile = exports.updateProfile = void 0;
const app_1 = require("../app");
const updateProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: Please login to update your profile'
            });
        }
        const { first_name, last_name, avatar_url, facebook_url, twitter_url, instagram_url, linkedin_url, bio, country, city, phone, website_url, birth_date, gender } = req.body;
        if (!first_name) {
            return res.status(400).json({
                success: false,
                message: 'First name is required'
            });
        }
        // Validate social media URLs if provided
        const validateUrl = (url, platform) => {
            if (!url)
                return true; // Allow empty URLs
            try {
                new URL(url);
                return true;
            }
            catch (_a) {
                throw new Error(`Invalid ${platform} URL format`);
            }
        };
        if (facebook_url)
            validateUrl(facebook_url, 'Facebook');
        if (twitter_url)
            validateUrl(twitter_url, 'Twitter');
        if (instagram_url)
            validateUrl(instagram_url, 'Instagram');
        if (linkedin_url)
            validateUrl(linkedin_url, 'LinkedIn');
        if (website_url)
            validateUrl(website_url, 'Website');
        const { data, error } = yield app_1.supabase
            .from('profiles')
            .update({
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
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error updating profile'
        });
    }
});
exports.updateProfile = updateProfile;
const getUserProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { data, error } = yield app_1.supabase
            .from('profiles')
            .select(`
        id,
        email,
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
        created_at,
        updated_at,
        is_active,
        is_deleted
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
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching user profile'
        });
    }
});
exports.getUserProfile = getUserProfile;
const getAboutInfo = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { data, error } = yield app_1.supabase
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
        avatar_url
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
            avatar_url: data.avatar_url || null
        };
        res.status(200).json({
            success: true,
            data: aboutInfo
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching about information'
        });
    }
});
exports.getAboutInfo = getAboutInfo;
