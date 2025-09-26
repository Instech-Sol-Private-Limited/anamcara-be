import { Request, Response } from 'express';
import { supabase, io } from '../app';
import { gameService } from '../services/game.service';
import { connectedUsers } from '../sockets';
import { getUserEmailFromId } from '../sockets/getUserFriends';
import { sendNotification } from '../sockets/emitNotification';
import { chessAIService } from '../services/chess-ai.service';
export const createAIGame = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { difficulty = 'medium', player_color = 'white' } = req.body;

    console.log('🤖 Creating AI game:', { userId, difficulty, player_color });

    const aiGameData = await chessAIService.createAIGame(userId, difficulty, player_color);

    res.status(201).json({
      success: true,
      data: {
        room_id: aiGameData.room_id,
        room_link: `${process.env.CLIENT_URL}/chess/room/${aiGameData.room_id}`,
        ai_difficulty: aiGameData.ai_difficulty,
        player_color: aiGameData.player_color,
        game_type: 'ai'
      },
      message: 'AI chess game created successfully'
    });

  } catch (error) {
    console.error('❌ Error creating AI game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create AI game',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const requestAIMove = async (req: Request, res: Response): Promise<void> => {
  try {
    const { room_id } = req.params;
    const { difficulty } = req.body;

    console.log('🤖 AI move requested for room:', room_id);

    // Generate AI move
    const aiMove = chessAIService.generateAIMove(difficulty);

    if (!aiMove) {
      res.status(400).json({ success: false, message: 'No valid AI moves available' });
      return;
    }

    // Add natural delay
    setTimeout(() => {
      res.status(200).json({
        success: true,
        data: {
          move: aiMove,
          ai_move: true,
          room_id: room_id
        },
        message: 'AI move generated successfully'
      });
    }, Math.random() * 1000 + 500);

  } catch (error) {
    console.error('❌ Error generating AI move:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate AI move',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }}
export const sendChessInvite = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { friend_id, invitee_id, chat_id, game_settings, message } = req.body;

    // Determine the invitee - prioritize friend_id for backward compatibility
    const targetUserId = friend_id || invitee_id;
    
    if (!targetUserId || !game_settings) {
      res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: friend_id/invitee_id, game_settings' 
      });
      return;
    }

    console.log('🎮 Chess invitation request:', {
      friend_id,
      invitee_id,
      targetUserId,
      chat_id,
      game_settings
    });

    // Check if target user exists
    const { data: targetProfile, error: targetError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, role')
      .eq('id', targetUserId)
      .single();

    if (targetError || !targetProfile) {
      console.error('❌ Error fetching target user:', targetError);
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    console.log('✅ Target user found:', {
      id: targetProfile.id,
      name: `${targetProfile.first_name} ${targetProfile.last_name}`,
      email: targetProfile.email
    });

    // Check if user is trying to invite themselves
    if (targetUserId === userId) {
      res.status(400).json({
        success: false,
        message: 'Cannot invite yourself'
      });
      return;
    }

    // Check if target user is not an admin (optional check)
    if (targetProfile.role === 'admin') {
      res.status(403).json({
        success: false,
        message: 'Cannot invite admin users'
      });
      return;
    }

    let finalChatId = chat_id;

    // If no chat_id provided, check if chat exists or create one
    if (!finalChatId) {
      console.log('🔍 No chat_id provided, checking for existing chat...');
      
      const { data: existingChat, error: chatCheckError } = await supabase
        .from('chats')
        .select('id')
        .or(`and(user_1.eq.${userId},user_2.eq.${targetUserId}),and(user_1.eq.${targetUserId},user_2.eq.${userId})`)
        .maybeSingle();

      if (chatCheckError) {
        console.error('❌ Error checking existing chat:', chatCheckError);
        res.status(500).json({
          success: false,
          message: 'Failed to check existing chat'
        });
        return;
      }

      if (existingChat) {
        finalChatId = existingChat.id;
        console.log('✅ Using existing chat:', finalChatId);
      } else {
        console.log('🆕 Creating new chat...');
        // Create new chat for random user invitation
        const { data: newChat, error: insertError } = await supabase
          .from('chats')
          .insert([{
            user_1: userId,
            user_2: targetUserId
          }])
          .select('id')
          .single();

        if (insertError) {
          console.error('❌ Error creating chat:', insertError);
          res.status(500).json({
            success: false,
            message: 'Failed to create chat for invitation'
          });
          return;
        }

        finalChatId = newChat.id;
        console.log('✅ Created new chat:', finalChatId);
      }
    } else {
      console.log('✅ Using provided chat_id:', finalChatId);
    }

    console.log('🎯 Creating chess invitation...');
    const invitation = await gameService.createChessInvitation({
      inviter_id: userId,
      invitee_id: targetUserId,
      chat_id: finalChatId,
      game_settings
    });

    console.log('✅ Chess invitation created:', invitation);

    const { data: inviterProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', userId)
      .single();

    const inviterName = `${inviterProfile?.first_name} ${inviterProfile?.last_name || ''}`.trim();

    // Store notification using existing system
    await sendNotification({
      recipientEmail: targetProfile.email,
      recipientUserId: targetUserId,
      actorUserId: userId,
      threadId: null,
      message: message || `You've been invited to play chess!`,
      type: 'chess_invitation',
      metadata: {
        invitation_id: invitation.id,
        room_id: invitation.room_id,
        inviter_name: inviterName,
        game_settings: game_settings,
        game_type: game_settings.game_type || 'casual',
        bet_amount: game_settings.bet_amount || 0,
        room_link: `${process.env.CLIENT_URL}/chess/room/${invitation.room_id}`
      }
    });

    // Send real-time notification
    const targetEmail = targetProfile.email;
    console.log('📡 Sending real-time notification to:', targetEmail);
    
    if (targetEmail) {
      const targetSockets = connectedUsers.get(targetEmail);
      if (targetSockets) {
        console.log('📡 Found sockets for target user:', targetSockets.size);
        targetSockets.forEach(socketId => {
          io.to(socketId).emit('chess_invitation_received', {
            invitation,
            inviter_name: inviterName,
            inviter_id: userId,
            message: message || `You've been invited to play chess!`,
            room_link: `${process.env.CLIENT_URL}/chess/room/${invitation.room_id}`,
            // Add betting info from game_settings for notification only
            game_type: game_settings.game_type || 'casual',
            bet_amount: game_settings.bet_amount || 0
          });
        });
      } else {
        console.log('⚠️ No active sockets found for target user');
      }
    }

    // Send chat message about the invitation
    // Only send message if no chat_id was provided (new chat created) or if custom message is provided
    const shouldSendMessage = !chat_id || message;
    
    if (shouldSendMessage) {
      console.log('💬 Sending chat message...');
      
      // Use the structured format like the working invitations
      const messageContent = message || 
        `Room ID: chess?\nroom=${invitation.room_id}\nClick to join the chess game`;
      
      const messageData = {
        chat_id: finalChatId,
        sender: userId,
        message: messageContent,
        has_media: false,
        media: null,
        message_type: 'chess_invitation',
        reply_to: null,
        status: 'sent',
        created_at: new Date().toISOString(),
        is_deleted: false,
        is_edited: false
      };

      const { data: insertedMessage, error: messageError } = await supabase
        .from('chatmessages')
        .insert([messageData])
        .select()
        .single();

      if (messageError) {
        console.error('❌ Error sending chat message:', messageError);
      } else {
        console.log('✅ Chat message sent successfully');
        
        // Update chat timestamp
        await supabase
          .from('chats')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', finalChatId);
        
        // Send real-time message notification
        const targetEmail = targetProfile.email;
        if (targetEmail) {
          const targetSockets = connectedUsers.get(targetEmail);
          if (targetSockets) {
            targetSockets.forEach(socketId => {
              io.to(socketId).emit('receive_message', insertedMessage);
            });
          }
        }
      }
    } else {
      console.log('📝 No chat message sent (using existing friend chat)');
    }

    res.status(201).json({
      success: true,
      data: {
        room_id: invitation.room_id,
        chat_id: finalChatId,
        room_link: `${process.env.CLIENT_URL}/chess?room=${invitation.room_id}`,
        invitation_id: invitation.id,
        inviter_name: inviterName,
        invitee_name: `${targetProfile.first_name} ${targetProfile.last_name || ''}`.trim(),
        status: invitation.status,
        created_at: invitation.created_at,
        expires_at: invitation.expires_at,
        game_settings: invitation.game_settings
      },
      message: 'Chess invitation sent successfully'
    });

  } catch (error) {
    console.error('❌ Error sending chess invite:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send chess invitation',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const acceptChessInvite = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { invitation_id } = req.params;

    const gameRoom = await gameService.acceptChessInvitation(invitation_id, userId);

    const inviterEmail = await getUserEmailFromId(gameRoom.inviter_id);
    if (inviterEmail) {
      const inviterSockets = connectedUsers.get(inviterEmail);
      if (inviterSockets) {
        inviterSockets.forEach(socketId => {
          io.to(socketId).emit('chess_invitation_accepted', {
            invitation_id,
            room_id: gameRoom.room_id,
            accepted_by: userId
          });
        });
      }
    }

    res.status(200).json({
      success: true,
      data: gameRoom,
      message: 'Chess invitation accepted successfully'
    });

  } catch (error) {
    console.error('Error accepting chess invite:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept chess invitation',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const createChessRoom = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { time_control, difficulty } = req.body;

    const roomData = await gameService.createChessRoom(userId, {
      time_control,
      difficulty
    });

    res.status(201).json({
      success: true,
      data: {
        room_id: roomData.room_id,
        room_link: `${process.env.CLIENT_URL}/chess/room/${roomData.room_id}`
      },
      message: 'Chess room created successfully'
    });

  } catch (error) {
    console.error('Error creating chess room:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create chess room',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getChessGameRoom = async (req: Request, res: Response): Promise<void> => {
  try {
    const { room_id } = req.params;

    const gameRoom = await gameService.getChessGameRoom(room_id);

    res.status(200).json({
      success: true,
      data: gameRoom
    });

  } catch (error) {
    console.error('Error getting chess game room:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get chess game room',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const saveGameResult = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { room_id } = req.params;
    const { winner, loser, reason, moves } = req.body;

    if (!winner || !loser || !reason) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: winner, loser, reason'
      });
      return;
    }

    await gameService.saveGameResult(room_id, {
      winner,
      loser,
      reason,
      moves: moves || []
    });

    io.to(`chess_room_${room_id}`).emit('chess_game_end', {
      winner,
      loser,
      reason,
      ended_by: userId,
      timestamp: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      message: 'Game result saved successfully'
    });

  } catch (error) {
    console.error('Error saving game result:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save game result',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const fetchAllUsers = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
//
    const filters = req.body;

    const result = await gameService.getAllUsers(filters);

    res.json({
      success: true,
      data: result.users,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Error in fetchAllUsers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getPlayerChessRanking = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const ranking = await gameService.getPlayerChessRanking(userId);

    res.status(200).json({
      success: true,
      data: ranking
    });

  } catch (error) {
    console.error('Error getting player chess ranking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get player ranking',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getChessLeaderboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 50 } = req.query;
    const leaderboard = await gameService.getChessLeaderboard(Number(limit));

    res.status(200).json({
      success: true,
      data: leaderboard
    });

  } catch (error) {
    console.error('Error getting chess leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get leaderboard',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getAIGameStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { room_id } = req.params;

    const { data: gameRoom, error } = await supabase
      .from('chess_games')
      .select('*')
      .eq('room_id', room_id)
      .eq('is_ai_game', true)
      .single();

    if (error || !gameRoom) {
      res.status(404).json({
        success: false,
        message: 'AI game not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        room_id: gameRoom.room_id,
        ai_difficulty: gameRoom.ai_difficulty,
        player_color: gameRoom.player_color,
        current_turn: gameRoom.current_turn,
        game_status: gameRoom.game_status,
        is_ai_game: gameRoom.is_ai_game
      }
    });

  } catch (error) {
    console.error('❌ Error getting AI game status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get AI game status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const generateAIMoveWithBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { room_id } = req.params;
    const { board_state, difficulty = 'medium' } = req.body;

    console.log('🤖 AI move requested with board state:', { room_id, difficulty });

    const aiMove = chessAIService.generateAIMove(difficulty, board_state);

    if (!aiMove) {
      res.status(400).json({
        success: false,
        message: 'No valid AI moves available'
      });
      return;
    }

    if (!chessAIService.isValidMove(board_state, aiMove)) {
      res.status(400).json({
        success: false,
        message: 'Generated invalid move'
      });
      return;
    }

    console.log('✅ AI move generated:', aiMove);

    res.status(200).json({
      success: true,
      data: {
        move: aiMove,
        ai_move: true,
        room_id: room_id,
        difficulty: difficulty
      },
      message: 'AI move generated successfully'
    });

  } catch (error) {
    console.error('❌ Error generating AI move with board:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate AI move',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};