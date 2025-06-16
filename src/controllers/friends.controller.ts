import { Request, Response } from 'express';
import { supabase } from '../app';
import { sendNotification } from '../sockets/emitNotification';

// Send friend request
const sendFriendRequest = async (req: Request, res: Response) => {
  try {
    const { senderId, receiverId } = req.body;

    // Check if friendship already exists
    const { data: existingFriendship } = await supabase
      .from('friendships')
      .select('*')
      .or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`)
      .single();

    if (existingFriendship) {
      res.status(400).json({
        success: false,
        message: 'Friend request already exists or you are already friends'
      });
      return;
    }

    // Get sender and receiver info
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', senderId)
      .single();

    const { data: receiverProfile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', receiverId)
      .single();

    if (!senderProfile || !receiverProfile) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }
    // Create friendship record
    const { data: friendship, error } = await supabase
      .from('friendships')
      .insert([{
        sender_id: senderId,
        receiver_id: receiverId,
        status: 'pending'
      }])
      .select()
      .single();

    if (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    // Send notification to receiver
    const senderName = `${senderProfile.first_name} ${senderProfile.last_name || ''}`.trim();
    console.log('Triggering notification for friend request:', {
      recipientEmail: receiverProfile.email,
      recipientUserId: receiverId,
      actorUserId: senderId,
      friendshipId: friendship.id
    });
    await sendNotification({
      recipientEmail: receiverProfile.email,
      recipientUserId: receiverId,
      actorUserId: senderId,
      threadId: null, // Not used for friendships
      message: `**${senderName}** sent you a _friend request_`,
      type: 'friend_request_received',
      metadata: {
        friendship_id: friendship.id, // Link to friendship
        sender_name: senderName,
        sender_id: senderId
      }
    });
     res.json({
      success: true,
      data: friendship,
      message: 'Friend request sent successfully'
    });
    return;
  } catch (error) {
    console.error('Error sending friend request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
    return;
  }
};

// Accept friend request
const acceptFriendRequest = async (req: Request, res: Response) => {
  try {
    const { friendshipId, userId } = req.body;

    // Get friendship details
    const { data: friendship } = await supabase
      .from('friendships')
      .select(`
        *,
        sender:profiles!friendships_sender_id_fkey(first_name, last_name, email),
        receiver:profiles!friendships_receiver_id_fkey(first_name, last_name, email)
      `)
      .eq('id', friendshipId)
      .single();

    if (!friendship) {
      res.status(404).json({
        success: false,
        message: 'Friend request not found'
      });
      return;
    }

    // Update friendship status
    const { data: updatedFriendship, error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId)
      .select()
      .single();

    if (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    // Send notification to sender
    const accepterName = friendship.receiver_id === userId 
      ? `${friendship.receiver.first_name} ${friendship.receiver.last_name || ''}`.trim()
      : `${friendship.sender.first_name} ${friendship.sender.last_name || ''}`.trim();
    
    const senderEmail = friendship.sender.email;
    
    await sendNotification({
  recipientEmail: senderEmail,
  recipientUserId: friendship.sender_id,
  actorUserId: userId,
  threadId: '', // Not used for friendships
  message: `**${accepterName}** accepted your _friend request_`,
  type: 'friend_request_accepted',
  metadata: {
    friendship_id: friendshipId,
    accepter_name: accepterName,
    accepter_id: userId
  }
});

     res.json({
      success: true,
      data: updatedFriendship,
      message: 'Friend request accepted'
    });
    return;
  } catch (error) {
    console.error('Error accepting friend request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
    return;
  }
};

// Reject friend request
const rejectFriendRequest = async (req: Request, res: Response) => {
  try {
    const { friendshipId } = req.body;

    const { data, error } = await supabase
      .from('friendships')
      .update({ status: 'rejected' })
      .eq('id', friendshipId)
      .select()
      .single();
if (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

     res.json({
      success: true,
      data,
      message: 'Friend request rejected'
    });
    return;
  } catch (error) {
    console.error('Error rejecting friend request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
    return;
  }
};


export {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
};