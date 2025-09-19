import { Request, Response } from 'express';
import { supabase } from '../app';
import { sendInvitationEmail } from '../config/mailer';

export const sendEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, relation, invited_email } = req.body;
    const inviter_user_id = (req as any).user?.id; // Get user ID from auth middleware
    
    if (!inviter_user_id) {
      res.status(401).json({ 
        error: 'User not authenticated',
        code: 'unauthorized'
      });
      return;
    }

    const { data: existingUser } = await supabase
      .from('anamcara_users')
      .select('id')
      .eq('email', invited_email)
      .single();

    if (existingUser) {
      res.status(400).json({ 
        error: 'User with this email already exists',
        code: 'email_exists'
      });
      return;
    }

    await sendInvitationEmail(invited_email, name, relation);

    const { data: invitationData, error: dbError } = await supabase
      .from('anam_family_invitations')
      .insert({
        inviter_user_id: inviter_user_id,
        name: name,
        relation: relation,
        invited_email: invited_email,
        acceptance_status: 'pending'
      })
      .select()
      .single();

    if (dbError) {
      throw dbError;
    }
    
    res.status(200).json({ 
      message: 'Invitation sent successfully',
      data: invitationData
    });
  } catch (error) {
    res.status(500).json({ error: error });
  }
};