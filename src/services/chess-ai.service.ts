import { supabase } from '../app';

interface ChessMove {
  from: string;
  to: string;
  piece: string;
  captured: string | null;
  san: string;
  isCastling?: boolean;
  isEnPassant?: boolean;
  promotion?: string;
}

interface GameState {
  board: { [key: string]: string | null };
  currentTurn: 'white' | 'black';
  castlingRights: {
    whiteKing: boolean;
    whiteQueen: boolean;
    blackKing: boolean;
    blackQueen: boolean;
  };
  enPassantTarget: string | null;
  halfMoveClock: number;
  fullMoveNumber: number;
  whiteKing?: string;
  blackKing?: string;
}

export const chessAIService = {
  async createAIGame(userId: string, difficulty: 'easy' | 'medium' | 'hard' = 'medium', playerColor: 'white' | 'black' = 'white') {
    const roomId = `chess_ai_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    const gameRoomData = {
      room_id: roomId,
      white_player_id: playerColor === 'white' ? userId : null,
      black_player_id: playerColor === 'black' ? userId : null,
      current_turn: 'white',
      game_status: 'active',
      game_state: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      game_settings: {
        time_control: 'rapid',
        difficulty: difficulty,
        ai_game: true,
        player_color: playerColor
      },
      is_ai_game: true,
      ai_difficulty: difficulty,
      player_color: playerColor,
      created_at: new Date().toISOString()
    };

    const { data: gameRoom, error } = await supabase
      .from('chess_games')
      .insert([gameRoomData])
      .select()
      .single();

    if (error) throw error;

    return {
      room_id: roomId,
      game_room: gameRoom,
      ai_difficulty: difficulty,
      player_color: playerColor
    };
  },

  generateAIMove(difficulty: 'easy' | 'medium' | 'hard' = 'medium', currentBoardState?: any, aiColor?: 'white' | 'black'): any {
    let board = currentBoardState;
    
    if (!board) {
      board = this.getInitialBoardState();
    }
    
    if (typeof board === 'string') {
      board = this.fenToBoard(board);
    }
    
    console.log('🤖 AI using board state:', board);
    
    // Find all pieces of the AI color
    const aiColorPrefix = aiColor === 'white' ? 'w' : 'b';
    const aiPieces = [];
    for (const [square, piece] of Object.entries(board)) {
      if (piece && (piece as string).startsWith(aiColorPrefix)) {
        aiPieces.push({ square, piece: piece as string });
      }
    }
    
    console.log(`🤖 Found ${aiColor} pieces:`, aiPieces);
    
    // Get valid moves for ALL piece types
    const allValidMoves = [];
    
    for (const { square, piece } of aiPieces) {
      const gameState: GameState = {
        board,
        currentTurn: aiColor || 'black',
        castlingRights: {
          whiteKing: true,
          whiteQueen: true,
          blackKing: true,
          blackQueen: true
        },
        enPassantTarget: null,
        halfMoveClock: 0,
        fullMoveNumber: 1,
        whiteKing: this.findKing(board, 'w') || undefined,
        blackKing: this.findKing(board, 'b') || undefined
      };
      
      const pieceMoves = this.getPieceMoves(square, piece, gameState);
      allValidMoves.push(...pieceMoves);
    }
    
    console.log('🤖 All valid moves found:', allValidMoves.length);
    
    if (allValidMoves.length === 0) {
      console.log('🤖 No valid moves available');
      return null;
    }
    
    // Filter out moves that would put own king in check
    const legalMoves = allValidMoves.filter(move => !this.wouldPutKingInCheck(move, {
      board,
      currentTurn: aiColor || 'black',
      castlingRights: {
        whiteKing: true,
        whiteQueen: true,
        blackKing: true,
        blackQueen: true
      },
      enPassantTarget: null,
      halfMoveClock: 0,
      fullMoveNumber: 1,
      whiteKing: this.findKing(board, 'w') || undefined,
      blackKing: this.findKing(board, 'b') || undefined
    }));
    
    console.log('🤖 Legal moves after check validation:', legalMoves.length);
    
    if (legalMoves.length === 0) {
      console.log('🤖 No legal moves available (all would put king in check)');
      return null;
    }
    
    let selectedMove;
    switch (difficulty) {
      case 'easy':
        selectedMove = this.selectEasyMove(legalMoves, {
          board,
          currentTurn: aiColor || 'black',
          castlingRights: {
            whiteKing: true,
            whiteQueen: true,
            blackKing: true,
            blackQueen: true
          },
          enPassantTarget: null,
          halfMoveClock: 0,
          fullMoveNumber: 1,
          whiteKing: this.findKing(board, 'w') || undefined,
          blackKing: this.findKing(board, 'b') || undefined
        });
        break;
      case 'medium':
        selectedMove = this.selectMediumMove(legalMoves, {
          board,
          currentTurn: aiColor || 'black',
          castlingRights: {
            whiteKing: true,
            whiteQueen: true,
            blackKing: true,
            blackQueen: true
          },
          enPassantTarget: null,
          halfMoveClock: 0,
          fullMoveNumber: 1,
          whiteKing: this.findKing(board, 'w') || undefined,
          blackKing: this.findKing(board, 'b') || undefined
        });
        break;
      case 'hard':
        selectedMove = this.selectHardMove(legalMoves, {
          board,
          currentTurn: aiColor || 'black',
          castlingRights: {
            whiteKing: true,
            whiteQueen: true,
            blackKing: true,
            blackQueen: true
          },
          enPassantTarget: null,
          halfMoveClock: 0,
          fullMoveNumber: 1,
          whiteKing: this.findKing(board, 'w') || undefined,
          blackKing: this.findKing(board, 'b') || undefined
        });
        break;
      default:
        selectedMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    }

    if (!selectedMove) {
      console.log('❌ No valid move selected');
      return null;
    }

    console.log('✅ Valid AI move selected:', selectedMove);

    return {
      from: selectedMove.from,
      to: selectedMove.to,
      piece: selectedMove.piece,
      captured: selectedMove.captured || null,
      san: selectedMove.san || `${selectedMove.from}-${selectedMove.to}`,
      player_id: 'AI_PLAYER',
      timestamp: new Date().toISOString(),
      ai_move: true,
      type: selectedMove.piece.charAt(1).toLowerCase(),
      color: selectedMove.piece.charAt(0)
    };
  },

  getAllLegalMoves(gameState: GameState): ChessMove[] {
    const moves: ChessMove[] = [];
    const piecePrefix = gameState.currentTurn === 'white' ? 'w' : 'b';
    
    for (const square in gameState.board) {
      const piece = gameState.board[square];
      if (piece && piece.startsWith(piecePrefix)) {
        const pieceMoves = this.getPieceMoves(square, piece, gameState);
        moves.push(...pieceMoves);
      }
    }
    
    // Filter out moves that would put own king in check
    return moves.filter(move => !this.wouldPutKingInCheck(move, gameState));
  },

  getPieceMoves(square: string, piece: string, gameState: GameState): ChessMove[] {
    const moves: ChessMove[] = [];
    
    switch (piece) {
      // Black pieces - using correct notation from board state
      case 'bP': moves.push(...this.getPawnMoves(square, 'black', gameState)); break;
      case 'bN': moves.push(...this.getKnightMoves(square, gameState)); break;
      case 'bB': moves.push(...this.getBishopMoves(square, gameState)); break;
      case 'bR': moves.push(...this.getRookMoves(square, gameState)); break;
      case 'bQ': moves.push(...this.getQueenMoves(square, gameState)); break;
      case 'bK': moves.push(...this.getKingMoves(square, gameState)); break;
      
      // White pieces - using correct notation from board state
      case 'wP': moves.push(...this.getPawnMoves(square, 'white', gameState)); break;
      case 'wN': moves.push(...this.getKnightMoves(square, gameState)); break;
      case 'wB': moves.push(...this.getBishopMoves(square, gameState)); break;
      case 'wR': moves.push(...this.getRookMoves(square, gameState)); break;
      case 'wQ': moves.push(...this.getQueenMoves(square, gameState)); break;
      case 'wK': moves.push(...this.getKingMoves(square, gameState)); break;
    }
    
    return moves;
  },

  getPawnMoves(square: string, color: 'white' | 'black', gameState: GameState): ChessMove[] {
    const moves: ChessMove[] = [];
    const [file, rank] = square.split('');
    const fileNum = file.charCodeAt(0) - 97;
    const rankNum = parseInt(rank);
    
    const direction = color === 'white' ? 1 : -1;
    const startRank = color === 'white' ? 2 : 7;
    const pieceNotation = color === 'white' ? 'wP' : 'bP'; // Use uppercase P
    const promotionRank = color === 'white' ? 8 : 1;
    
    // Forward move
    const newRank = rankNum + direction;
    if (newRank >= 1 && newRank <= 8) {
      const newSquare = file + newRank;
      if (!gameState.board[newSquare]) {
        // Check for pawn promotion
        if (newRank === promotionRank) {
          // Promote to Queen, Rook, Bishop, or Knight
          const promotionPieces = ['Q', 'R', 'B', 'N'];
          for (const piece of promotionPieces) {
            moves.push({
              from: square,
              to: newSquare,
              piece: color === 'white' ? 'w' + piece : 'b' + piece,
              captured: null,
              san: newSquare + '=' + piece,
              promotion: piece
            });
          }
        } else {
          moves.push({
            from: square,
            to: newSquare,
            piece: pieceNotation,
            captured: null,
            san: newSquare
          });
        }
        
        // Double move from starting position
        if (rankNum === startRank) {
          const doubleMoveRank = rankNum + (2 * direction);
          if (doubleMoveRank >= 1 && doubleMoveRank <= 8) {
            const doubleMoveSquare = file + doubleMoveRank;
            if (!gameState.board[doubleMoveSquare]) {
              moves.push({
                from: square,
                to: doubleMoveSquare,
                piece: pieceNotation,
                captured: null,
                san: doubleMoveSquare
              });
            }
          }
        }
      }
    }
    
    // Captures
    const captureRank = rankNum + direction;
    if (captureRank >= 1 && captureRank <= 8) {
      // Left capture
      if (fileNum > 0) {
        const captureLeft = String.fromCharCode(fileNum - 1 + 97) + captureRank;
        const targetPiece = gameState.board[captureLeft];
        if (targetPiece && targetPiece.startsWith(color === 'white' ? 'b' : 'w')) {
          // Check for pawn promotion with capture
          if (captureRank === promotionRank) {
            const promotionPieces = ['Q', 'R', 'B', 'N'];
            for (const piece of promotionPieces) {
              moves.push({
                from: square,
                to: captureLeft,
                piece: color === 'white' ? 'w' + piece : 'b' + piece,
                captured: targetPiece,
                san: file + 'x' + captureLeft + '=' + piece,
                promotion: piece
              });
            }
          } else {
            moves.push({
              from: square,
              to: captureLeft,
              piece: pieceNotation,
              captured: targetPiece,
              san: file + 'x' + captureLeft
            });
          }
        }
      }
      
      // Right capture
      if (fileNum < 7) {
        const captureRight = String.fromCharCode(fileNum + 1 + 97) + captureRank;
        const targetPiece = gameState.board[captureRight];
        if (targetPiece && targetPiece.startsWith(color === 'white' ? 'b' : 'w')) {
          // Check for pawn promotion with capture
          if (captureRank === promotionRank) {
            const promotionPieces = ['Q', 'R', 'B', 'N'];
            for (const piece of promotionPieces) {
              moves.push({
                from: square,
                to: captureRight,
                piece: color === 'white' ? 'w' + piece : 'b' + piece,
                captured: targetPiece,
                san: file + 'x' + captureRight + '=' + piece,
                promotion: piece
              });
            }
          } else {
            moves.push({
              from: square,
              to: captureRight,
              piece: pieceNotation,
              captured: targetPiece,
              san: file + 'x' + captureRight
            });
          }
        }
      }
    }
    
    return moves;
  },

  getKnightMoves(square: string, gameState: GameState): ChessMove[] {
    const moves: ChessMove[] = [];
    const [file, rank] = square.split('');
    const fileNum = file.charCodeAt(0) - 97;
    const rankNum = parseInt(rank);
    const currentPiece = gameState.board[square];
    
    if (!currentPiece) return moves;
    
    const currentPieceColor = currentPiece.charAt(0);
    
    const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    
    for (const [fileOffset, rankOffset] of knightMoves) {
      const newFileNum = fileNum + fileOffset;
      const newRankNum = rankNum + rankOffset;
      
      if (newFileNum >= 0 && newFileNum <= 7 && newRankNum >= 1 && newRankNum <= 8) {
        const newFile = String.fromCharCode(newFileNum + 97);
        const newSquare = newFile + newRankNum;
        const targetPiece = gameState.board[newSquare];
        
        if (!targetPiece || targetPiece.charAt(0) !== currentPieceColor) {
          moves.push({
            from: square,
            to: newSquare,
            piece: currentPiece,
            captured: targetPiece,
            san: targetPiece ? 'Nx' + newSquare : 'N' + newSquare
          });
        }
      }
    }
    
    return moves;
  },

  getBishopMoves(square: string, gameState: GameState): ChessMove[] {
    const moves: ChessMove[] = [];
    const [file, rank] = square.split('');
    const fileNum = file.charCodeAt(0) - 97;
    const rankNum = parseInt(rank);
    const currentPiece = gameState.board[square];
    
    if (!currentPiece) return moves;
    
    const currentPieceColor = currentPiece.charAt(0);
    
    const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    
    for (const [fileDir, rankDir] of directions) {
      for (let i = 1; i < 8; i++) {
        const newFileNum = fileNum + (fileDir * i);
        const newRankNum = rankNum + (rankDir * i);
        
        if (newFileNum < 0 || newFileNum > 7 || newRankNum < 1 || newRankNum > 8) break;
        
        const newFile = String.fromCharCode(newFileNum + 97);
        const newSquare = newFile + newRankNum;
        const targetPiece = gameState.board[newSquare];
        
        if (!targetPiece) {
          moves.push({
            from: square,
            to: newSquare,
            piece: currentPiece,
            captured: null,
            san: 'B' + newSquare
          });
        } else if (targetPiece.charAt(0) !== currentPieceColor) {
          moves.push({
            from: square,
            to: newSquare,
            piece: currentPiece,
            captured: targetPiece,
            san: 'Bx' + newSquare
          });
          break;
        } else {
          break;
        }
      }
    }
    
    return moves;
  },

  getRookMoves(square: string, gameState: GameState): ChessMove[] {
    const moves: ChessMove[] = [];
    const [file, rank] = square.split('');
    const fileNum = file.charCodeAt(0) - 97;
    const rankNum = parseInt(rank);
    const currentPiece = gameState.board[square];
    
    if (!currentPiece) return moves;
    
    const currentPieceColor = currentPiece.charAt(0);
    
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    
    for (const [fileDir, rankDir] of directions) {
      for (let i = 1; i < 8; i++) {
        const newFileNum = fileNum + (fileDir * i);
        const newRankNum = rankNum + (rankDir * i);
        
        if (newFileNum < 0 || newFileNum > 7 || newRankNum < 1 || newRankNum > 8) break;
        
        const newFile = String.fromCharCode(newFileNum + 97);
        const newSquare = newFile + newRankNum;
        const targetPiece = gameState.board[newSquare];
        
        if (!targetPiece) {
          moves.push({
            from: square,
            to: newSquare,
            piece: currentPiece,
            captured: null,
            san: 'R' + newSquare
          });
        } else if (targetPiece.charAt(0) !== currentPieceColor) {
          moves.push({
            from: square,
            to: newSquare,
            piece: currentPiece,
            captured: targetPiece,
            san: 'Rx' + newSquare
          });
          break;
        } else {
          break;
        }
      }
    }
    
    return moves;
  },

  getQueenMoves(square: string, gameState: GameState): ChessMove[] {
    return [...this.getBishopMoves(square, gameState), ...this.getRookMoves(square, gameState)];
  },

  getKingMoves(square: string, gameState: GameState): ChessMove[] {
    const moves: ChessMove[] = [];
    const [file, rank] = square.split('');
    const fileNum = file.charCodeAt(0) - 97;
    const rankNum = parseInt(rank);
    const currentPiece = gameState.board[square];
    
    if (!currentPiece) return moves;
    
    const currentPieceColor = currentPiece.charAt(0);
    
    const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    
    for (const [fileDir, rankDir] of directions) {
      const newFileNum = fileNum + fileDir;
      const newRankNum = rankNum + rankDir;
      
      if (newFileNum >= 0 && newFileNum <= 7 && newRankNum >= 1 && newRankNum <= 8) {
        const newFile = String.fromCharCode(newFileNum + 97);
        const newSquare = newFile + newRankNum;
        const targetPiece = gameState.board[newSquare];
        
        if (!targetPiece || targetPiece.charAt(0) !== currentPieceColor) {
          moves.push({
            from: square,
            to: newSquare,
            piece: currentPiece,
            captured: targetPiece,
            san: targetPiece ? 'Kx' + newSquare : 'K' + newSquare
          });
        }
      }
    }
    
    return moves;
  },

  wouldPutKingInCheck(move: ChessMove, gameState: GameState): boolean {
    // Create a copy of the board
    const newBoard = { ...gameState.board };
    
    // Make the move on the copy
    newBoard[move.to] = move.piece;
    newBoard[move.from] = null;
    
    // Handle special moves
    if (move.isCastling) {
      // Move the rook
      if (move.to === 'g1') {
        newBoard['f1'] = 'wR';
        newBoard['h1'] = null;
      } else if (move.to === 'c1') {
        newBoard['d1'] = 'wR';
        newBoard['a1'] = null;
      } else if (move.to === 'g8') {
        newBoard['f8'] = 'bR';
        newBoard['h8'] = null;
      } else if (move.to === 'c8') {
        newBoard['d8'] = 'bR';
        newBoard['a8'] = null;
      }
    }
    
    if (move.isEnPassant) {
      // Remove the captured pawn
      const capturedRank = move.to.charAt(1);
      const capturedFile = move.to.charAt(0);
      const capturedSquare = capturedFile + (move.piece.charAt(0) === 'w' ? '5' : '4');
      newBoard[capturedSquare] = null;
    }
    
    // Find the king of the moving color
    const kingColor = move.piece.charAt(0) as 'w' | 'b';
    const kingSquare = this.findKing(newBoard, kingColor);
    
    if (!kingSquare) {
      return false;
    }
    
    // Check if any opponent piece can attack the king
    const opponentColor = kingColor === 'w' ? 'black' : 'white';
    const opponentMoves = this.getAllMovesWithoutCheckValidation(newBoard, opponentColor);
    
    return opponentMoves.some(opponentMove => opponentMove.to === kingSquare);
  },

  getAllMovesWithoutCheckValidation(board: { [key: string]: string | null }, color: 'white' | 'black'): ChessMove[] {
    const moves: ChessMove[] = [];
    const piecePrefix = color === 'white' ? 'w' : 'b';
    
    // Find king positions
    const whiteKing = this.findKing(board, 'w');
    const blackKing = this.findKing(board, 'b');
    
    const gameState: GameState = {
      board,
      currentTurn: color,
      castlingRights: {
        whiteKing: true,
        whiteQueen: true,
        blackKing: true,
        blackQueen: true
      },
      enPassantTarget: null,
      halfMoveClock: 0,
      fullMoveNumber: 1,
      whiteKing: whiteKing || undefined,
      blackKing: blackKing || undefined
    };
    
    for (const square in board) {
      const piece = board[square];
      if (piece && piece.startsWith(piecePrefix)) {
        const pieceMoves = this.getPieceMoves(square, piece, gameState);
        moves.push(...pieceMoves);
      }
    }
    
    return moves;
  },

  findKing(board: { [key: string]: string | null }, color: 'w' | 'b'): string | null {
    for (const square in board) {
      const piece = board[square];
      if (piece === `${color}K`) {
        return square;
      }
    }
    return null;
  },

  isInCheck(board: { [key: string]: string | null }, color: 'white' | 'black'): boolean {
    const kingColor = color === 'white' ? 'w' : 'b';
    const kingSquare = this.findKing(board, kingColor);
    
    if (!kingSquare) {
      return false;
    }
    
    const opponentColor = color === 'white' ? 'black' : 'white';
    const opponentMoves = this.getAllMovesWithoutCheckValidation(board, opponentColor);
    
    return opponentMoves.some(move => move.to === kingSquare);
  },

  isCheckmate(board: { [key: string]: string | null }, color: 'white' | 'black'): boolean {
    // Check if king is in check
    if (!this.isInCheck(board, color)) {
      return false;
    }
    
    // Check if any legal moves exist
    const gameState: GameState = {
      board,
      currentTurn: color,
      castlingRights: {
        whiteKing: true,
        whiteQueen: true,
        blackKing: true,
        blackQueen: true
      },
      enPassantTarget: null,
      halfMoveClock: 0,
      fullMoveNumber: 1
    };
    
    const legalMoves = this.getAllLegalMoves(gameState);
    return legalMoves.length === 0;
  },

  isStalemate(board: { [key: string]: string | null }, color: 'white' | 'black'): boolean {
    // Check if king is not in check
    if (this.isInCheck(board, color)) {
      return false;
    }
    
    // Check if any legal moves exist
    const gameState: GameState = {
      board,
      currentTurn: color,
      castlingRights: {
        whiteKing: true,
        whiteQueen: true,
        blackKing: true,
        blackQueen: true
      },
      enPassantTarget: null,
      halfMoveClock: 0,
      fullMoveNumber: 1
    };
    
    const legalMoves = this.getAllLegalMoves(gameState);
    return legalMoves.length === 0;
  },

  selectMediumMove(moves: ChessMove[], gameState: GameState): ChessMove {
    // Use same algorithm as hard but with simpler scoring
    const scoredMoves = moves.map(move => ({
      ...move,
      score: this.evaluateMove(move, gameState)
    }));
    
    scoredMoves.sort((a, b) => b.score - a.score);
    
    // Select from top 2 moves to make AI more challenging (less random)
    const topMoves = scoredMoves.slice(0, 2);
    return topMoves[Math.floor(Math.random() * topMoves.length)];
  },

  selectEasyMove(moves: ChessMove[], gameState: GameState): ChessMove {
    // Priority: 1. Checkmate (if obvious), 2. Captures, 3. Random
    
    // First check for obvious checkmate moves
    for (const move of moves) {
      const newBoard = { ...gameState.board };
      newBoard[move.to] = move.piece;
      newBoard[move.from] = null;
      
      const opponentColor = gameState.currentTurn === 'white' ? 'black' : 'white';
      
      if (this.isCheckmate(newBoard, opponentColor)) {
        console.log('🎯 EASY: Checkmate detected!', move.from, '->', move.to);
        return move;
      }
    }
    
    // Then prioritize captures
    const capturingMoves = moves.filter(move => move.captured);
    if (capturingMoves.length > 0) {
      return capturingMoves[Math.floor(Math.random() * capturingMoves.length)];
    }
    
    // Otherwise random move
    return moves[Math.floor(Math.random() * moves.length)];
  },

  selectHardMove(moves: ChessMove[], gameState: GameState): ChessMove {
    // Priority: 1. Checkmate, 2. High-value captures, 3. Threats, 4. King safety, 5. Development
    const scoredMoves = moves.map(move => ({
      ...move,
      score: this.evaluateMove(move, gameState)
    }));
    
    scoredMoves.sort((a, b) => b.score - a.score);
    
    // Select from top 2 moves to make AI more challenging (less random)
    const topMoves = scoredMoves.slice(0, 2);
    return topMoves[Math.floor(Math.random() * topMoves.length)];
  },

  evaluateMove(move: ChessMove, gameState: GameState): number {
    console.log('🔍 Evaluating move:', move.from, '->', move.to);
    
    let score = 0;
    
    // Check if this move results in checkmate (highest priority)
    const newBoard = { ...gameState.board };
    newBoard[move.to] = move.piece;
    newBoard[move.from] = null;
    
    const opponentColor = gameState.currentTurn === 'white' ? 'black' : 'white';
    
    // Debug: Show what we're checking for checkmate
    console.log('🔍 Checking for checkmate against:', opponentColor);
    
    try {
      if (this.isCheckmate(newBoard, opponentColor)) {
        console.log('🎯 CHECKMATE DETECTED! Move:', move.from, '->', move.to);
        score += 1000; // Checkmate is the highest priority
        return score;
      }
      
      // Check if this move puts opponent in check
      if (this.isInCheck(newBoard, opponentColor)) {
        console.log('⚡ CHECK DETECTED! Move:', move.from, '->', move.to);
        score += 50; // Putting opponent极 in check is valuable
      }
    } catch (error) {
      console.error('❌ Error in checkmate/check detection:', error);
    }
    
    // Capture value - use proper piece values
    if (move.captured) {
      const pieceValues: { [key: string]: number } = { 
        'P': 1, 'p': 1, 
        'N': 3, 'n': 3, 
        'B': 3, 'b': 3, 
        'R': 5, 'r': 5, 
        'Q': 9, 'q': 9, 
        'K': 0, 'k': 0 
      };
      const pieceType = move.captured.charAt(1);
      score += pieceValues[pieceType] || 0;
    }
    
    // Center control - more valuable squares
    if (this.isCenterSquare(move.to)) {
      score += 1.0;
    }
    
    // Extended center
    if (this.isExtendedCenter(move.to)) {
      score += 0.5;
    }
    
    // King safety - move king to safety
    if (move.piece.charAt(1) === 'K' && this.isKingSafeSquare(move.to, gameState)) {
      score += 2.0;
    }
    
    // Piece development (moving from back rank)
    const fromRank = parseInt(move.from.charAt(1));
    if ((move.piece.charAt(0) === 'w' && fromRank === 1) || 
        (move.piece.charAt(0) === 'b' && fromRank === 8)) {
      score += 0.3;
    }
    
    // Check if move creates threats
    if (this.createsThreat(move, gameState)) {
      score += 1.5;
    }
    
    // Penalize moving into attacked squares
    if (this.isSquareAttacked(move.to, gameState)) {
      score -= 1.0;
    }
    
    return score;
  },

  createsThreat(move: ChessMove, gameState: GameState): boolean {
    // Simple threat detection - if move attacks opponent pieces
    const newBoard = { ...gameState.board };
    newBoard[move.to] = move.piece;
    newBoard[move.from] = null;
    
    // Check if the move attacks any opponent pieces
    const opponentColor = move.piece.charAt(0) === 'w' ? 'b' : 'w';
    for (const [square, piece] of Object.entries(newBoard)) {
      if (piece && piece.charAt(0) === opponentColor && this.canSquareBeAttacked(square, newBoard, move.piece.charAt(0))) {
        return true;
      }
    }
    
    return false;
  },

  isSquareAttacked(square: string, gameState: GameState): boolean {
    // Check if square is attacked by opponent pieces
    const opponentColor = gameState.currentTurn === 'white' ? 'black' : 'white';
    const opponentMoves = this.getAllMovesWithoutCheckValidation(gameState.board, opponentColor);
    return opponentMoves.some(m => m.to === square);
  },

  isKingSafeSquare(square: string, gameState: GameState): boolean {
    // Check if king would be safe on this square
    return !this.isSquareAttacked(square, gameState);
  },

  canSquareBeAttacked(square: string, board: { [key: string]: string | null }, attackerColor: string): boolean {
    // Check if a square can be attacked by pieces of given color
    const tempGameState: GameState = {
      board,
      currentTurn: attackerColor === 'w' ? 'white' : 'black',
      castlingRights: { whiteKing: true, whiteQueen: true, blackKing: true, blackQueen: true },
      enPassantTarget: null,
      halfMoveClock: 0,
      fullMoveNumber: 1
    };
    
    const attackerMoves = this.getAllMovesWithoutCheckValidation(board, attackerColor === 'w' ? 'white' : 'black');
    return attackerMoves.some(m => m.to === square);
  },

  isDevelopmentMove(move: ChessMove): boolean {
    const piece = move.piece.charAt(1);
    const fromRank = parseInt(move.from.charAt(1));
    const pieceColor = move.piece.charAt(0);
    
    // Knights and bishops developing from back rank
    if ((piece === 'N' || piece === 'B') && 
        ((pieceColor === 'w' && fromRank === 1) || (pieceColor === 'w' && fromRank === 2))) {
      return true;
    }
    
    // Pawns advancing
    if (piece === 'p' && 
        ((pieceColor === 'w' && fromRank <= 3) || (pieceColor === 'b' && fromRank >= 6))) {
      return true;
    }
    
    return false;
  },

  isCenterSquare(square: string): boolean {
    const [file, rank] = square.split('');
    const fileNum = file.charCodeAt(0) - 97;
    const rankNum = parseInt(rank);
    
    // True center squares: d4, d5, e4, e5
    return (fileNum === 3 || fileNum === 4) && (rankNum === 4 || rankNum === 5);
  },

  isExtendedCenter(square: string): boolean {
    const [file, rank] = square.split('');
    const fileNum = file.charCodeAt(0) - 97;
    const rankNum = parseInt(rank);
    
    // Extended center squares: c3-f6
    return fileNum >= 2 && fileNum <= 5 && rankNum >= 3 && rankNum <= 6;
  },

  isValidMove(boardState: any, move: any): boolean {
    if (!move || !move.from || !move.to || !move.piece) {
      return false;
    }
    
    let board = boardState;
    
    if (!board) {
      board = this.getInitialBoardState();
    }
    
    if (typeof board === 'string') {
      board = this.fenToBoard(board);
    }
    
    // Check if the piece exists at the source square
    if (!board[move.from] || board[move.from] !== move.piece) {
      return false;
    }
    
    // Check if destination square is not occupied by same color piece
    const targetPiece = board[move.to];
    if (targetPiece && targetPiece.charAt(0) === move.piece.charAt(0)) {
      return false;
    }
    
    // Check if trying to capture king
    if (targetPiece && targetPiece.charAt(1) === 'K') {
      return false;
    }
    
    // Create game state for validation
    const gameState: GameState = {
      board,
      currentTurn: move.piece.charAt(0) === 'w' ? 'white' : 'black',
      castlingRights: {
        whiteKing: true,
        whiteQueen: true,
        blackKing: true,
        blackQueen: true
      },
      enPassantTarget: null,
      halfMoveClock: 0,
      fullMoveNumber: 1
    };
    
    // Validate that it's a legal move for the piece type
    const possibleMoves = this.getPieceMoves(move.from, move.piece, gameState);
    const isValidPieceMove = possibleMoves.some(m => m.to === move.to);
    
    if (!isValidPieceMove) {
      return false;
    }
    
    // Check if move would put own king in check
    return !this.wouldPutKingInCheck(move, gameState);
  },

  isAITurn(gameRoom: any, currentTurn: string): boolean {
    if (!gameRoom.is_ai_game) return false;
    
    const aiColor = gameRoom.player_color === 'white' ? 'black' : 'white';
    return currentTurn === aiColor;
  },

  getInitialBoardState(): { [key: string]: string | null } {
    return {
      'a8': 'bR', 'b8': 'bN', 'c8': 'bB', 'd8': 'bQ', 'e8': 'bK', 'f8': 'bB', 'g8': 'bN', 'h8': 'bR',
      'a7': 'bp', 'b7': 'bp', 'c7': 'bp', 'd7': 'bp', 'e7': 'bp', 'f7': 'bp', 'g7': 'bp', 'h7': 'bp',
      'a6': null, 'b6': null, 'c6': null, 'd6': null, 'e6': null, 'f6': null, 'g6': null, 'h6': null,
      'a5': null, 'b5': null, 'c5': null, 'd5': null, 'e5': null, 'f5': null, 'g5': null, 'h5': null,
      'a4': null, 'b4': null, 'c4': null, 'd4': null, 'e4': null, 'f4': null, 'g4': null, 'h4': null,
      'a3': null, 'b3': null, 'c3': null, 'd3': null, 'e3': null, 'f3': null, 'g3': null, 'h3': null,
      'a2': 'wp', 'b2': 'wp', 'c2': 'wp', 'd2': 'wp', 'e2': 'wp', 'f2': 'wp', 'g2': 'wp', 'h2': 'wp',
      'a1': 'wR', 'b1': 'wN', 'c1': 'wB', 'd1': 'wQ', 'e1': 'wK', 'f1': 'wB', 'g1': 'wN', 'h1': 'wR'
    };
  },

  fenToBoard(fen: string): { [key: string]: string | null } {
    const board: { [key: string]: string | null } = {};
    const parts = fen.split(' ');
    const position = parts[0];
    
    // Initialize all squares to null
    for (let rank = 1; rank <= 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const square = String.fromCharCode(97 + file) + rank;
        board[square] = null;
      }
    }
    
    let rank = 8;
    let file = 0;
    
    for (const char of position) {
      if (char === '/') {
        rank--;
        file = 0;
      } else if (char >= '1' && char <= '8') {
        file += parseInt(char);
      } else {
        const square = String.fromCharCode(97 + file) + rank;
        let piece = char;
        
        if (char >= 'a' && char <= 'z') {
          piece = 'b' + char.toUpperCase();
        } else {
          piece = 'w' + char;
        }
        
        board[square] = piece;
        file++;
      }
    }
    
    return board;
  },

  reconstructBoardFromMoves(roomId: string, moves: any[]): any {
    const board = this.getInitialBoardState();
    
    for (const move of moves) {
      if (move.from_square && move.to_square && move.piece) {
        // Move the piece
        board[move.to_square] = move.piece;
        board[move.from_square] = null;
      }
    }
    
    return board;
  },

  validateBoardState(boardState: any): boolean {
    return true;
  }
};