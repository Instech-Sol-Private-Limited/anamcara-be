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
exports.createPostInDatabase = exports.checkChamberPermission = exports.notifyChamberMembers = exports.sendPostCreationNotification = exports.updateUserSoulpoints = exports.determinePostType = exports.allocateSoulpointsForPost = exports.getChamberMonetizationStatus = exports.validatePostRequest = void 0;
const app_1 = require("../app");
const emitNotification_1 = require("../sockets/emitNotification");
const validatePostRequest = (body) => {
    const errors = [];
    const { content, media_url, poll_options, question_category, embedded_items, is_chamber_post, chamber_id } = body;
    const hasContent = content === null || content === void 0 ? void 0 : content.trim();
    const hasMedia = media_url;
    const hasPoll = (poll_options === null || poll_options === void 0 ? void 0 : poll_options.length) > 0;
    const hasQuestion = question_category;
    const hasEmbedded = embedded_items;
    if (!hasContent && !hasMedia && !hasPoll && !hasQuestion && !hasEmbedded) {
        errors.push({ message: 'Post must contain content, media, poll, question, or embedded content' });
    }
    // Validate chamber_id when is_chamber_post is true
    if (is_chamber_post && !chamber_id) {
        errors.push({ field: 'chamber_id', message: 'Chamber ID is required for chamber posts' });
    }
    // Validate chamber_id format if provided
    if (chamber_id && typeof chamber_id !== 'string') {
        errors.push({ field: 'chamber_id', message: 'Chamber ID must be a valid UUID string' });
    }
    if (hasPoll) {
        if (!Array.isArray(poll_options)) {
            errors.push({ field: 'poll_options', message: 'Poll options must be an array' });
        }
        else if (poll_options.length < 2) {
            errors.push({ field: 'poll_options', message: 'Poll must have at least 2 options' });
        }
        else if (poll_options.length > 10) {
            errors.push({ field: 'poll_options', message: 'Poll cannot have more than 10 options' });
        }
        const validOptions = poll_options.filter((opt) => opt && typeof opt === 'string' && opt.trim().length > 0);
        if (validOptions.length < 2) {
            errors.push({ field: 'poll_options', message: 'Poll options must contain at least 2 valid choices' });
        }
    }
    if (hasEmbedded) {
        if (typeof embedded_items !== 'object' || embedded_items === null) {
            errors.push({ field: 'embedded_items', message: 'Embedded items must be a valid object' });
        }
    }
    if (hasMedia) {
        const validMediaTypes = ['image', 'video'];
        if (body.media_type && !validMediaTypes.includes(body.media_type)) {
            errors.push({ field: 'media_type', message: 'Media type must be either "image" or "video"' });
        }
    }
    return errors;
};
exports.validatePostRequest = validatePostRequest;
const getChamberMonetizationStatus = (chamberId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data: chamber, error } = yield app_1.supabase
            .from('custom_chambers')
            .select('monetization')
            .eq('id', chamberId)
            .single();
        if (error) {
            console.error('Error fetching chamber monetization:', error);
            return { isPaid: false, monetization: null };
        }
        const monetization = chamber === null || chamber === void 0 ? void 0 : chamber.monetization;
        const isPaid = (monetization === null || monetization === void 0 ? void 0 : monetization.enabled) === true;
        return { isPaid, monetization };
    }
    catch (error) {
        console.error('Error checking chamber monetization:', error);
        return { isPaid: false, monetization: null };
    }
});
exports.getChamberMonetizationStatus = getChamberMonetizationStatus;
const allocateSoulpointsForPost = (userId, isChamberPost, chamberId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let points = 5;
        if (isChamberPost && chamberId) {
            const { isPaid } = yield (0, exports.getChamberMonetizationStatus)(chamberId);
            points = isPaid ? 20 : 10;
        }
        yield (0, exports.updateUserSoulpoints)(userId, points);
        return points;
    }
    catch (error) {
        console.error('Failed to allocate soulpoints:', error);
        const fallbackPoints = 5;
        try {
            yield (0, exports.updateUserSoulpoints)(userId, fallbackPoints);
        }
        catch (fallbackError) {
            console.error('Failed to allocate fallback soulpoints:', fallbackError);
        }
        return fallbackPoints;
    }
});
exports.allocateSoulpointsForPost = allocateSoulpointsForPost;
const determinePostType = (data) => {
    var _a;
    if (((_a = data.poll_options) === null || _a === void 0 ? void 0 : _a.length) > 0) {
        return 'poll';
    }
    if (data.question_category) {
        return 'question';
    }
    if (data.embedded_items) {
        return 'embedded';
    }
    return 'regular';
};
exports.determinePostType = determinePostType;
const updateUserSoulpoints = (userId, points) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { error } = yield app_1.supabase.rpc("increment_soulpoints", {
            p_user_id: userId,
            p_points: points,
        });
        if (error) {
            console.error("Failed to update soulpoints:", error);
            throw error;
        }
    }
    catch (error) {
        console.error("Error updating soulpoints:", error);
        throw error;
    }
});
exports.updateUserSoulpoints = updateUserSoulpoints;
const sendPostCreationNotification = (userId_1, postId_1, postType_1, soulpoints_1, ...args_1) => __awaiter(void 0, [userId_1, postId_1, postType_1, soulpoints_1, ...args_1], void 0, function* (userId, postId, postType, soulpoints, isChamberPost = false, chamberName) {
    try {
        const { data: profile, error } = yield app_1.supabase
            .from('profiles')
            .select('email, first_name')
            .eq('id', userId)
            .single();
        if (error) {
            console.error('Error fetching profile:', error);
            return;
        }
        if (profile) {
            let message = `Post created successfully! +${soulpoints} soulpoints added to your profile`;
            if (isChamberPost && chamberName) {
                message = `Post created in ${chamberName}! +${soulpoints} soulpoints added to your profile`;
            }
            yield (0, emitNotification_1.sendNotification)({
                recipientEmail: profile.email,
                recipientUserId: userId,
                actorUserId: null,
                threadId: postId,
                message: message,
                type: 'post_creation',
                metadata: {
                    soulpoints: soulpoints,
                    post_id: postId,
                    post_type: postType,
                    user_name: profile.first_name,
                    is_chamber_post: isChamberPost,
                    chamber_name: chamberName
                }
            });
        }
    }
    catch (error) {
        console.error('Error sending notification:', error);
    }
});
exports.sendPostCreationNotification = sendPostCreationNotification;
const notifyChamberMembers = (chamberId, postId, authorId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data: members, error } = yield app_1.supabase
            .from('chamber_members')
            .select(`
                user_id,
                profiles (
                    id,
                    first_name,
                    last_name,
                    email
                )
            `)
            .eq('chamber_id', chamberId)
            .neq('user_id', authorId);
        if (error) {
            console.error('Error fetching chamber members:', error);
            return;
        }
        if (members && members.length > 0) {
            const notificationPromises = members.map((member) => __awaiter(void 0, void 0, void 0, function* () {
                const profile = member.profiles;
                if (profile && profile.email) {
                    return (0, emitNotification_1.sendNotification)({
                        recipientEmail: profile.email,
                        recipientUserId: member.user_id,
                        actorUserId: authorId,
                        threadId: postId,
                        message: 'New post in your chamber',
                        type: 'chamber_post',
                        metadata: {
                            chamber_id: chamberId,
                            post_id: postId,
                            author_id: authorId,
                            member_name: `${profile.first_name} ${profile.last_name || ''}`.trim()
                        }
                    });
                }
                else {
                    console.warn(`No email found for user ${member.user_id}, skipping notification`);
                    return Promise.resolve();
                }
            }));
            yield Promise.all(notificationPromises);
        }
    }
    catch (error) {
        console.error('Error notifying chamber members:', error);
    }
});
exports.notifyChamberMembers = notifyChamberMembers;
const checkChamberPermission = (chamberId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data: chamberMember, error } = yield app_1.supabase
            .from('chamber_members')
            .select('id, role')
            .eq('chamber_id', chamberId)
            .eq('user_id', userId)
            .single();
        if (error || !chamberMember) {
            return false;
        }
        return true;
    }
    catch (error) {
        console.error('Error checking chamber permission:', error);
        return false;
    }
});
exports.checkChamberPermission = checkChamberPermission;
const createPostInDatabase = (postData) => __awaiter(void 0, void 0, void 0, function* () {
    const { data, error } = yield app_1.supabase
        .from('posts')
        .insert(postData)
        .select(`
      *,
      profiles (
        id,
        first_name,
        last_name,
        avatar_url,
        email
      )
    `)
        .single();
    return { data, error };
});
exports.createPostInDatabase = createPostInDatabase;
