import { Request, Response } from "express";
import { supabase } from "../app";


export const getActiveStreams = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('active_streams')
      .select(`
        stream_id,
        email,
        stream_title,
        creator_socket,
        created_at,
        viewer_count,
        thumbnail_url,
        stream_category_id (
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      count: data.length,
      streams: data.map(stream => ({
        id: stream.stream_id,
        email: stream.email,
        title: stream.stream_title,
        creator_socket: stream.creator_socket,
        createdAt: stream.created_at,
        viewerCount: stream.viewer_count,
        thumbnailUrl: stream.thumbnail_url,
        // @ts-ignore
        category: stream.stream_category_id?.name || 'Uncategorized'
      })),
    });
  } catch (error) {
    console.error('❌ Error fetching active streams:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const getTrendingStreams = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('active_streams')
      .select(`
        stream_id,
        email,
        stream_title,
        creator_socket,
        created_at,
        viewer_count,
        thumbnail_url,
        stream_category_id (
          name
        )
      `)
      .order('viewer_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    res.json({
      success: true,
      count: data.length,
      streams: data.map(stream => ({
        id: stream.stream_id,
        email: stream.email,
        title: stream.stream_title,
        creator_socket: stream.creator_socket,
        createdAt: stream.created_at,
        viewerCount: stream.viewer_count,
        thumbnailUrl: stream.thumbnail_url,
        // @ts-ignore
        category: stream.stream_category_id?.name || 'Uncategorized'
      })),
    });
  } catch (error) {
    console.error('❌ Error fetching trending streams:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};