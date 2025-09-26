import { supabase } from '../app';

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
    
    console.log(' AI using board state:', board);
    
    const possibleMoves = this.findPossibleMoves(board, aiColor || 'black');
    
    console.log(' Found possible moves:', possibleMoves.length);
    
    if (possibleMoves.length === 0) {
      console.log('🤖 No possible moves for AI');
      return null;
    }

    let selectedMove;
    switch (difficulty) {
      case 'easy':
        selectedMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        break;
      case 'medium':
        const capturingMoves = possibleMoves.filter(move => move.captured);
        selectedMove = capturingMoves.length > 0 
          ? capturingMoves[Math.floor(Math.random() * capturingMoves.length)]
          : possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        break;
      case 'hard':
        const centerMoves = possibleMoves.filter(move => 
          this.isCenterSquare(move.to) || move.captured
        );
        selectedMove = centerMoves.length > 0 
          ? centerMoves[Math.floor(Math.random() * centerMoves.length)]
          : possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        break;
      default:
        selectedMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
    }

    if (!selectedMove.from || !selectedMove.to || !selectedMove.piece) {
      console.log('❌ Invalid move generated:', selectedMove);
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

  isAITurn(gameRoom: any, currentTurn: string): boolean {
    if (!gameRoom.is_ai_game) return false;
    
    const aiColor = gameRoom.player_color === 'white' ? 'black' : 'white';
    return currentTurn === aiColor;
  },

  getInitialBoardState(): any {
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

  fenToBoard(fen: string): any {
    const board: { [key: string]: string | null } = {};
    const parts = fen.split(' ');
    const position = parts[0];
    
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

  findPossibleMoves(board: any, color: 'white' | 'black'): any[] {
    const moves = [];
    const piecePrefix = color === 'white' ? 'w' : 'b';
    
    for (const square in board) {
      const piece = board[square];
      if (piece && piece.startsWith(piecePrefix)) {
        const pieceMoves = this.getPieceMoves(square, piece, board);
        moves.push(...pieceMoves);
      }
    }
    
    return moves;
  },

  getPieceMoves(square: string, piece: string, board: any): any[] {
    const moves = [];
    
    switch (piece) {
      // Black pieces
      case 'bp': moves.push(...this.getPawnMoves(square, 'black', board)); break;
      case 'bN': moves.push(...this.getKnightMoves(square, board)); break;
      case 'bB': moves.push(...this.getBishopMoves(square, board)); break;
      case 'bR': moves.push(...this.getRookMoves(square, board)); break;
      case 'bQ': moves.push(...this.getQueenMoves(square, board)); break;
      case 'bK': moves.push(...this.getKingMoves(square, board)); break;
      
      // White pieces
      case 'wp': moves.push(...this.getPawnMoves(square, 'white', board)); break;
      case 'wN': moves.push(...this.getKnightMoves(square, board)); break;
      case 'wB': moves.push(...this.getBishopMoves(square, board)); break;
      case 'wR': moves.push(...this.getRookMoves(square, board)); break;
      case 'wQ': moves.push(...this.getQueenMoves(square, board)); break;
      case 'wK': moves.push(...this.getKingMoves(square, board)); break;
    }
    
    return moves;
  },

  getPawnMoves(square: string, color: 'white' | 'black', board: any): any[] {
    const moves = [];
    const [file, rank] = square.split('');
    const fileNum = file.charCodeAt(0) - 97;
    const rankNum = parseInt(rank);
    
    const direction = color === 'white' ? 1 : -1;
    const startRank = color === 'white' ? 2 : 7;
    
    const newRank = rankNum + direction;
    let newSquare = null;
    
    if (newRank >= 1 && newRank <= 8) {
      newSquare = file + newRank;
      if (!board[newSquare]) {
        moves.push({
          from: square,
          to: newSquare,
          piece: color === 'white' ? 'wp' : 'bp',
          captured: null,
          san: newSquare
        });
      }
    }
    
    if (rankNum === startRank) {
      const doubleMoveRank = rankNum + (2 * direction);
      if (doubleMoveRank >= 1 && doubleMoveRank <= 8) {
        const doubleMoveSquare = file + doubleMoveRank;
        if (!board[doubleMoveSquare] && (!newSquare || !board[newSquare])) {
          moves.push({
            from: square,
            to: doubleMoveSquare,
            piece: color === 'white' ? 'wp' : 'bp',
            captured: null,
            san: doubleMoveSquare
          });
        }
      }
    }
    
    const captureLeft = String.fromCharCode(fileNum - 1 + 97) + newRank;
    const captureRight = String.fromCharCode(fileNum + 1 + 97) + newRank;
    
    if (fileNum > 0 && board[captureLeft] && board[captureLeft].startsWith(color === 'white' ? 'b' : 'w')) {
      moves.push({
        from: square,
        to: captureLeft,
        piece: color === 'white' ? 'wp' : 'bp',
        captured: board[captureLeft],
        san: file + 'x' + captureLeft
      });
    }
    
    if (fileNum < 7 && board[captureRight] && board[captureRight].startsWith(color === 'white' ? 'b' : 'w')) {
      moves.push({
        from: square,
        to: captureRight,
        piece: color === 'white' ? 'wp' : 'bp',
        captured: board[captureRight],
        san: file + 'x' + captureRight
      });
    }
    
    return moves;
  },

  getKnightMoves(square: string, board: any): any[] {
    const moves = [];
    const [file, rank] = square.split('');
    const fileNum = file.charCodeAt(0) - 97;
    const rankNum = parseInt(rank);
    
    const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    
    for (const [fileOffset, rankOffset] of knightMoves) {
      const newFile = String.fromCharCode(fileNum + fileOffset + 97);
      const newRank = rankNum + rankOffset;
      
      if (newFile >= 'a' && newFile <= 'h' && newRank >= 1 && newRank <= 8) {
        const newSquare = newFile + newRank;
        const targetPiece = board[newSquare];
        const currentPiece = board[square];
        const currentPieceColor = currentPiece.charAt(0);
        
        if (!targetPiece || targetPiece.startsWith(currentPieceColor === 'w' ? 'b' : 'w')) {
          moves.push({
            from: square,
            to: newSquare,
            piece: currentPiece,
            captured: targetPiece,
            san: 'N' + newSquare
          });
        }
      }
    }
    
    return moves;
  },

  getBishopMoves(square: string, board: any): any[] {
    const moves = [];
    const [file, rank] = square.split('');
    const fileNum = file.charCodeAt(0) - 97;
    const rankNum = parseInt(rank);
    
    const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    
    for (const [fileDir, rankDir] of directions) {
      for (let i = 1; i < 8; i++) {
        const newFile = String.fromCharCode(fileNum + (fileDir * i) + 97);
        const newRank = rankNum + (rankDir * i);
        
        if (newFile < 'a' || newFile > 'h' || newRank < 1 || newRank > 8) break;
        
        const newSquare = newFile + newRank;
        const targetPiece = board[newSquare];
        const currentPiece = board[square];
        const currentPieceColor = currentPiece.charAt(0);
        
        if (!targetPiece) {
          moves.push({
            from: square,
            to: newSquare,
            piece: currentPiece,
            captured: null,
            san: 'B' + newSquare
          });
        } else if (targetPiece.startsWith(currentPieceColor === 'w' ? 'b' : 'w')) {
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

  getRookMoves(square: string, board: any): any[] {
    const moves = [];
    const [file, rank] = square.split('');
    const fileNum = file.charCodeAt(0) - 97;
    const rankNum = parseInt(rank);
    
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    
    for (const [fileDir, rankDir] of directions) {
      for (let i = 1; i < 8; i++) {
        const newFile = String.fromCharCode(fileNum + (fileDir * i) + 97);
        const newRank = rankNum + (rankDir * i);
        
        if (newFile < 'a' || newFile > 'h' || newRank < 1 || newRank > 8) break;
        
        const newSquare = newFile + newRank;
        const targetPiece = board[newSquare];
        const currentPiece = board[square];
        const currentPieceColor = currentPiece.charAt(0);
        
        if (!targetPiece) {
          moves.push({
            from: square,
            to: newSquare,
            piece: currentPiece,
            captured: null,
            san: 'R' + newSquare
          });
        } else if (targetPiece.startsWith(currentPieceColor === 'w' ? 'b' : 'w')) {
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

  getQueenMoves(square: string, board: any): any[] {
    return [...this.getBishopMoves(square, board), ...this.getRookMoves(square, board)];
  },

  getKingMoves(square: string, board: any): any[] {
    const moves = [];
    const [file, rank] = square.split('');
    const fileNum = file.charCodeAt(0) - 97;
    const rankNum = parseInt(rank);
    
    const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    
    for (const [fileDir, rankDir] of directions) {
      const newFile = String.fromCharCode(fileNum + fileDir + 97);
      const newRank = rankNum + rankDir;
      
      if (newFile >= 'a' && newFile <= 'h' && newRank >= 1 && newRank <= 8) {
        const newSquare = newFile + newRank;
        const targetPiece = board[newSquare];
        const currentPiece = board[square];
        const currentPieceColor = currentPiece.charAt(0);
        
        if (!targetPiece || targetPiece.startsWith(currentPieceColor === 'w' ? 'b' : 'w')) {
          moves.push({
            from: square,
            to: newSquare,
            piece: currentPiece,
            captured: targetPiece,
            san: 'K' + newSquare
          });
        }
      }
    }
    
    return moves;
  },

  isCenterSquare(square: string): boolean {
    const [file, rank] = square.split('');
    const fileNum = file.charCodeAt(0) - 97;
    const rankNum = parseInt(rank);
    
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
    
    if (!board[move.from] || board[move.from] !== move.piece) {
      return false;
    }
    
    const targetPiece = board[move.to];
    if (targetPiece && targetPiece.startsWith(move.piece.charAt(0))) {
      return false;
    }
    
    return true;
  },

  reconstructBoardFromMoves(roomId: string, moves: any[]): any {
    const board = this.getInitialBoardState();
    
    for (const move of moves) {
      if (move.from_square && move.to_square && move.piece) {
        board[move.to_square] = move.piece;
        board[move.from_square] = null;
      }
    }
    
    return board;
  }
};
//