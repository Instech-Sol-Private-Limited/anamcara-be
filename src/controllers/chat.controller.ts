import { Request, Response } from 'express';
import { supabase } from '../app';
import { openai } from '../app';
import { v4 as uuidv4 } from 'uuid';

export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { conversationId, content } = req.body;
    
    if (!userId) {
      res.status(401).json({ 
        success: false, 
        message: 'User not authenticated' 
      });
      return;
    }
    
    if (!conversationId || !content) {
      res.status(400).json({
        success: false,
        message: 'Conversation ID and message content are required'
      });
      return;
    }
    
   
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, title')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();
    
    if (convError || !conversation) {
      res.status(403).json({
        success: false,
        message: 'Not authorized to access this conversation'
      });
      return;
    }
    
  
    const { data: previousMessages, error: msgError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(10); 
    if (msgError) throw msgError;
    
    
    const isFirstMessage = !previousMessages || previousMessages.length === 0;
    
   
    if (isFirstMessage && conversation.title === 'New Conversation') {
      
      const generatedTitle = content.length > 30 
        ? content.substring(0, 30) + '...' 
        : content;
      
 
      await supabase
        .from('conversations')
        .update({ 
          title: generatedTitle,
          updated_at: new Date().toISOString() 
        })
        .eq('id', conversationId);
    }
    
    const now = new Date().toISOString();
    const userMessageId = uuidv4();
    

    const { error: userMsgError } = await supabase
      .from('messages')
      .insert({
        id: userMessageId,
        conversation_id: conversationId,
        content,
        role: 'user',
        user_id: userId,
        created_at: now
      });
    
    if (userMsgError) throw userMsgError;
    
    
    const messages = previousMessages 
      ? [...previousMessages, { role: 'user', content }]
      : [{ role: 'user', content }];
    
   
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: messages.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content
      })),
      temperature: 0.7,
      max_tokens: 800
    });
    
    const assistantResponse = completion.choices[0].message.content;
    
    if (!assistantResponse) {
      throw new Error('Failed to get a response from AI');
    }
    
    
    const aiMessageId = uuidv4();
    const { error: aiMsgError } = await supabase
      .from('messages')
      .insert({
        id: aiMessageId,
        conversation_id: conversationId,
        content: assistantResponse,
        role: 'assistant',
        user_id: userId,
        created_at: new Date().toISOString()
      });
    
    if (aiMsgError) throw aiMsgError;
    
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);
    
   
    const userMessageResponse = {
      id: userMessageId,
      content,
      role: 'user',
      created_at: now,
      conversation_id: conversationId,
      user_id: userId
    };
    
    const assistantMessageResponse = {
      id: aiMessageId,
      content: assistantResponse,
      role: 'assistant',
      created_at: new Date().toISOString(),
      conversation_id: conversationId,
      user_id: userId
    };
    
    res.status(200).json({
      success: true,
      data: {
        userMessage: userMessageResponse,
        assistantMessage: assistantMessageResponse  
      }
    });
  } catch (error: any) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};


export const getMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;
    
    if (!userId) {
      res.status(401).json({ 
        success: false, 
        message: 'User not authenticated' 
      });
      return;
    }
    
    
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();
    
    if (convError || !conversation) {
      res.status(403).json({
        success: false,
        message: 'Not authorized to access this conversation'
      });
      return;
    }
    

    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    
    if (msgError) throw msgError;
    
    res.status(200).json({
      success: true,
      data: messages || []
    });
  } catch (error: any) {
    console.error('Error getting messages:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};


export const clearMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;
    
    if (!userId) {
      res.status(401).json({ 
        success: false, 
        message: 'User not authenticated' 
      });
      return;
    }
    
    
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();
    
    if (convError || !conversation) {
      res.status(403).json({
        success: false,
        message: 'Not authorized to delete messages from this conversation'
      });
      return;
    }
    
    
    const { error: deleteError } = await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', conversationId);
    
    if (deleteError) throw deleteError;
    
    res.status(200).json({
      success: true,
      message: 'All messages deleted successfully'
    });
  } catch (error: any) {
    console.error('Error clearing messages:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};