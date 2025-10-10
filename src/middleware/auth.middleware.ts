import { Request, Response, NextFunction } from 'express';
import { supabase } from '../app';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (req.originalUrl.startsWith('/api/auth') || req.originalUrl === '/health') {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: No token provided',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid token',
      });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized: User profile not found'
      });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email || '',
      role: profile.role || 'user',
      ...profile
    };

    next();
  } catch (error: any) {
    console.error('Auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication'
    });
  }
};

export const requireRole = (role: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized: User not authenticated',
      });
      return;
    }

    console.log(req.user, role)
    if (req.user.role !== role) {
      res.status(403).json({
        success: false,
        message: `Access denied: Requires ${role} role`
      });
      return;
    }

    next();
  };
};

export const superAdminMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: User not authenticated',
    });
    return;
  }

  if (req.user.role !== 'superadmin') {
    res.status(403).json({
      success: false,
      message: 'Access denied: Requires superadmin role',
    });
    return;
  }

  next();
};

export const optionalAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (!error && user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (!profileError && profile) {
          req.user = {
            id: user.id,
            email: user.email || '',
            role: profile.role || 'user',
            ...profile
          };

        }
      }
    } catch (err: any) {
      console.warn('Optional auth middleware error:', err.message);
    }
  }

  next();
};