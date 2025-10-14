// src/services/game.service.ts
import { supabase } from '../app';

export const gameService = {
  async createChessInvitation(data: {
    inviter_id: string;
    invitee_id: string | null; // Allow null for public invitations
    chat_id: string | null; // Allow null for public invitations
    game_settings: {
      time_control: 'blitz' | 'rapid' | 'classical';
      difficulty?: 'easy' | 'medium' | 'hard';
    };
  }) {
    
    const roomId = `chess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    const invitationData = {
      room_id: roomId,
      inviter_id: data.inviter_id,
      invitee_id: data.invitee_id, // Can be null for public invitations
      chat_id: data.chat_id, // Can be null for public invitations
      game_settings: data.game_settings,
      status: 'pending',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };


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


    const { data: gameRoom, error: roomError } = await supabase
      .from('chess_games')
      .insert([gameRoomData])
      .select()
      .single();

    if (roomError) {
      console.error('❌ Error creating game room:', roomError);
    }

    return {
      id: invitation.id,
      room_id: invitation.room_id,
      inviter_id: invitation.inviter_id,
      invitee_id: invitation.invitee_id,
      inviter_name: `${invitation.inviter.first_name} ${invitation.inviter.last_name || ''}`.trim(),
      invitee_name: invitation.invitee ? `${invitation.invitee.first_name} ${invitation.invitee.last_name || ''}`.trim() : null,
      status: invitation.status,
      created_at: invitation.created_at,
      expires_at: invitation.expires_at,
      game_settings: invitation.game_settings
    };
  },

  async acceptChessInvitation(inviteId: string, userId: string) {

    // First, get the invitation to check if invitee_id is null (public invitation)
    const { data: invitationData, error: getInviteError } = await supabase
      .from('chess_invitations')
      .select('*')
      .eq('id', inviteId)
      .single();

    if (getInviteError || !invitationData) {
      console.error('❌ Error getting invitation:', getInviteError);
      throw new Error('Invitation not found');
    }

    let invitation;

    // Check if this is a public invitation (null invitee_id)
    if (invitationData.invitee_id === null) {
      
      // Update invitation with the joining user's ID
      const { data: updatedInvitation, error: updateError } = await supabase
        .from('chess_invitations')
        .update({ 
          status: 'accepted',
          invitee_id: userId // Set the joining user as invitee
        })
        .eq('id', inviteId)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Error updating public invitation:', updateError);
        throw updateError;
      }

      invitation = updatedInvitation;
      
    } else {
      
      // Regular invitation - only the specific invitee can accept
      const { data: updatedInvitation, error: updateError } = await supabase
        .from('chess_invitations')
        .update({ status: 'accepted' })
        .eq('id', inviteId)
        .eq('invitee_id', userId) // Must match the intended invitee
        .select()
        .single();

      if (updateError) {
        console.error('❌ Error accepting invitation:', updateError);
        throw new Error('You are not the intended recipient of this invitation');
      }

      invitation = updatedInvitation;
    }

    // Update existing room instead of creating new one
    const { data: gameRoom, error: gameError } = await supabase
      .from('chess_games')
      .update({
        black_player_id: invitation.invitee_id, // This will be the joining user's ID
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
      moves: [],
      // Explicit game type indicators
      game_type: 'multiplayer', // Always multiplayer when two real players
      is_ai_game: false, // Never AI when it's a real multiplayer game
      is_public: invitation.invitee_id === null // True if it was a public invitation
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

    try {
      await supabase.rpc('increment_soulpoints', {
        p_user_id: result.winner,
        p_points: 300
      });
    } catch (error) {
      console.error('❌ Error awarding winner soul points:', error);
    }

    // Award 100 soul points to loser
    try {
      await supabase.rpc('increment_soulpoints', {
        p_user_id: result.loser,
        p_points: 100
      });
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
  },

  // NEW: Create public chess invitation
  async createPublicChessInvitation(data: {
    inviter_id: string;
    game_settings: {
      time_control: 'blitz' | 'rapid' | 'classical';
      difficulty?: 'easy' | 'medium' | 'hard';
    };
  }) {
    
    const roomId = `public_chess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    const invitationData = {
      room_id: roomId,
      inviter_id: data.inviter_id,
      invitee_id: null, // No specific invitee for public invitations
      chat_id: null, // No chat required for public invitations
      game_settings: data.game_settings,
      status: 'pending',
      is_public: true, // Mark as public invitation
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };


    const { data: invitation, error: inviteError } = await supabase
      .from('chess_invitations')
      .insert([invitationData])
      .select(`
        *,
        inviter:profiles!chess_invitations_inviter_id_fkey(first_name, last_name)
      `)
      .single();

    if (inviteError) {
      console.error('❌ Error creating public invitation:', inviteError);
      throw inviteError;
    }

    // Create room with WAITING status (not active)
    const gameRoomData = {
      room_id: roomId,
      white_player_id: data.inviter_id,
      black_player_id: null, // Will be set when someone joins
      current_turn: 'white',
      game_status: 'waiting', // Keep as waiting, not active
      game_state: this.getInitialChessPosition(),
      game_settings: data.game_settings,
      is_public: true, // Mark as public game
      created_at: new Date().toISOString()
    };


    const { data: gameRoom, error: roomError } = await supabase
      .from('chess_games')
      .insert([gameRoomData])
      .select()
      .single();

    if (roomError) {
      console.error('❌ Error creating public game room:', roomError);
      throw roomError;
    }

    return {
      id: invitation.id,
      room_id: invitation.room_id,
      inviter_id: invitation.inviter_id,
      inviter_name: `${invitation.inviter.first_name} ${invitation.inviter.last_name || ''}`.trim(),
      status: invitation.status,
      is_public: true,
      created_at: invitation.created_at,
      expires_at: invitation.expires_at,
      game_settings: invitation.game_settings
    };
  },

  // NEW: Join public chess invitation
  async joinPublicChessInvitation(roomId: string, userId: string) {

    // Find the public invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('chess_invitations')
      .select('*')
      .eq('room_id', roomId)
      .eq('is_public', true)
      .eq('status', 'pending')
      .single();

    if (inviteError || !invitation) {
      console.error('❌ Public invitation not found:', inviteError);
      throw new Error('Public invitation not found or expired');
    }

    // // Check if user is trying to join their own invitation
    // if (invitation.inviter_id === userId) {
    //   throw new Error('Cannot join your own invitation');
    // }


    // Update invitation status to accepted
    const { error: updateInviteError } = await supabase
      .from('chess_invitations')
      .update({ 
        status: 'accepted',
        invitee_id: userId
      })
      .eq('id', invitation.id);

    if (updateInviteError) {
      console.error('❌ Error updating invitation:', updateInviteError);
      throw updateInviteError;
    }

    // Update game room with the joining player
    const { data: gameRoom, error: gameError } = await supabase
      .from('chess_games')
      .update({
        black_player_id: userId,
        game_status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('room_id', roomId)
      .select(`
        *,
        white_player:profiles!chess_games_white_player_id_fkey(id, first_name, last_name, avatar_url),
        black_player:profiles!chess_games_black_player_id_fkey(id, first_name, last_name, avatar_url)
      `)
      .single();

    if (gameError) {
      console.error('❌ Error updating public game room:', gameError);
      throw gameError;
    }


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
      is_public: true,
      created_at: gameRoom.created_at,
      moves: [],
      // Explicit game type indicators
      game_type: 'multiplayer', // Always multiplayer when two real players
      is_ai_game: false, // Never AI when it's a real multiplayer game
    // Remove the duplicate line 746
    };
  },

  // NEW: Get available public chess invitations
  async getAvailablePublicInvitations(limit: number = 10) {

    const { data: invitations, error } = await supabase
      .from('chess_invitations')
      .select(`
        *,
        inviter:profiles!chess_invitations_inviter_id_fkey(first_name, last_name, avatar_url)
      `)
      .eq('is_public', true)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('❌ Error fetching public invitations:', error);
      throw error;
    }


    return invitations?.map(invitation => ({
      id: invitation.id,
      room_id: invitation.room_id,
      inviter_id: invitation.inviter_id,
      inviter_name: `${invitation.inviter.first_name} ${invitation.inviter.last_name || ''}`.trim(),
      inviter_avatar: invitation.inviter.avatar_url,
      game_settings: invitation.game_settings,
      status: invitation.status,
      is_public: true,
      created_at: invitation.created_at,
      expires_at: invitation.expires_at
    })) || [];
  },

  // NEW: Clean up expired public invitations
  async cleanupExpiredPublicInvitations() {

    const { data: expiredInvitations, error: fetchError } = await supabase
      .from('chess_invitations')
      .select('id, room_id')
      .eq('is_public', true)
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString());

    if (fetchError) {
      console.error('❌ Error fetching expired invitations:', fetchError);
      return;
    }

    if (!expiredInvitations || expiredInvitations.length === 0) {
      return;
    }

    const { error: deleteInviteError } = await supabase
      .from('chess_invitations')
      .delete()
      .in('id', expiredInvitations.map(inv => inv.id));

    if (deleteInviteError) {
      console.error('❌ Error deleting expired invitations:', deleteInviteError);
      return;
    }

    // Delete associated game rooms
    const roomIds = expiredInvitations.map(inv => inv.room_id);
    const { error: deleteRoomError } = await supabase
      .from('chess_games')
      .delete()
      .in('room_id', roomIds);

    if (deleteRoomError) {
      console.error('❌ Error deleting expired game rooms:', deleteRoomError);
    }
  }
};