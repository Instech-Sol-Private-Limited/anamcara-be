import { Request, Response } from 'express';
import { supabase } from "../app";

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.user!;
        const { data, error } = await supabase
            .from('notifications')
            .select(`*`)
            .eq("user_id", id);

        if (error) {
            throw new Error(`Supabase error: ${error.message}`);
        }

        if (!data || data.length === 0) {
            res.status(200).json({
                success: true,
                data: [],
                message: "No notification found!",
            });
            return;
        }

        res.status(200).json({
            success: true,
            data
        });

    } catch (error) {
        console.error('Error in notifications:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        res.status(500).json({
            success: false,
            error: 'Failed to fetch notifications!',
            message: errorMessage,
        });
    }
};