// src/sockets/chess.handler.ts
import { Server, Socket } from 'socket.io';
import { supabase } from '../app';
import { getUserEmailFromId } from './getUserFriends';
import { connectedUsers } from './index';
import { gameService } from '../services/game.service';

// Helper function
const getNextMoveNumber = async (roomId: string): Promise<number> => {
  const { data, error } = await supabase
    .from('chess_moves')
    .select('move_number')
    .eq('room_id', roomId)
    .order('move_number', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return 1; // First move
  }

  return data.move_number + 1;
};

export const registerChessHandlers = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    
    // Chess game invitation
    socket.on('chess_invite', async (payload: {
      inviter_id: string;
      friend_id: string;
      chat_id: string;
      game_settings: {
        time_control: 'blitz' | 'rapid' | 'classical';
        difficulty?: 'easy' | 'medium' | 'hard';
      };
    }) => {
      try {
        const userId = payload.inviter_id;
        
        if (!userId) {
          socket.emit('chess_invite_error', { message: 'Inviter ID required' });
          return;
        }

        console.log('📨 Chess invitation received via socket:', {
          inviter_id: payload.inviter_id,
          friend_id: payload.friend_id,
          chat_id: payload.chat_id,
          game_settings: payload.game_settings
        });

        const invitation = await gameService.createChessInvitation({
          inviter_id: userId,
          invitee_id: payload.friend_id,
          chat_id: payload.chat_id,
          game_settings: payload.game_settings
        });

        const { data: inviterProfile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', userId)
          .single();

        const inviterName = `${inviterProfile?.first_name} ${inviterProfile?.last_name || ''}`.trim();

        const friendEmail = await getUserEmailFromId(payload.friend_id);
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

        socket.emit('chess_invitation_sent', {
          invitation,
          room_id: invitation.room_id
        });

      } catch (error) {
        console.error('Error creating chess invitation:', error);
        socket.emit('chess_invite_error', { 
          message: 'Failed to create invitation',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Join chess game room
    socket.on('join_chess_room', async (payload: {
      room_id: string;
      player_id: string;
    }) => {
      try {
        const userId = payload.player_id;
        
        if (!userId) {
          console.log('❌ No player_id provided for join_chess_room');
          socket.emit('chess_game_error', { message: 'Player ID required' });
          return;
        }

        console.log('🎮 Join chess room request:', {
          room_id: payload.room_id,
          player_id: payload.player_id,
          socket_id: socket.id
        });

        // FIRST: Check for public invitation (new logic)
        const { data: publicInvitation, error: publicInviteError } = await supabase
          .from('chess_invitations')
          .select('*')
          .eq('room_id', payload.room_id)
          .eq('is_public', true)
          .eq('status', 'pending')
          .single();

        if (publicInvitation && !publicInviteError) {
          console.log('✅ Found public invitation, joining as multiplayer...', {
            invitation_id: publicInvitation.id,
            inviter_id: publicInvitation.inviter_id,
            is_public: publicInvitation.is_public
          });
          
          const gameRoom = await gameService.joinPublicChessInvitation(payload.room_id, userId);
          console.log('✅ Joined public game:', {
            room_id: gameRoom.room_id,
            white_player: gameRoom.white_player?.name,
            black_player: gameRoom.black_player?.name,
            game_status: gameRoom.game_status
          });

          socket.join(`chess_room_${payload.room_id}`);
          socket.data.currentChessRoom = payload.room_id;

          io.to(`chess_room_${payload.room_id}`).emit('chess_game_joined', {
            room_id: payload.room_id,
            game_room: gameRoom,
            player_count: 2,
            is_public: true
          });

          // Auto-start for public games
          console.log('🎯 Starting public chess game...');
          io.to(`chess_room_${payload.room_id}`).emit('chess_game_start', {
            room_id: payload.room_id,
            game_state: gameRoom.game_status,
            white_player: gameRoom.white_player,
            black_player: gameRoom.black_player
          });
          console.log('✅ Public chess game started successfully');

          return;
        }

        // SECOND: Check for private invitation (existing logic - unchanged)
        const { data: invitation, error: inviteError } = await supabase
          .from('chess_invitations')
          .select('*')
          .eq('room_id', payload.room_id)
          .eq('invitee_id', userId)
          .eq('status', 'pending')
          .single();

        if (invitation && !inviteError) {
          console.log('✅ Found pending private invitation, auto-accepting...', {
            invitation_id: invitation.id,
            inviter_id: invitation.inviter_id,
            invitee_id: invitation.invitee_id
          });
          
          const gameRoom = await gameService.acceptChessInvitation(invitation.id, userId);
          console.log('✅ Private invitation accepted, game room created:', {
            room_id: gameRoom.room_id,
            white_player: gameRoom.white_player?.name,
            black_player: gameRoom.black_player?.name,
            game_status: gameRoom.game_status
          });
          
          const inviterEmail = await getUserEmailFromId(invitation.inviter_id);
          if (inviterEmail) {
            const inviterSockets = connectedUsers.get(inviterEmail);
            if (inviterSockets) {
              console.log('📤 Notifying inviter about acceptance:', {
                inviter_email: inviterEmail,
                socket_count: inviterSockets.size
              });
              inviterSockets.forEach(socketId => {
                io.to(socketId).emit('chess_invitation_accepted', {
                  invitation_id: invitation.id,
                  room_id: payload.room_id,
                  accepted_by: userId
                });
              });
            }
          }

          socket.join(`chess_room_${payload.room_id}`);
          socket.data.currentChessRoom = payload.room_id;
          console.log(' Socket joined room:', `chess_room_${payload.room_id}`);

          console.log(' Broadcasting chess_game_joined event...');
          io.to(`chess_room_${payload.room_id}`).emit('chess_game_joined', {
            room_id: payload.room_id,
            game_room: gameRoom,
            player_count: 2,
            auto_accepted: true
          });

          console.log('🎯 Starting chess game...');
          io.to(`chess_room_${payload.room_id}`).emit('chess_game_start', {
            room_id: payload.room_id,
            game_state: gameRoom.game_status,
            white_player: gameRoom.white_player,
            black_player: gameRoom.black_player
          });
          console.log('✅ Chess game started successfully');

          return;
        }

        // THIRD: Join existing room (existing logic - unchanged)
        console.log('🔍 No pending invitation found, joining existing room...');
        let gameRoom = await gameService.getChessGameRoom(payload.room_id);
        
        if (!gameRoom) {
          console.log('❌ Game room not found:', payload.room_id);
          socket.emit('chess_game_error', { message: 'Game room not found' });
          return;
        }

        console.log('✅ Found existing game room:', {
          room_id: gameRoom.room_id,
          white_player: gameRoom.white_player?.name,
          black_player: gameRoom.black_player?.name,
          game_status: gameRoom.game_status
        });

        socket.join(`chess_room_${payload.room_id}`);
        socket.data.currentChessRoom = payload.room_id;
        console.log(' Socket joined room:', `chess_room_${payload.room_id}`);

        console.log(' Broadcasting chess_game_joined event...');
        io.to(`chess_room_${payload.room_id}`).emit('chess_game_joined', {
          room_id: payload.room_id,
          game_room: gameRoom,
          player_count: gameRoom.white_player && gameRoom.black_player ? 2 : 1
        });

        if (gameRoom.white_player && gameRoom.black_player) {
          console.log('🎯 Room is full, starting game...');
          io.to(`chess_room_${payload.room_id}`).emit('chess_game_start', {
            room_id: payload.room_id,
            game_state: gameRoom.game_status,
            white_player: gameRoom.white_player,
            black_player: gameRoom.black_player
          });
          console.log('✅ Chess game started successfully');
        } else {
          console.log('⏳ Waiting for second player...');
        }

      } catch (error) {
        console.error('❌ Error joining chess room:', error);
        socket.emit('chess_game_error', { 
          message: 'Failed to join game room',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Leave chess room
    socket.on('leave_chess_room', async (payload: {
      room_id: string;
      player_id: string;
    }) => {
      try {
        const userId = payload.player_id;
        
        if (!userId) return;

        console.log('👋 Player leaving chess room:', {
          room_id: payload.room_id,
          player_id: userId
        });

        socket.leave(`chess_room_${payload.room_id}`);
        socket.data.currentChessRoom = null;

        io.to(`chess_room_${payload.room_id}`).emit('chess_player_left', {
          player_id: userId,
          room_id: payload.room_id
        });

      } catch (error) {
        console.error('Error leaving chess room:', error);
      }
    });

    // Chess move handler
    socket.on('chess_move', async (payload: {
      room_id: string;
      move: {
        from: string;
        to: string;
        piece: string;
        captured: string | null;
        san: string;
        player_id: string;
        timestamp: string;
      };
      game_state: {
        current_turn: 'white' | 'black';
        is_check: boolean;
        is_checkmate: boolean;
        is_stalemate: boolean;
      };
    }) => {
      try {
        console.log('♟️ Chess move received:', {
          room_id: payload.room_id,
          move: payload.move,
          game_state: payload.game_state
        });

        // Check if this is an AI game and prevent processing
        const { data: gameRoom } = await supabase
          .from('chess_games')
          .select('is_ai_game')
          .eq('room_id', payload.room_id)
          .single();

        if (gameRoom?.is_ai_game) {
          console.log('❌ Player move in AI game - ignoring');
          socket.emit('chess_move_error', { message: 'This is an AI game - use AI handlers' });
          return;
        }

        const { error: moveError } = await supabase
          .from('chess_moves')
          .insert([{
            room_id: payload.room_id,
            move_number: await getNextMoveNumber(payload.room_id),
            from_square: payload.move.from,
            to_square: payload.move.to,
            piece: payload.move.piece,
            captured_piece: payload.move.captured,
            san: payload.move.san,
            player_id: payload.move.player_id
          }]);

        if (moveError) {
          console.error('❌ Error saving move:', moveError);
          socket.emit('chess_move_error', { message: 'Failed to save move' });
          return;
        }

        const { error: gameError } = await supabase
          .from('chess_games')
          .update({
            current_turn: payload.game_state?.current_turn || 'white',
            game_state: JSON.stringify(payload.game_state),
            updated_at: new Date().toISOString()
          })
          .eq('room_id', payload.room_id);

        if (gameError) {
          console.error('❌ Error updating game state:', gameError);
        }

        // Check for checkmate after move
        if (payload.game_state?.is_checkmate) {
          const winner = payload.game_state.current_turn === 'white' ? 'black' : 'white';
          
          // Get winner name from database
          const { data: winnerProfile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', payload.move.player_id)
            .single();
          
          const winnerName = `${winnerProfile?.first_name} ${winnerProfile?.last_name || ''}`.trim();
          
          // Emit checkmate detection
          io.to(`chess_room_${payload.room_id}`).emit('chess_checkmate_detected', {
            room_id: payload.room_id,
            winner: winner,
            winner_name: winnerName,
            game_state: {
              status: 'finished',
              is_checkmate: true,
              winner: winner
            }
          });
          
          console.log(`✅ Checkmate detected after move: ${winnerName} wins!`);
        }

        socket.broadcast.to(`chess_room_${payload.room_id}`).emit('chess_move_received', {
          room_id: payload.room_id,
          move: payload.move,
          game_state: payload.game_state
        });

        console.log('✅ Chess move broadcasted successfully');

      } catch (error) {
        console.error('❌ Error processing chess move:', error);
        socket.emit('chess_move_error', { 
          message: 'Failed to process move',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Chess capture handler
    socket.on('chess_capture', async (payload: {
      room_id: string;
      captured_piece: {
        piece: string;
        square: string;
        captured_by: string;
        player_id: string;
      };
    }) => {
      try {
        console.log('⚔️ Chess capture received:', {
          room_id: payload.room_id,
          captured_piece: payload.captured_piece
        });

        socket.broadcast.to(`chess_room_${payload.room_id}`).emit('chess_capture_received', {
          room_id: payload.room_id,
          captured_piece: payload.captured_piece
        });

        console.log('✅ Chess capture broadcasted successfully');

      } catch (error) {
        console.error('❌ Error processing chess capture:', error);
        socket.emit('chess_capture_error', { 
          message: 'Failed to process capture',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Chess time update handler
    socket.on('chess_time_update', async (payload: {
      room_id: string;
      time_data: {
        white_time: number;
        black_time: number;
        current_turn: 'white' | 'black';
        last_move_time: string;
      };
    }) => {
      try {
        console.log('⏰ Chess time update received:', {
          room_id: payload.room_id,
          time_data: payload.time_data
        });

        const { error: timeError } = await supabase
          .from('chess_games')
          .update({
            time_data: payload.time_data,
            updated_at: new Date().toISOString()
          })
          .eq('room_id', payload.room_id);

        if (timeError) {
          console.error('❌ Error updating time:', timeError);
        }

        io.to(`chess_room_${payload.room_id}`).emit('chess_time_update', {
          room_id: payload.room_id,
          time_data: payload.time_data
        });

        console.log('✅ Chess time update broadcasted successfully');

      } catch (error) {
        console.error('❌ Error processing time update:', error);
        socket.emit('chess_time_error', { 
          message: 'Failed to process time update',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Chess game state handler
    socket.on('chess_game_state', async (payload: {
      room_id: string;
      game_state: {
        status: 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw';
        current_turn: 'white' | 'black';
        is_check: boolean;
        is_checkmate: boolean;
        is_stalemate: boolean;
        winner: 'white' | 'black' | 'draw' | null;
      };
    }) => {
      try {
        console.log('🎯 Chess game state received:', {
          room_id: payload.room_id,
          game_state: payload.game_state
        });

        const updateData: any = {
          game_status: payload.game_state.status === 'playing' ? 'active' : 'finished',
          current_turn: payload.game_state.current_turn,
          game_state: JSON.stringify(payload.game_state),
          updated_at: new Date().toISOString()
        };

        if (payload.game_state.winner) {
          updateData.winner = payload.game_state.winner;
        }

        const { error: stateError } = await supabase
          .from('chess_games')
          .update(updateData)
          .eq('room_id', payload.room_id);

        if (stateError) {
          console.error('❌ Error updating game state:', stateError);
        }

        io.to(`chess_room_${payload.room_id}`).emit('chess_game_state', {
          room_id: payload.room_id,
          game_state: payload.game_state
        });

        console.log('✅ Chess game state broadcasted successfully');

      } catch (error) {
        console.error('❌ Error processing game state:', error);
        socket.emit('chess_state_error', { 
          message: 'Failed to process game state',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Chess checkmate declared handler
    socket.on('chess_checkmate_declared', async (payload: {
      room_id: string;
      winner: 'white' | 'black';
      winner_name: string;
    }) => {
      try {
        console.log('🏆 Chess checkmate declared:', {
          room_id: payload.room_id,
          winner: payload.winner,
          winner_name: payload.winner_name
        });

        // Update game state in database
        const { error: gameError } = await supabase
          .from('chess_games')
          .update({
            game_status: 'finished',
            winner: payload.winner,
            game_state: JSON.stringify({
              status: 'finished',
              is_checkmate: true,
              winner: payload.winner,
              current_turn: payload.winner
            }),
            updated_at: new Date().toISOString()
          })
          .eq('room_id', payload.room_id);

        if (gameError) {
          console.error('❌ Error updating checkmate status:', gameError);
          socket.emit('chess_error', { 
            message: 'Failed to update checkmate status',
            error: gameError.message
          });
          return;
        }

        // Broadcast checkmate declaration to all players in the room
        io.to(`chess_room_${payload.room_id}`).emit('chess_checkmate_declared', {
          room_id: payload.room_id,
          winner: payload.winner,
          winner_name: payload.winner_name,
          game_state: {
            status: 'finished',
            is_checkmate: true,
            winner: payload.winner
          }
        });

        console.log(`✅ Checkmate declared in room ${payload.room_id}: ${payload.winner_name} wins!`);

      } catch (error) {
        console.error('❌ Error processing checkmate declaration:', error);
        socket.emit('chess_error', { 
          message: 'Failed to process checkmate declaration',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Chess checkmate detected handler (automatic detection)
    socket.on('chess_checkmate_detected', async (payload: {
      room_id: string;
      winner: 'white' | 'black';
      winner_name: string;
      game_state: {
        status: 'finished';
        is_checkmate: true;
        winner: 'white' | 'black';
      };
    }) => {
      try {
        console.log('🏆 Chess checkmate detected automatically:', {
          room_id: payload.room_id,
          winner: payload.winner,
          winner_name: payload.winner_name
        });

        // Update game state in database
        const { error: gameError } = await supabase
          .from('chess_games')
          .update({
            game_status: 'finished',
            winner: payload.winner,
            game_state: JSON.stringify(payload.game_state),
            updated_at: new Date().toISOString()
          })
          .eq('room_id', payload.room_id);

        if (gameError) {
          console.error('❌ Error updating checkmate status:', gameError);
          socket.emit('chess_error', { 
            message: 'Failed to update checkmate status',
            error: gameError.message
          });
          return;
        }

        // Broadcast checkmate detection to all players in the room
        io.to(`chess_room_${payload.room_id}`).emit('chess_checkmate_detected', {
          room_id: payload.room_id,
          winner: payload.winner,
          winner_name: payload.winner_name,
          game_state: payload.game_state
        });

        console.log(`✅ Checkmate detected in room ${payload.room_id}: ${payload.winner_name} wins!`);

      } catch (error) {
        console.error('❌ Error processing checkmate detection:', error);
        socket.emit('chess_error', { 
          message: 'Failed to process checkmate detection',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Handle disconnect - clean up chess rooms
    socket.on('disconnect', async () => {
      try {
        if (socket.data?.currentChessRoom) {
          const roomId = socket.data.currentChessRoom;
          const userId = socket.data?.userId || 'unknown';
          
          console.log('🔌 Player disconnected from chess room:', {
            player_id: userId,
            current_room: roomId
          });
          
          io.to(`chess_room_${roomId}`).emit('chess_player_disconnected', {
            player_id: userId,
            room_id: roomId
          });
        }
      } catch (error) {
        console.error('Error cleaning up chess room on disconnect:', error);
      }
    });
  });
};