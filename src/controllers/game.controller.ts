// src/controllers/game.controller.ts
import { Request, Response } from 'express';
import { supabase, io } from '../app';
import { gameService } from '../services/game.service';
import { connectedUsers } from '../sockets';
import { getUserEmailFromId } from '../sockets/getUserFriends';

export const sendChessInvite = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { friend_id, chat_id, game_settings } = req.body;

    if (!friend_id || !chat_id || !game_settings) {
      res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: friend_id, chat_id, game_settings' 
      });
      return;
    }

    const invitation = await gameService.createChessInvitation({
      inviter_id: userId,
      invitee_id: friend_id,
      chat_id,
      game_settings
    });

    const { data: inviterProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', userId)
      .single();

    const inviterName = `${inviterProfile?.first_name} ${inviterProfile?.last_name || ''}`.trim();

    const friendEmail = await getUserEmailFromId(friend_id);
    if (friendEmail) {
      const friendSockets = connectedUsers.get(friendEmail);
      if (friendSockets) {
        friendSockets.forEach(socketId => {
          io.to(socketId).emit('chess_invitation_received', {
            invitation,
            inviter_name: inviterName,
            room_link: `${process.env.CLIENT_URL}/chess/room/${invitation.room_id}`
          });
        });
      }
    }

    res.status(201).json({
      success: true,
      data: invitation,
      message: 'Chess invitation sent successfully'
    });

  } catch (error) {
    console.error('Error sending chess invite:', error);
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
    const { winner, reason, moves } = req.body;

    if (!winner || !reason) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: winner, reason'
      });
      return;
    }

    await gameService.saveGameResult(room_id, {
      winner,
      reason,
      moves: moves || []
    });

    io.to(`chess_room_${room_id}`).emit('chess_game_end', {
      winner,
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