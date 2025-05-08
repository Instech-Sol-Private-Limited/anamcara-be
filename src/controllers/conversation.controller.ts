// src/controllers/conversation.controller.ts
import { Request, Response } from 'express';
import { supabase } from '../app';
import { v4 as uuidv4 } from 'uuid';


export const getConversations = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      res.status(401).json({ 
        success: false,
        message: 'User not authenticated' 
      });
      return;
    }

    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    res.status(200).json({
      success: true,
      data: conversations
    });
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// @desc    Get a conversation by ID with all messages
// @route   GET /api/conversations/:id
// @access  Private
export const getConversationById = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ 
        success: false,
        message: 'User not authenticated' 
      });
      return;
    }

    
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId) 

    if (convError || !conversation) {
      res.status(404).json({ 
        success: false,
        message: 'Conversation not found' 
      });
      return;
    }

    
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (msgError) throw msgError;

    res.status(200).json({
      success: true,
      data: {
        conversation,
        messages: messages || []
      }
    });
  } catch (error: any) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// @desc    
// @route   
// @access 
export const createConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { title } = req.body;

    if (!userId) {
      res.status(401).json({ 
        success: false,
        message: 'User not authenticated' 
      });
      return;
    }

    const conversationId = uuidv4();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        id: conversationId,
        title: title || 'New Conversation',
        user_id: userId,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      data
    });
  } catch (error: any) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// @desc    
// @route   
// @access  
export const updateConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { title } = req.body;

    if (!userId) {
      res.status(401).json({ 
        success: false,
        message: 'User not authenticated' 
      });
      return;
    }

    const { data: conversation, error: verifyError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (verifyError || !conversation) {
      res.status(403).json({ 
        success: false,
        message: 'Not authorized to update this conversation' 
      });
      return;
    }

    
    const { data, error } = await supabase
      .from('conversations')
      .update({ 
        title, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({
      success: true,
      data
    });
  } catch (error: any) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};


export const deleteConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ 
        success: false,
        message: 'User not authenticated' 
      });
      return;
    }

   
    const { data: conversation, error: verifyError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (verifyError || !conversation) {
      res.status(403).json({ 
        success: false,
        message: 'Not authorized to delete this conversation' 
      });
      return;
    }

   
    const { error: msgError } = await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', id);

    if (msgError) throw msgError;

    
    const { error: convDeleteError } = await supabase
      .from('conversations')
      .delete()
      .eq('id', id);

    if (convDeleteError) throw convDeleteError;

    res.status(200).json({
      success: true,
      message: 'Conversation deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};