// src/services/game.service.ts
import { supabase } from '../app';

export const gameService = {
  async createChessInvitation(data: {
    inviter_id: string;
    invitee_id: string;
    chat_id: string;
    game_settings: {
      time_control: 'blitz' | 'rapid' | 'classical';
      difficulty?: 'easy' | 'medium' | 'hard';
    };
  }) {
    console.log('🎮 Creating chess invitation with data:', data);
    
    const roomId = `chess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log('🏠 Generated room ID:', roomId);
    
    const invitationData = {
      room_id: roomId,
      inviter_id: data.inviter_id,
      invitee_id: data.invitee_id,
      chat_id: data.chat_id,
      game_settings: data.game_settings,
      status: 'pending',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    console.log(' Invitation data to insert:', invitationData);

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('chess_invitations')
      .insert([invitationData])
      .select(`
        *,
        inviter:profiles!chess_invitations_inviter_id_fkey(first_name, last_name),
        invitee:profiles!chess_invitations_invitee_id_fkey(first_name, last_name)
      `)
      .single();

    if (inviteError) {
      console.error('❌ Error creating invitation:', inviteError);
      throw inviteError;
    }

    console.log('✅ Invitation created successfully:', invitation);

    // Create room directly
    const gameRoomData = {
      room_id: roomId,
      white_player_id: data.inviter_id,
      black_player_id: null, // Will be set when invitation is accepted
      current_turn: 'white',
      game_status: 'waiting',
      game_state: this.getInitialChessPosition(),
      game_settings: data.game_settings,
      created_at: new Date().toISOString()
    };

    console.log(' Creating game room:', gameRoomData);

    const { data: gameRoom, error: roomError } = await supabase
      .from('chess_games')
      .insert([gameRoomData])
      .select()
      .single();

    if (roomError) {
      console.error('❌ Error creating game room:', roomError);
      // Don't throw error here, just log it
      console.log('⚠️ Continuing without room creation...');
    } else {
      console.log('✅ Game room created successfully:', gameRoom);
    }

    return {
      id: invitation.id,
      room_id: invitation.room_id,
      inviter_id: invitation.inviter_id,
      invitee_id: invitation.invitee_id,
      inviter_name: `${invitation.inviter.first_name} ${invitation.inviter.last_name || ''}`.trim(),
      invitee_name: `${invitation.invitee.first_name} ${invitation.invitee.last_name || ''}`.trim(),
      status: invitation.status,
      created_at: invitation.created_at,
      expires_at: invitation.expires_at,
      game_settings: invitation.game_settings
    };
  },

  async acceptChessInvitation(inviteId: string, userId: string) {
    console.log('✅ Accepting chess invitation:', { inviteId, userId });
  
    const { data: invitation, error: inviteError } = await supabase
      .from('chess_invitations')
      .update({ status: 'accepted' })
      .eq('id', inviteId)
      .eq('invitee_id', userId)
      .select()
      .single();
  
    if (inviteError) {
      console.error('❌ Error accepting invitation:', inviteError);
      throw inviteError;
    }
  
    console.log('📋 Invitation accepted:', invitation);
  
    // Update existing room instead of creating new one
    const { data: gameRoom, error: gameError } = await supabase
      .from('chess_games')
      .update({
        black_player_id: invitation.invitee_id,
        game_status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('room_id', invitation.room_id)
      .select(`
        *,
        white_player:profiles!chess_games_white_player_id_fkey(id, first_name, last_name, avatar_url),
        black_player:profiles!chess_games_black_player_id_fkey(id, first_name, last_name, avatar_url)
      `)
      .single();
  
    if (gameError) {
      console.error('❌ Error updating game room:', gameError);
      throw gameError;
    }
  
    console.log('✅ Game room updated successfully:', gameRoom);
  
    return {
      id: gameRoom.id,
      room_id: gameRoom.room_id,
      inviter_id: invitation.inviter_id,
      white_player: {
        id: gameRoom.white_player.id,
        name: `${gameRoom.white_player.first_name} ${gameRoom.white_player.last_name || ''}`.trim(),
        avatar_url: gameRoom.white_player.avatar_url
      },
      black_player: {
        id: gameRoom.black_player.id,
        name: `${gameRoom.black_player.first_name} ${gameRoom.black_player.last_name || ''}`.trim(),
        avatar_url: gameRoom.black_player.avatar_url
      },
      current_turn: gameRoom.current_turn,
      game_status: gameRoom.game_status,
      created_at: gameRoom.created_at,
      moves: []
    };
  },

  async createChessRoom(userId: string, settings: {
    time_control: 'blitz' | 'rapid' | 'classical';
    difficulty?: 'easy' | 'medium' | 'hard';
  }) {
    const roomId = `chess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    const roomData = {
      room_id: roomId,
      white_player_id: userId,
      current_turn: 'white',
      game_status: 'waiting',
      game_state: this.getInitialChessPosition(),
      game_settings: settings,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('chess_games')
      .insert([roomData])
      .select()
      .single();

    if (error) throw error;

    return {
      room_id: data.room_id,
      id: data.id
    };
  },

  async getChessGameRoom(roomId: string) {
    const { data, error } = await supabase
      .from('chess_games')
      .select(`
        *,
        white_player:profiles!chess_games_white_player_id_fkey(id, first_name, last_name, avatar_url),
        black_player:profiles!chess_games_black_player_id_fkey(id, first_name, last_name, avatar_url),
        moves:chess_moves(*)
      `)
      .eq('room_id', roomId)
      .single();

    if (error) throw error;

    return {
      id: data.id,
      room_id: data.room_id,
      white_player: data.white_player ? {
        id: data.white_player.id,
        name: `${data.white_player.first_name} ${data.white_player.last_name || ''}`.trim(),
        avatar_url: data.white_player.avatar_url
      } : null,
      black_player: data.black_player ? {
        id: data.black_player.id,
        name: `${data.black_player.first_name} ${data.black_player.last_name || ''}`.trim(),
        avatar_url: data.black_player.avatar_url
      } : null,
      current_turn: data.current_turn,
      game_status: data.game_status,
      winner: data.winner,
      created_at: data.created_at,
      moves: data.moves || []
    };
  },

  async saveGameResult(roomId: string, result: {
    winner: string;
    reason: string;
    moves: any[];
  }) {
    const { error } = await supabase
      .from('chess_games')
      .update({
        game_status: 'finished',
        winner: result.winner,
        reason: result.reason,
        updated_at: new Date().toISOString()
      })
      .eq('room_id', roomId);

    if (error) throw error;

    if (result.moves && result.moves.length > 0) {
      const movesData = result.moves.map((move, index) => ({
        room_id: roomId,
        move_number: index + 1,
        from_square: move.from,
        to_square: move.to,
        piece: move.piece,
        captured_piece: move.captured,
        san: move.san,
        player_id: move.player_id
      }));

      const { error: movesError } = await supabase
        .from('chess_moves')
        .insert(movesData);

      if (movesError) throw movesError;
    }
  },

  getInitialChessPosition() {
    return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  }
};