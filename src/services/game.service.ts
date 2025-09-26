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
    //
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

  // Add this method to calculate ELO rating changes
  async calculateELORating(winnerRating: number, loserRating: number, kFactor: number = 32) {
    const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
    const expectedLoser = 1 / (1 + Math.pow(10, (winnerRating - loserRating) / 400));
    
    const winnerChange = Math.round(kFactor * (1 - expectedWinner));
    const loserChange = Math.round(kFactor * (0 - expectedLoser));
    
    return {
      winnerChange,
      loserChange,
      newWinnerRating: winnerRating + winnerChange,
      newLoserRating: loserRating + loserChange
    };
  },

  // Add this method to get or create user's chess rating
  async getOrCreateChessRating(userId: string) {
    const { data: existingRating, error } = await supabase
      .from('chess_ratings')
      .select('rating, games_played, wins, losses')
      .eq('user_id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
      // No rating exists, create new one with default rating
      const defaultRating = 1200;
      const { data: newRating, error: insertError } = await supabase
        .from('chess_ratings')
        .insert([{
          user_id: userId,
          rating: defaultRating,
          games_played: 0,
          wins: 0,
          losses: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (insertError) throw insertError;
      return newRating;
    }

    if (error) throw error;
    return existingRating;
  },

  // Update the saveGameResult method
  async saveGameResult(roomId: string, result: {
    winner: string; // User ID of winner
    loser: string;  // User ID of loser
    reason: string;
    moves: any[];
  }) {
    // Get game data to find which player is white/black
    const { data: gameData, error: gameError } = await supabase
      .from('chess_games')
      .select('white_player_id, black_player_id')
      .eq('room_id', roomId)
      .single();

    if (gameError || !gameData) {
      throw new Error('Game not found');
    }

    // Determine if winner is white or black
    const winnerColor = gameData.white_player_id === result.winner ? 'white' : 'black';

    // Update the game with the correct winner color
    const { error } = await supabase
      .from('chess_games')
      .update({
        game_status: 'finished',
        winner: winnerColor, // Use "white" or "black"
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

    // Get current ratings for both players
    const [winnerRating, loserRating] = await Promise.all([
      this.getOrCreateChessRating(result.winner),
      this.getOrCreateChessRating(result.loser)
    ]);

    // Calculate new ELO ratings
    const eloUpdate = await this.calculateELORating(winnerRating.rating, loserRating.rating);

    // Update winner's rating
    await supabase
      .from('chess_ratings')
      .update({
        rating: eloUpdate.newWinnerRating,
        games_played: winnerRating.games_played + 1,
        wins: winnerRating.wins + 1,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', result.winner);

    // Update loser's rating
    await supabase
      .from('chess_ratings')
      .update({
        rating: eloUpdate.newLoserRating,
        games_played: loserRating.games_played + 1,
        losses: loserRating.losses + 1,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', result.loser);

    // Log rating changes
    console.log(`🏆 ELO Rating Update:`);
    console.log(`Winner ${result.winner}: ${winnerRating.rating} → ${eloUpdate.newWinnerRating} (+${eloUpdate.winnerChange})`);
    console.log(`Loser ${result.loser}: ${loserRating.rating} → ${eloUpdate.newLoserRating} (${eloUpdate.loserChange})`);

    // Award soul points using the provided user IDs directly
    // Award 300 soul points to winner
    try {
      await supabase.rpc('increment_soulpoints', {
        p_user_id: result.winner,
        p_points: 300
      });
      console.log(`✅ Awarded 300 soul points to winner ${result.winner}`);
    } catch (error) {
      console.error('❌ Error awarding winner soul points:', error);
    }

    // Award 100 soul points to loser
    try {
      await supabase.rpc('increment_soulpoints', {
        p_user_id: result.loser,
        p_points: 100
      });
      console.log(`✅ Awarded 100 soul points to loser ${result.loser}`);
    } catch (error) {
      console.error('❌ Error awarding loser soul points:', error);
    }
  },

  getInitialChessPosition() {
    return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  },

  async getAllUsers(filters: {
    search?: string;
    role?: string;
    limit?: number;
    offset?: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  } = {}) {
    const {
      search,
      role,
      limit = 50,
      offset = 0,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = filters;

    let query = supabase
      .from('profiles')
      .select(`
        id,
        first_name,
        last_name,
        email,
        avatar_url,
        role,
        created_at
      `)
      .eq('role', 'user');

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (role) {
      query = query.eq('role', role);
    }

    query = query
      .order(sort_by, { ascending: sort_order === 'asc' })
      .range(offset, offset + limit - 1);

    const { data: users, error } = await query;

    if (error) {
      console.error('Error fetching users in service:', error);
      throw error;
    }

    const formattedUsers = users?.map(user => ({
      id: user.id,
      name: `${user.first_name} ${user.last_name || ''}`.trim(),
      email: user.email,
      avatar_url: user.avatar_url,
      role: user.role,
      created_at: user.created_at
    })) || [];

    return {
      users: formattedUsers,
      pagination: {
        count: formattedUsers.length,
        limit,
        offset,
        has_more: formattedUsers.length === limit
      }
    };
  },

  async getPlayerChessRanking(userId: string) {
    const { data: playerRating, error } = await supabase
      .from('chess_ratings')
      .select('rating, games_played, wins, losses, draws')
      .eq('user_id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
      return {
        ranking: null,
        rating: 1200,
        games_played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        message: 'Player has no chess games yet'
      };
    }

    if (error) throw error;

    // Get player's rank
    const { count: rank } = await supabase
      .from('chess_ratings')
      .select('*', { count: 'exact', head: true })
      .gt('rating', playerRating.rating);

    return {
      ranking: (rank || 0) + 1,
      rating: playerRating.rating,
      games_played: playerRating.games_played,
      wins: playerRating.wins,
      losses: playerRating.losses,
      draws: playerRating.draws || 0
    };
  },

  async getChessLeaderboard(limit: number = 50) {
    const { data: leaderboard, error } = await supabase
      .from('chess_ratings')
      .select(`
        rating,
        games_played,
        wins,
        losses,
        draws,
        profiles!inner(
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .order('rating', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return leaderboard.map((player, index) => ({
      rank: index + 1,
      user_id: player.profiles?.[0]?.id,
      name: `${player.profiles?.[0]?.first_name} ${player.profiles?.[0]?.last_name}`.trim(),
      avatar_url: player.profiles?.[0]?.avatar_url,
      rating: player.rating,
      games_played: player.games_played,
      wins: player.wins,
      losses: player.losses,
      draws: player.draws || 0
    }));
  }
};