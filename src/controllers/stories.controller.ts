import { Request, Response } from "express";
import { supabase } from "../app";

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
            .insert([
                {
                    user_id,
                    story_type,
                    story_media,
                    content,
                    caption,
                    backgroundcolor,
                    textcolor,
                },
            ])
            .select();

        if (error) throw error;

        res.status(201).json({ story: data[0] });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

export async function deleteStory(req: Request, res: Response): Promise<any> {
    const { id } = req.params;

    try {
        const { error } = await supabase.from("stories").delete().eq("id", id);

        if (error) throw error;

        res.status(200).json({ message: "Story deleted successfully" });
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

        const friendIds = friendships
            .map((f: any) => (f.sender_id === id ? f.receiver_id : f.sender_id))
            .filter((friendId: string) => friendId !== id);

        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Get user's own stories
        const { data: myStories, error: myStoriesError } = await supabase
            .from("stories")
            .select(`
                *,
                 user:profiles!inner(id,first_name,last_name,email,avatar_url)
            `)
            .eq("user_id", id)
            .gte("created_at", twentyFourHoursAgo)
            .order("created_at", { ascending: false });

        if (myStoriesError) throw myStoriesError;

        // Get friends' stories (if any friends exist)
        let friendsStories = [];
        if (friendIds.length > 0) {
            const { data: friendsStoriesData, error: friendsStoriesError } = await supabase
                .from("stories")
                .select(`
                    *,
                    profiles!inner(id,first_name,last_name,email,avatar_url)
                `)
                .in("user_id", friendIds)
                .gte("created_at", twentyFourHoursAgo)
                .order("created_at", { ascending: false });

            if (friendsStoriesError) throw friendsStoriesError;
            friendsStories = friendsStoriesData || [];
        }

        res.status(200).json({
            message: "Stories retrieved successfully",
            myStories: myStories || [],
            friendsStories: friendsStories,
            // Optional: combined view if needed
            // allStories: [...(myStories || []), ...friendsStories]
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message || "Internal Server Error" });
    }
}