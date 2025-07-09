import { Request, Response } from "express";
import { supabase } from "../app";

interface Story {
    id: string;
    user_id: string;
    story_type: string;
    story_media: string;
    content: string;
    caption: string;
    backgroundcolor: string;
    textcolor: string;
    created_at: string;
    updated_at: string;
    user: {
        id: string;
        first_name: string;
        last_name: string;
        email: string;
        avatar_url: string;
    };
    views: {
        viewed_at: string;
        viewer: string;
    }[];
    views_aggregate: {
        count: number;
    }[];
    my_view?: {
        id: string;
    }[];
}

interface Friendship {
    sender_id: string;
    receiver_id: string;
}

interface FormattedStory extends Omit<Story, 'views' | 'views_aggregate' | 'my_view'> {
    view_count: number;
    viewers: any;
    has_viewed: boolean;
}

export async function createStory(req: Request, res: Response): Promise<any> {
    const {
        story_type,
        story_media,
        content,
        caption,
        backgroundcolor,
        textcolor,
    } = req.body;
    const { id: user_id } = req?.user!;

    try {
        const { data, error } = await supabase
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
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

export async function deleteStory(req: Request, res: Response): Promise<any> {
    const { id } = req.params;
    const { id: user_id } = req.user!;

    try {
        const { data: story, error: storyError } = await supabase
            .from("stories")
            .select("user_id")
            .eq("id", id)
            .single();

        if (storyError) throw storyError;
        if (!story) return res.status(404).json({ error: "Story not found" });
        if (story.user_id !== user_id) {
            return res.status(403).json({ error: "Unauthorized to delete this story" });
        }

        await supabase
            .from("story_views")
            .delete()
            .eq("story_id", id);

        // Then delete the story
        const { error } = await supabase
            .from("stories")
            .delete()
            .eq("id", id);

        if (error) throw error;

        res.status(200).json({ message: "Story and its views deleted successfully" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

export async function getStories(req: Request, res: Response): Promise<any> {
    const { id } = req.user!;
    try {
        const { data: friendships, error: friendshipError } = await supabase
            .from("friendships")
            .select("sender_id, receiver_id")
            .or(`sender_id.eq.${id},receiver_id.eq.${id}`)
            .eq("status", "accepted");

        if (friendshipError) throw friendshipError;

        const friendIds = (friendships as Friendship[])
            .map((f) => (f.sender_id === id ? f.receiver_id : f.sender_id))
            .filter((friendId) => friendId !== id);

        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: myStories, error: myStoriesError } = await supabase
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

        if (myStoriesError) throw myStoriesError;

        let friendsStories: Story[] = [];
        if (friendIds.length > 0) {
            const { data: friendsStoriesData, error: friendsStoriesError } = await supabase
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

            if (friendsStoriesError) throw friendsStoriesError;
            friendsStories = friendsStoriesData as any[] || [];
        }

        // Format the response
        const formattedMyStories: FormattedStory[] = (myStories as any[])?.map(story => ({
            ...story,
            view_count: story.views_aggregate[0]?.count || 0,
            viewers: story.views
                .filter((view: any) => view.viewer !== id)
                .map((view: any) => ({
                    id: view.viewer,
                    viewed_at: view.viewed_at,
                    profile: view.viewer_profile
                })),
            has_viewed: true
        })) || [];

        const formattedFriendsStories: FormattedStory[] = friendsStories.map(story => ({
            ...story,
            view_count: story.views_aggregate[0]?.count || 0,
            viewers: story.views.map((view: any) => ({
                id: view.viewer,
                viewed_at: view.viewed_at,
                profile: view.viewer_profile
            })),
            has_viewed: !!story.my_view?.length
        }));

        return res.status(200).json({
            myStories: formattedMyStories,
            friendsStories: formattedFriendsStories
        });
    } catch (error: any) {
        return res.status(500).json({ message: error.message || "Internal Server Error" });
    }
}