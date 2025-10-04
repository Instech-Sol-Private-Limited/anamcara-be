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
exports.createStory = createStory;
exports.deleteStory = deleteStory;
exports.getStories = getStories;
const app_1 = require("../app");
function createStory(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { story_type, story_media, content, caption, backgroundcolor, textcolor, } = req.body;
        const { id: user_id } = req === null || req === void 0 ? void 0 : req.user;
        try {
            const { data, error } = yield app_1.supabase
                .from("stories")
                .insert([{
                    user_id,
                    story_type,
                    story_media,
                    content,
                    caption,
                    backgroundcolor,
                    textcolor,
                }])
                .select();
            if (error) {
                return res.status(500).json({ error: error });
            }
            res.status(201).json({ story: data[0] });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}
function deleteStory(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { id } = req.params;
        const { id: user_id } = req.user;
        try {
            const { data: story, error: storyError } = yield app_1.supabase
                .from("stories")
                .select("user_id")
                .eq("id", id)
                .single();
            if (storyError)
                throw storyError;
            if (!story)
                return res.status(404).json({ error: "Story not found" });
            if (story.user_id !== user_id) {
                return res.status(403).json({ error: "Unauthorized to delete this story" });
            }
            yield app_1.supabase
                .from("story_views")
                .delete()
                .eq("story_id", id);
            // Then delete the story
            const { error } = yield app_1.supabase
                .from("stories")
                .delete()
                .eq("id", id);
            if (error)
                throw error;
            res.status(200).json({ message: "Story and its views deleted successfully" });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}
function getStories(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { id } = req.user;
        try {
            const { data: friendships, error: friendshipError } = yield app_1.supabase
                .from("friendships")
                .select("sender_id, receiver_id")
                .or(`sender_id.eq.${id},receiver_id.eq.${id}`)
                .eq("status", "accepted");
            if (friendshipError)
                throw friendshipError;
            const friendIds = friendships
                .map((f) => (f.sender_id === id ? f.receiver_id : f.sender_id))
                .filter((friendId) => friendId !== id);
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: myStories, error: myStoriesError } = yield app_1.supabase
                .from("stories")
                .select(`
                *,
                user:profiles!inner(id,first_name,last_name,email,avatar_url),
                views:story_views(
                    viewed_at,
                    viewer:user_id,
                    viewer_profile:profiles!user_id(id,first_name,last_name,email,avatar_url)
                ),
                views_aggregate:story_views(count).filter(user_id.neq.${id})
            `)
                .eq("user_id", id)
                .gte("created_at", twentyFourHoursAgo)
                .order("created_at", { ascending: false });
            if (myStoriesError)
                throw myStoriesError;
            let friendsStories = [];
            if (friendIds.length > 0) {
                const { data: friendsStoriesData, error: friendsStoriesError } = yield app_1.supabase
                    .from("stories")
                    .select(`
                    *,
                    user:profiles!inner(id,first_name,last_name,email,avatar_url),
                    views:story_views(
                        viewed_at,
                        viewer:user_id,
                        viewer_profile:profiles!user_id(id,first_name,last_name,email,avatar_url)
                    ),
                    views_aggregate:story_views(count).filter(user_id.neq.user_id),
                    my_view:story_views!inner(
                        id
                    ).filter(user_id.eq.${id})
                `)
                    .in("user_id", friendIds)
                    .gte("created_at", twentyFourHoursAgo)
                    .order("created_at", { ascending: false });
                if (friendsStoriesError)
                    throw friendsStoriesError;
                friendsStories = friendsStoriesData || [];
            }
            // Format the response
            const formattedMyStories = (myStories === null || myStories === void 0 ? void 0 : myStories.map(story => {
                var _a;
                return (Object.assign(Object.assign({}, story), { view_count: ((_a = story.views_aggregate[0]) === null || _a === void 0 ? void 0 : _a.count) || 0, viewers: story.views
                        .filter((view) => view.viewer !== id)
                        .map((view) => ({
                        id: view.viewer,
                        viewed_at: view.viewed_at,
                        profile: view.viewer_profile
                    })), has_viewed: true }));
            })) || [];
            const formattedFriendsStories = friendsStories.map(story => {
                var _a, _b;
                return (Object.assign(Object.assign({}, story), { view_count: ((_a = story.views_aggregate[0]) === null || _a === void 0 ? void 0 : _a.count) || 0, viewers: story.views.map((view) => ({
                        id: view.viewer,
                        viewed_at: view.viewed_at,
                        profile: view.viewer_profile
                    })), has_viewed: !!((_b = story.my_view) === null || _b === void 0 ? void 0 : _b.length) }));
            });
            return res.status(200).json({
                myStories: formattedMyStories,
                friendsStories: formattedFriendsStories
            });
        }
        catch (error) {
            return res.status(500).json({ message: error.message || "Internal Server Error" });
        }
    });
}
