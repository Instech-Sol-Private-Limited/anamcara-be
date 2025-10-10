"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerChessAIHandlers = void 0;
const app_1 = require("../app");
const chess_ai_service_1 = require("../services/chess-ai.service");
// Helper function
const getNextMoveNumber = (roomId) => __awaiter(void 0, void 0, void 0, function* () {
    const { data, error } = yield app_1.supabase
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
});
const registerChessAIHandlers = (io) => {
    io.on('connection', (socket) => {
        // AI move request handler
        socket.on('request_ai_move', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                console.log('🤖 AI move requested via socket:', payload);
                let boardState = payload.board_state;
                let aiColor = payload.ai_color;
                // Get AI color from database if not provided
                if (!aiColor) {
                    const { data: gameRoom } = yield app_1.supabase
                        .from('chess_games')
                        .select('player_color')
                        .eq('room_id', payload.room_id)
                        .single();
                    aiColor = (gameRoom === null || gameRoom === void 0 ? void 0 : gameRoom.player_color) === 'white' ? 'black' : 'white';
                }
                console.log('🤖 AI using board state:', JSON.stringify(boardState, null, 2));
                console.log('🤖 AI color:', aiColor);
                // CRITICAL FIX: Check if it's actually AI's turn before generating move
                // Use turn from payload instead of database to avoid timing issues
                const currentTurn = payload.current_turn || payload.turn;
                if (currentTurn !== aiColor) {
                    console.log('🤖 Not AI\'s turn, skipping move generation. Current turn:', currentTurn, 'AI color:', aiColor);
                    // Don't send error to prevent frontend loops - just quietly ignore
                    return;
                }
                console.log('🤖 AI\'s turn detected! Generating move for:', aiColor);
                console.log('🤖 Current turn from payload:', currentTurn);
                // Try to generate AI move with retry logic
                let aiMove = null;
                let attempts = 0;
                const maxAttempts = 3; // Changed from 5 to 3
                while (!aiMove && attempts < maxAttempts) {
                    attempts++;
                    console.log(`�� AI move attempt ${attempts}/${maxAttempts}`);
                    aiMove = chess_ai_service_1.chessAIService.generateAIMove(payload.difficulty, boardState, aiColor);
                    if (aiMove) {
                        // Validate the move
                        if (chess_ai_service_1.chessAIService.isValidMove(boardState, aiMove)) {
                            console.log('✅ Valid AI move generated:', aiMove);
                            break;
                        }
                        else {
                            console.log('❌ AI move failed validation, retrying...');
                            aiMove = null;
                        }
                    }
                    else {
                        console.log('❌ No AI move generated, retrying...');
                    }
                    // Small delay before retry
                    if (attempts < maxAttempts) {
                        yield new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
                //
                if (!aiMove) {
                    console.log('❌ Failed to generate valid AI move after', maxAttempts, 'attempts');
                    socket.emit('ai_move_error', { message: 'Failed to generate valid AI move' });
                    return;
                }
                // Send AI move to frontend
                io.to(`chess_room_${payload.room_id}`).emit('chess_move_received', {
                    room_id: payload.room_id,
                    move: aiMove,
                    game_state: {
                        current_turn: 'white',
                        is_check: false,
                        is_checkmate: false,
                        is_stalemate: false
                    }
                });
                console.log('✅ AI move sent successfully:', aiMove);
            }
            catch (error) {
                console.error('❌ Error generating AI move:', error);
                socket.emit('ai_move_error', {
                    message: 'Failed to generate AI move',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }));
        // AI board state sync handler
        socket.on('chess_board_state_for_ai', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                console.log('�� AI board state sync received:', payload);
                // Update the game state in database with frontend board state
                const { error: updateError } = yield app_1.supabase
                    .from('chess_games')
                    .update({
                    game_state: JSON.stringify(payload.board_state),
                    current_turn: payload.current_turn,
                    updated_at: new Date().toISOString()
                })
                    .eq('room_id', payload.room_id);
                if (updateError) {
                    console.error('❌ Error updating board state:', updateError);
                    socket.emit('chess_sync_error', { message: 'Failed to sync board state' });
                    return;
                }
                console.log('✅ AI board state synchronized');
                // Get AI color from database
                const { data: gameRoom } = yield app_1.supabase
                    .from('chess_games')
                    .select('player_color')
                    .eq('room_id', payload.room_id)
                    .single();
                const aiColor = (gameRoom === null || gameRoom === void 0 ? void 0 : gameRoom.player_color) === 'white' ? 'black' : 'white';
                console.log('🤖 Determined AI color:', aiColor);
                // CRITICAL FIX: Check if it's actually AI's turn before generating move
                if (payload.current_turn !== aiColor) {
                    console.log('🤖 Not AI\'s turn, skipping move generation. Current turn:', payload.current_turn, 'AI color:', aiColor);
                    return;
                }
                console.log('🤖 AI\'s turn detected! Generating move for:', aiColor);
                console.log('🤖 Current turn from payload:', payload.current_turn);
                // Generate AI move with the updated board state
                const aiMove = chess_ai_service_1.chessAIService.generateAIMove(payload.difficulty || 'medium', payload.board_state, aiColor);
                if (!aiMove) {
                    console.log('🤖 No valid AI moves available');
                    socket.emit('ai_move_error', { message: 'No valid AI moves available' });
                    return;
                }
                // Validate the move
                if (!chess_ai_service_1.chessAIService.isValidMove(payload.board_state, aiMove)) {
                    console.log('❌ AI move failed validation');
                    socket.emit('ai_move_error', { message: 'Generated invalid move' });
                    return;
                }
                console.log('✅ Valid AI move generated with synced board:', aiMove);
                // Add natural delay
                setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
                    try {
                        // Save AI move to database
                        yield app_1.supabase
                            .from('chess_moves')
                            .insert([{
                                room_id: payload.room_id,
                                move_number: yield getNextMoveNumber(payload.room_id),
                                from_square: aiMove.from,
                                to_square: aiMove.to,
                                piece: aiMove.piece,
                                captured_piece: aiMove.captured,
                                san: aiMove.san,
                                player_id: aiMove.player_id
                            }]);
                        // Update game state for AI move
                        const newTurn = payload.current_turn === 'white' ? 'black' : 'white';
                        yield app_1.supabase
                            .from('chess_games')
                            .update({
                            current_turn: newTurn,
                            updated_at: new Date().toISOString()
                        })
                            .eq('room_id', payload.room_id);
                        // Send AI move to frontend
                        io.to(`chess_room_${payload.room_id}`).emit('chess_move_received', {
                            room_id: payload.room_id,
                            move: aiMove,
                            game_state: {
                                current_turn: newTurn,
                                is_check: false,
                                is_checkmate: false,
                                is_stalemate: false
                            }
                        });
                        console.log('✅ AI move generated and sent with synced board:', aiMove);
                    }
                    catch (error) {
                        console.error('❌ Error processing synced AI move:', error);
                        socket.emit('ai_move_error', {
                            message: 'Failed to process AI move',
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                }), Math.random() * 2000 + 2000);
            }
            catch (error) {
                console.error('❌ Error in AI board state sync:', error);
                socket.emit('chess_sync_error', {
                    message: 'Failed to sync board state',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }));
        // AI move retry handler
        socket.on('ai_move_retry', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const maxRetries = 3;
                const retryCount = payload.retry_count || 0;
                console.log(`🤖 AI move retry attempt ${retryCount + 1}/${maxRetries + 1}:`, payload.room_id);
                if (retryCount >= maxRetries) {
                    console.log('❌ Max retry attempts reached for AI move');
                    socket.emit('ai_move_error', { message: 'Max retry attempts reached' });
                    return;
                }
                // CRITICAL FIX: Check if it's actually AI's turn before generating move
                const { data: currentGame } = yield app_1.supabase
                    .from('chess_games')
                    .select('current_turn, player_color')
                    .eq('room_id', payload.room_id)
                    .single();
                const aiColor = (currentGame === null || currentGame === void 0 ? void 0 : currentGame.player_color) === 'white' ? 'black' : 'white';
                if ((currentGame === null || currentGame === void 0 ? void 0 : currentGame.current_turn) !== aiColor) {
                    console.log('🤖 Not AI\'s turn, skipping retry. Current turn:', currentGame === null || currentGame === void 0 ? void 0 : currentGame.current_turn, 'AI color:', aiColor);
                    // Don't send error to prevent frontend loops - just quietly ignore
                    return;
                }
                // Generate new AI move with current board state
                const aiMove = chess_ai_service_1.chessAIService.generateAIMove(payload.difficulty || 'medium', payload.board_state);
                if (!aiMove) {
                    console.log('🤖 No valid AI moves available for retry');
                    socket.emit('ai_move_error', { message: 'No valid AI moves available' });
                    return;
                }
                // Validate the move
                if (!chess_ai_service_1.chessAIService.isValidMove(payload.board_state, aiMove)) {
                    console.log('❌ AI retry move failed validation, trying again...');
                    // Recursive retry with increased count
                    setTimeout(() => {
                        socket.emit('ai_move_retry', Object.assign(Object.assign({}, payload), { retry_count: retryCount + 1 }));
                    }, 500);
                    return;
                }
                console.log('✅ Valid AI retry move generated:', aiMove);
                // Add delay before sending retry move
                setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
                    try {
                        // Save AI move to database
                        yield app_1.supabase
                            .from('chess_moves')
                            .insert([{
                                room_id: payload.room_id,
                                move_number: yield getNextMoveNumber(payload.room_id),
                                from_square: aiMove.from,
                                to_square: aiMove.to,
                                piece: aiMove.piece,
                                captured_piece: aiMove.captured,
                                san: aiMove.san,
                                player_id: aiMove.player_id
                            }]);
                        // Update game state for AI move
                        const newTurn = payload.current_turn === 'white' ? 'black' : 'white';
                        yield app_1.supabase
                            .from('chess_games')
                            .update({
                            current_turn: newTurn,
                            updated_at: new Date().toISOString()
                        })
                            .eq('room_id', payload.room_id);
                        // Send AI move to frontend
                        io.to(`chess_room_${payload.room_id}`).emit('chess_move_received', {
                            room_id: payload.room_id,
                            move: aiMove,
                            game_state: {
                                current_turn: newTurn,
                                is_check: false,
                                is_checkmate: false,
                                is_stalemate: false
                            }
                        });
                        console.log('✅ AI retry move sent successfully:', aiMove);
                    }
                    catch (error) {
                        console.error('❌ Error processing AI retry move:', error);
                        socket.emit('ai_move_error', {
                            message: 'Failed to process AI retry move',
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                }), Math.random() * 2000 + 2000);
            }
            catch (error) {
                console.error('❌ Error in AI move retry:', error);
                socket.emit('ai_move_error', {
                    message: 'Failed to retry AI move',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }));
        // AI game status handler
        socket.on('get_ai_game_status', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                console.log('�� AI game status requested:', payload.room_id);
                const { data: gameRoom, error } = yield app_1.supabase
                    .from('chess_games')
                    .select('*')
                    .eq('room_id', payload.room_id)
                    .eq('is_ai_game', true)
                    .single();
                if (error || !gameRoom) {
                    socket.emit('ai_game_status_error', { message: 'AI game not found' });
                    return;
                }
                socket.emit('ai_game_status', {
                    room_id: gameRoom.room_id,
                    ai_difficulty: gameRoom.ai_difficulty,
                    player_color: gameRoom.player_color,
                    current_turn: gameRoom.current_turn,
                    game_status: gameRoom.game_status,
                    is_ai_game: gameRoom.is_ai_game
                });
                console.log('✅ AI game status sent:', gameRoom.room_id);
            }
            catch (error) {
                console.error('❌ Error getting AI game status:', error);
                socket.emit('ai_game_status_error', {
                    message: 'Failed to get AI game status',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }));
        // Track moves and update board state
        socket.on('track_move', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                console.log('📝 Tracking move:', payload.move);
                // Save move to database
                yield app_1.supabase
                    .from('chess_moves')
                    .insert([{
                        room_id: payload.room_id,
                        move_number: yield getNextMoveNumber(payload.room_id),
                        from_square: payload.move.from,
                        to_square: payload.move.to,
                        piece: payload.move.piece,
                        captured_piece: payload.move.captured || null,
                        san: `${payload.move.from}-${payload.move.to}`,
                        player_id: payload.move.player_id
                    }]);
                // Update game state with new board state
                yield app_1.supabase
                    .from('chess_games')
                    .update({
                    game_state: JSON.stringify(payload.board_state),
                    current_turn: payload.move.player_id === 'AI_PLAYER' ? 'white' : 'black',
                    updated_at: new Date().toISOString()
                })
                    .eq('room_id', payload.room_id);
                console.log('✅ Move tracked and board state updated');
            }
            catch (error) {
                console.error('❌ Error tracking move:', error);
            }
        }));
        // Simple AI move request with current board state
        socket.on('simple_ai_move', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                console.log('🤖 Simple AI move requested');
                // Get AI color from database
                const { data: gameRoom } = yield app_1.supabase
                    .from('chess_games')
                    .select('player_color')
                    .eq('room_id', payload.room_id)
                    .single();
                const aiColor = (gameRoom === null || gameRoom === void 0 ? void 0 : gameRoom.player_color) === 'white' ? 'black' : 'white';
                // Generate AI move with current board state
                const aiMove = chess_ai_service_1.chessAIService.generateAIMove('medium', payload.board_state, aiColor);
                if (aiMove) {
                    // Track the AI move
                    yield app_1.supabase
                        .from('chess_moves')
                        .insert([{
                            room_id: payload.room_id,
                            move_number: yield getNextMoveNumber(payload.room_id),
                            from_square: aiMove.from,
                            to_square: aiMove.to,
                            piece: aiMove.piece,
                            captured_piece: aiMove.captured,
                            san: aiMove.san,
                            player_id: 'AI_PLAYER'
                        }]);
                    // Send AI move to frontend
                    io.to(`chess_room_${payload.room_id}`).emit('ai_move', aiMove);
                    console.log('✅ AI move sent:', aiMove);
                }
                else {
                    console.log('❌ No valid AI moves available');
                }
            }
            catch (error) {
                console.error('❌ Simple AI move error:', error);
            }
        }));
        // Get current board state from database
        socket.on('get_board_state', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                console.log('🔍 Getting board state for room:', payload.room_id);
                // Get current game state
                const { data: gameRoom } = yield app_1.supabase
                    .from('chess_games')
                    .select('game_state, current_turn')
                    .eq('room_id', payload.room_id)
                    .single();
                let boardState = null;
                if (gameRoom && gameRoom.game_state) {
                    try {
                        boardState = JSON.parse(gameRoom.game_state);
                    }
                    catch (e) {
                        boardState = gameRoom.game_state;
                    }
                }
                // If no board state, reconstruct from moves
                if (!boardState || !boardState.a8) {
                    const { data: moves } = yield app_1.supabase
                        .from('chess_moves')
                        .select('*')
                        .eq('room_id', payload.room_id)
                        .order('move_number', { ascending: true });
                    if (moves && moves.length > 0) {
                        boardState = chess_ai_service_1.chessAIService.reconstructBoardFromMoves(payload.room_id, moves);
                    }
                    else {
                        boardState = chess_ai_service_1.chessAIService.getInitialBoardState();
                    }
                }
                // Send board state back to frontend
                socket.emit('board_state_received', {
                    room_id: payload.room_id,
                    board_state: boardState,
                    current_turn: (gameRoom === null || gameRoom === void 0 ? void 0 : gameRoom.current_turn) || 'white'
                });
                console.log('✅ Board state sent to frontend');
            }
            catch (error) {
                console.error('❌ Error getting board state:', error);
            }
        }));
    });
};
exports.registerChessAIHandlers = registerChessAIHandlers;
