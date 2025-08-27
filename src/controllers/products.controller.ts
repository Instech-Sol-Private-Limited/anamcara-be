import { Request, Response } from 'express';
import { supabase } from '../app';
import { sendNotification } from '../sockets/emitNotification';
import {
  processAnamCoinsTransaction,
  processAccessBonusTransaction,
  recordAnamCoinsHistory,
  recordSoulPointsHistory,
} from '../services/products.service'

interface CreateDigitalAssetRequest {
  title: string;
  description: string;
  tags: string[];
  priceAnamCoins: number;
  redeemAccessBonus: boolean;
  visibility: string;
  license: string;
  assets: string[];
  thumbnail: string[];
  creatorId: string;
}

interface UpdateProductRequest {
  title?: string;
  description?: string;
  tags?: string[];
  priceAnamCoins?: number;
  redeemAccessBonus?: boolean;
  visibility?: string;
  license?: string;
  assets?: string[];
  thumbnail?: string[];
  status?: 'pending' | 'approved' | 'rejected';
}

interface PurchaseRequest {
  productId: string;
  purchaseType: 'self' | 'gift';
  recipientId?: string;
  currencyType: 'AC' | 'AB';
}

interface ResaleRequest {
  libraryItemId: string;
  newPrice: number;
  currencyType: 'AC';
}


const createDigitalAsset = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title,
      description,
      tags,
      priceAnamCoins,
      redeemAccessBonus,
      license,
      assets,
      thumbnail,
      creatorId
    } = req.body as CreateDigitalAssetRequest;

    const { data: product, error: dbError } = await supabase
      .from('products')
      .insert({
        title,
        description,
        tags,
        price_anam_coins: priceAnamCoins,
        redeem_access_bonus: redeemAccessBonus,
        visibility: 'public',
        license,
        assets,
        thumbnail,
        creator_id: creatorId,
        status: 'pending'
      })
      .select()
      .single();

    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }

    if (!product) {
      throw new Error('No product data returned from database');
    }

    res.status(201).json({
      success: true,
      message: 'Digital asset created successfully. Pending admin approval.',
      product
    });

  } catch (error: any) {
    console.error('Error creating digital asset:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create digital asset'
    });
  }
};

const getProductsByUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    // First, get all products for the user
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select(`
        *,
        creator:profiles (
          id,
          first_name,
          last_name,
          email,
          avatar_url
        )
      `)
      .eq('creator_id', userId)
      .order('created_at', { ascending: false });

    if (productsError) {
      throw new Error(`Database error: ${productsError.message}`);
    }

    // Get active boosts for these products
    const productIds = products?.map(p => p.id) || [];
    let boostedProductsMap = new Map();

    if (productIds.length > 0) {
      const { data: boosts, error: boostsError } = await supabase
        .from('boosts')
        .select('*')
        .in('product_id', productIds)
        .gt('end_time', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (boostsError) {
        console.error('Error fetching boosts:', boostsError.message);
      } else {
        // Create a map of product_id to boost data
        boosts?.forEach(boost => {
          boostedProductsMap.set(boost.product_id, boost);
        });
      }
    }
    // Enhance products with boost information
    const productsWithBoost = products?.map(product => {
      const boostData = boostedProductsMap.get(product.id);

      return {
        ...product,
        is_boosted: !!boostData,
        boost_details: boostData || null
      };
    }) || [];

    res.status(200).json({
      success: true,
      products: productsWithBoost
    });

  } catch (error: any) {
    console.error('Error fetching user products:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch user products'
    });
  }
};

// const getApprovedProducts = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { search, tags, sortBy = 'created_at', sortOrder = 'desc' } = req.query;
//     let query = supabase
//       .from('products')
//       .select(`
//         *,
//         creator:profiles (
//           id,
//           first_name,
//           last_name,
//           email,
//           avatar_url
//         )
//       `)
//       .eq('status', 'approved')
//       .eq('visibility', 'public')
//       .order(sortBy as string, { ascending: sortOrder === 'asc' });

//     if (search) {
//       query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
//     }

//     if (tags) {
//       const tagArray = (tags as string).split(',');
//       query = query.contains('tags', tagArray);
//     }

//     const { data: products, error } = await query;

//     if (error) {
//       throw new Error(`Database error: ${error.message}`);
//     }

//     const transformedProducts = products?.map(product => ({
//       ...product,
//       creator_id: product.creator?.id || product.creator_id,
//       creator: {
//         first_name: product.creator?.first_name || null,
//         last_name: product.creator?.last_name || null,
//         email: product.creator?.email || null,
//         avatar_url: product.creator?.avatar_url || null
//       }
//     })) || [];

//     res.status(200).json({
//       success: true,
//       products: transformedProducts
//     });

//   } catch (error: any) {
//     console.error('Error fetching approved products:', error);
//     res.status(500).json({
//       success: false,
//       message: error.message || 'Failed to fetch approved products'
//     });
//   }
// };

const getApprovedProducts = async (req: Request, res: Response): Promise<any> => {
  try {
    const { search, tags, sortBy = 'created_at', sortOrder = 'desc' } = req.query;
    const userId = req.user?.id;

    let baseQuery = supabase
      .from('products')
      .select(`
        *,
        creator:profiles (
          id,
          first_name,
          last_name,
          email,
          avatar_url
        )
      `)
      .eq('status', 'approved')
      .eq('visibility', 'public');

    if (search) {
      baseQuery = baseQuery.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    if (tags) {
      const tagArray = (tags as string).split(',');
      baseQuery = baseQuery.contains('tags', tagArray);
    }

    const { data: allProducts, error } = await baseQuery;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!userId || !allProducts || allProducts.length === 0) {
      const transformedProducts = allProducts?.map(product => ({
        ...product,
        creator_id: product.creator?.id || product.creator_id,
        creator: {
          first_name: product.creator?.first_name || null,
          last_name: product.creator?.last_name || null,
          email: product.creator?.email || null,
          avatar_url: product.creator?.avatar_url || null
        }
      })) || [];

      return res.status(200).json({
        success: true,
        products: transformedProducts
      });
    }

    const { data: userPreferences } = await supabase
      .from('user_preferences')
      .select('product_keywords')
      .eq('user_id', userId)
      .single();

    const userKeywords = userPreferences?.product_keywords || {};

    const productsWithScores = allProducts.map(product => {
      const productTags = product.tags || [];
      let preferenceScore = 0;

      productTags.forEach((tag: any) => {
        const cleanTag = tag.toLowerCase().trim();
        preferenceScore += userKeywords[cleanTag] || 0;
      });

      const averageRating = product.average_rating || 0;

      const newnessScore = new Date(product.created_at).getTime();

      return {
        ...product,
        preferenceScore,
        averageRating,
        newnessScore
      };
    });

    const preferredProducts = productsWithScores
      .filter(product => product.preferenceScore > 0)
      .sort((a, b) => b.preferenceScore - a.preferenceScore);

    const topRatedProducts = productsWithScores
      .filter(product => product.averageRating > 0)
      .sort((a, b) => b.averageRating - a.averageRating);

    const newProducts = productsWithScores
      .sort((a, b) => b.newnessScore - a.newnessScore);

    const totalProducts = allProducts.length;
    const preferredCount = Math.floor(totalProducts * 0.5);
    const topRatedCount = Math.floor(totalProducts * 0.3);
    const newCount = Math.floor(totalProducts * 0.2);

    const selectedPreferred = preferredProducts.slice(0, preferredCount);
    const selectedTopRated = topRatedProducts
      .filter(product => !selectedPreferred.includes(product))
      .slice(0, topRatedCount);
    const selectedNew = newProducts
      .filter(product => !selectedPreferred.includes(product) && !selectedTopRated.includes(product))
      .slice(0, newCount);

    let finalProducts = [...selectedPreferred, ...selectedTopRated, ...selectedNew];

    if (finalProducts.length < totalProducts) {
      const remainingProducts = productsWithScores.filter(
        product => !finalProducts.includes(product)
      );
      finalProducts = [...finalProducts, ...remainingProducts.slice(0, totalProducts - finalProducts.length)];
    }

    const transformedProducts = finalProducts.map(product => ({
      id: product.id,
      created_at: product.created_at,
      title: product.title,
      description: product.description,
      tags: product.tags,
      price_anam_coins: product.price_anam_coins,
      redeem_access_bonus: product.redeem_access_bonus,
      visibility: product.visibility,
      license: product.license,
      assets: product.assets,
      thumbnail: product.thumbnail,
      status: product.status,
      creator_id: product.creator_id,
      updated_at: product.updated_at,
      average_rating: product.average_rating,
      creator: product.creator ? {
        id: product.creator.id,
        first_name: product.creator.first_name,
        last_name: product.creator.last_name,
        email: product.creator.email,
        avatar_url: product.creator.avatar_url
      } : null,
      preference_score: product.preferenceScore,
      calculated_rating: product.averageRating
    }));

    res.status(200).json({
      success: true,
      products: transformedProducts,
      metadata: {
        total: totalProducts,
        preferred: selectedPreferred.length,
        top_rated: selectedTopRated.length,
        new: selectedNew.length,
        user_has_preferences: Object.keys(userKeywords).length > 0
      }
    });

  } catch (error: any) {
    console.error('Error fetching approved products:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch approved products'
    });
  }
};

const getAllProductsForAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, search } = req.query;

    let query = supabase
      .from('products')
      .select(`
        *,
        creator:profiles (
          id,
          first_name,
          last_name,
          email,
          avatar_url
        )
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: products, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    const transformedProducts = products?.map(product => ({
      ...product,
      creator_id: product.creator?.id || product.creator_id,
      creator: {
        first_name: product.creator?.first_name || null,
        last_name: product.creator?.last_name || null,
        email: product.creator?.email || null,
        avatar_url: product.creator?.avatar_url || null
      }
    })) || [];

    res.status(200).json({
      success: true,
      products: transformedProducts
    });

  } catch (error: any) {
    console.error('Error fetching all products for admin:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch products for admin'
    });
  }
};

const getProductDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: productId } = req.params;

    const { data: product, error } = await supabase
      .from('products')
      .select(`
        *,
        creator:profiles (
          id,
          first_name,
          last_name,
          email,
          avatar_url
        )
      `)
      .eq('id', productId)
      .single();

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!product) {
      res.status(404).json({
        success: false,
        message: 'Product not found'
      });
      return;
    }

    const transformedProduct = {
      ...product,
      creator_id: product.creator?.id || product.creator_id,
      creator: {
        first_name: product.creator?.first_name || null,
        last_name: product.creator?.last_name || null,
        email: product.creator?.email || null,
        avatar_url: product.creator?.avatar_url || null
      }
    };

    res.status(200).json({
      success: true,
      product: transformedProduct
    });

  } catch (error: any) {
    console.error('Error fetching product details:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch product details'
    });
  }
};

const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: productId } = req.params;
    const {
      title,
      description,
      tags,
      priceAnamCoins,
      redeemAccessBonus,  // Changed
      visibility,
      license,
      assets,
      thumbnail,  // Added
      status
    } = req.body as UpdateProductRequest;

    const userRole = req.user?.role;

    const { data: existingProduct, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (fetchError) {
      throw new Error(`Database error: ${fetchError.message}`);
    }

    if (!existingProduct) {
      res.status(404).json({
        success: false,
        message: 'Product not found'
      });
      return;
    }

    const isCreator = req.user?.id === existingProduct.creator_id;
    const isAdmin = userRole === 'admin';

    if (!isCreator && !isAdmin) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized to update this product'
      });
      return;
    }

    const updateData: any = {
      title: title || existingProduct.title,
      description: description || existingProduct.description,
      tags: tags || existingProduct.tags,
      price_anam_coins: priceAnamCoins !== undefined ? priceAnamCoins : existingProduct.price_anam_coins,
      redeem_access_bonus: redeemAccessBonus !== undefined ? redeemAccessBonus : existingProduct.redeem_access_bonus,
      visibility: visibility || existingProduct.visibility,
      license: license || existingProduct.license,
      assets: assets || existingProduct.assets,
      thumbnail: thumbnail || existingProduct.thumbnail  // Added
    };

    if (isAdmin && status) {
      updateData.status = status;
    } else if (isCreator && existingProduct.status !== 'pending') {
      updateData.status = 'pending';
    }

    const { data: updatedProduct, error: updateError } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', productId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Database error: ${updateError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product: updatedProduct
    });

  } catch (error: any) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update product'
    });
  }
};

const deleteProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: productId } = req.params;
    const userRole = req.user?.role;

    const { data: existingProduct, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (fetchError) {
      throw new Error(`Database error: ${fetchError.message}`);
    }

    if (!existingProduct) {
      res.status(404).json({
        success: false,
        message: 'Product not found'
      });
      return;
    }

    const isCreator = req.user?.id === existingProduct.creator_id;
    const isAdmin = userRole === 'admin';

    if (!isCreator && !isAdmin) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized to delete this product'
      });
      return;
    }

    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('id', productId);

    if (deleteError) {
      throw new Error(`Database error: ${deleteError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error: any) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete product'
    });
  }
};



// -------------- Product purchase API --------------
const processPurchase = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id!;
    const { productId, purchaseType, recipientId, currencyType } = req.body as PurchaseRequest;

    // Validate request
    if (purchaseType === 'gift' && !recipientId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Recipient ID is required for gift purchases' 
      });
    }

    if (purchaseType === 'gift' && recipientId === userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot gift to yourself' 
      });
    }

    // Get product with creator profile
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*, creator:profiles(id, first_name, last_name, email, avatar_url)')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      throw new Error(productError?.message || 'Product not found');
    }

    if (product.status !== 'approved') {
      return res.status(400).json({ 
        success: false, 
        message: 'Product is not available for purchase' 
      });
    }

    // Currency validation
    if (product.redeem_access_bonus && currencyType === 'AC') {
      return res.status(400).json({
        success: false,
        message: 'This product can only be purchased with Access Bonus (AB)'
      });
    }

    if (!product.redeem_access_bonus && currencyType === 'AB') {
      return res.status(400).json({
        success: false,
        message: 'This product can only be purchased with Anam Coins (AC)'
      });
    }

    const price = product.price_anam_coins;
    const finalRecipientId = purchaseType === 'gift' ? recipientId : userId;

    // Get buyer and recipient profiles
    const { data: buyerProfile } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('id', userId)
      .single();

    if (!buyerProfile) {
      throw new Error('Buyer profile not found');
    }

    const buyerName = `${buyerProfile.first_name} ${buyerProfile.last_name}`.trim();

    // Process payment (AC or AB)
    if (currencyType === 'AC') {
      await processAnamCoinsTransaction(userId, price);
      await recordAnamCoinsHistory({
        userId,
        coinsSpent: price,
        transactionType: purchaseType === 'gift' ? 'gift' : 'purchase',
        description: `Purchased "${product.title}" ${purchaseType === 'gift' ? 'as gift' : ''}`
      });
    } else {
      const spAmount = price * 100;
      await processAccessBonusTransaction(userId, spAmount);
      await recordSoulPointsHistory({
        userId,
        pointsSpent: spAmount,
        action: 'product_purchase',
        description: `Purchased "${product.title}" using ${price} AB (${spAmount} SP)`
      });
    }
    // Create transaction records
    const transactionDate = new Date().toISOString();

    // 1. Create buyer's transaction (purchase or gift)
    const buyerTransactionType = purchaseType === 'gift' ? 'gift' : 'purchase';
    const { data: buyerTransaction, error: buyerTxError } = await supabase
      .from('product_transactions')
      .insert({
        product_id: productId,
        buyer_id: userId,
        recipient_id: finalRecipientId,
        transaction_type: buyerTransactionType,
        amount: price,
        currency_type: currencyType,
        status: 'completed',
        metadata: {
          product_name: product.title,
          product_image: product.cover_image_url,
          purchase_type: purchaseType,
          is_owner: false
        }
      })
      .select()
      .single();

    if (buyerTxError || !buyerTransaction) {
      throw new Error(buyerTxError?.message || 'Failed to create buyer transaction record');
    }

    // 2. Create seller's transaction (if not self-purchase)
    if (product.creator && product.creator.id !== userId) {
      const { error: sellerTxError } = await supabase
        .from('product_transactions')
        .insert({
          product_id: productId,
          buyer_id: userId,
          recipient_id: product.creator.id,
          transaction_type: 'sale',
          amount: price,
          currency_type: currencyType,
          status: 'completed',
          metadata: {
            product_name: product.title,
            product_image: product.cover_image_url,
            buyer_name: buyerName,
            purchase_type: purchaseType,
            is_owner: true
          },
          related_transaction_id: buyerTransaction.id
        });

      if (sellerTxError) {
        console.error('Failed to create seller transaction:', sellerTxError);
      }

      // Update seller's balance
      if (currencyType === 'AC') {
        await supabase.rpc('increment_anam_coins', {
          user_id: product.creator.id,
          amount: price
        });
        await recordAnamCoinsHistory({
          userId: product.creator.id,
          coinsEarned: price,
          transactionType: 'product_sale',
          description: `Sold "${product.title}" to ${buyerName}`
        });
      } else {
        const spAmount = price * 100;
        await supabase.rpc('increment_soul_points', {
          user_id: product.creator.id,
          amount: spAmount
        });
        await recordSoulPointsHistory({
          userId: product.creator.id,
          pointsEarned: spAmount,
          action: 'product_sale',
          description: `Sold "${product.title}" for ${spAmount} SP`
        });
      }
    }

    // Add to library
    const { error: libraryError } = await supabase
      .from('my_library')
      .insert({
        user_id: finalRecipientId,
        product_id: productId,
        transaction_id: buyerTransaction.id,
        license_type: product.license,
      });

    if (libraryError) {
      throw new Error(libraryError.message);
    }

    // Handle notifications
    if (purchaseType === 'gift' && recipientId) {
      // Get recipient profile
      const { data: recipientProfile } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .eq('id', recipientId)
        .single();

      if (recipientProfile) {
        const recipientName = `${recipientProfile.first_name} ${recipientProfile.last_name}`.trim();
        await sendNotification({
          recipientUserId: recipientId,
          recipientEmail: recipientProfile.email,
          threadId: null,
          actorUserId: userId,
          message: `You received a gift: "${product.title}" from ${buyerName}`,
          type: 'gift_received',
          metadata: {
            product_id: productId,
            product_title: product.title,
            transaction_id: buyerTransaction.id
          }
        });
      }

      // Notify creator if different from buyer
      if (product.creator && product.creator.id !== userId) {
        const creatorName = `${product.creator.first_name} ${product.creator.last_name}`.trim();
        await sendNotification({
          recipientUserId: product.creator.id,
          recipientEmail: product.creator.email,
          threadId: null,
          actorUserId: userId,
          message: `Your product "${product.title}" was gifted to ${recipientProfile ? creatorName : 'another user'}`,
          type: 'product_gifted',
          metadata: {
            product_id: productId,
            buyer_id: userId,
            recipient_id: recipientId
          }
        });
      }
    } else if (product.creator && product.creator.id !== userId) {
      // Notify creator for direct purchase
      const creatorName = `${product.creator.first_name} ${product.creator.last_name}`.trim();
      await sendNotification({
        recipientUserId: product.creator.id,
        recipientEmail: product.creator.email,
        threadId: null,
        actorUserId: userId,
        message: `Your product "${product.title}" was purchased by ${buyerName}`,
        type: 'product_sold',
        metadata: {
          product_id: productId,
          buyer_id: userId
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Purchase completed successfully',
      transaction: buyerTransaction,
      addedToLibrary: true
    });

  } catch (error: any) {
    console.error('Error processing purchase:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to process purchase'
    });
  }
};

const getMyLibraryProducts = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { data: libraryItems, error: libraryError } = await supabase
      .from('my_library')
      .select(`
        *,
        product:products (
          *,
          creator:profiles (
            id,
            first_name,
            last_name,
            avatar_url
          )
        ),
        transaction:product_transactions (
          id,
          created_at,
          amount,
          currency_type,
          transaction_type
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (libraryError) {
      throw new Error(libraryError.message);
    }

    // Transform the data for better frontend consumption
    const transformedItems = libraryItems?.map(item => ({
      id: item.id,
      product: {
        ...item.product,
        creator: item.product?.creator || null
      },
      transaction: item.transaction,
      licenseType: item.license_type,
      isResold: item.is_resold,
      availableForResale: item.available_for_resale,
      acquiredAt: item.created_at
    })) || [];

    res.status(200).json({
      success: true,
      items: transformedItems
    });

  } catch (error: any) {
    console.error('Error fetching library items:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch library items'
    });
  }
};

const initiateResale = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { libraryItemId, newPrice, currencyType } = req.body as ResaleRequest;

    // Validate currency type
    if (currencyType !== 'AC') {
      res.status(400).json({
        success: false,
        message: 'Resales can only be done with Anam Coins (AC)'
      });
      return;
    }

    // Get library item details
    const { data: libraryItem, error: fetchError } = await supabase
      .from('my_library')
      .select(`
        *,
        product:products (
          *,
          creator:profiles (
            id
          )
        ),
        transaction:product_transactions (
          *
        )
      `)
      .eq('id', libraryItemId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !libraryItem) {
      throw new Error(fetchError?.message || 'Library item not found');
    }

    // Check if item can be resold
    if (!libraryItem.available_for_resale) {
      res.status(400).json({
        success: false,
        message: 'This item cannot be resold'
      });
      return;
    }

    // Check if price is valid
    if (newPrice <= 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid resale price'
      });
      return;
    }

    // Update library item to mark as available for resale
    const { error: updateError } = await supabase
      .from('my_library')
      .update({
        available_for_resale: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', libraryItemId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Item listed for resale successfully',
      libraryItemId,
      newPrice
    });

  } catch (error: any) {
    console.error('Error initiating resale:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to initiate resale'
    });
  }
};

const completeResale = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { libraryItemId, buyerId } = req.body;

    // Get library item details
    const { data: libraryItem, error: fetchError } = await supabase
      .from('my_library')
      .select(`
        *,
        product:products (
          *,
          creator:profiles (
            id
          )
        ),
        transaction:product_transactions (
          *
        )
      `)
      .eq('id', libraryItemId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !libraryItem) {
      throw new Error(fetchError?.message || 'Library item not found');
    }

    // Check if item is available for resale
    if (!libraryItem.available_for_resale) {
      res.status(400).json({
        success: false,
        message: 'This item is not available for resale'
      });
      return;
    }

    // Get resale price (stored in the library item or product)
    const resalePrice = libraryItem.product?.price_anam_coins || 0;

    // Process payment from buyer to seller
    await processAnamCoinsTransaction(buyerId, resalePrice);

    // Credit seller (original owner)
    const { data: sellerAnamCoins, error: sellerFetchError } = await supabase
      .from('anamcoins')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (sellerFetchError || !sellerAnamCoins) {
      throw new Error(sellerFetchError?.message || 'Seller Anam Coins account not found');
    }

    const { error: creditError } = await supabase
      .from('anamcoins')
      .update({
        available_coins: sellerAnamCoins.available_coins + resalePrice,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (creditError) {
      throw new Error(creditError.message);
    }

    // Create resale transaction
    const { data: transaction, error: transactionError } = await supabase
      .from('product_transactions')
      .insert({
        product_id: libraryItem.product_id,
        buyer_id: buyerId,
        recipient_id: buyerId, // Resale is always direct to buyer
        transaction_type: 'resale',
        amount: resalePrice,
        currency_type: 'AC',
        status: 'completed',
        resale_original_transaction_id: libraryItem.transaction_id,
        resale_price: resalePrice
      })
      .select()
      .single();

    if (transactionError || !transaction) {
      throw new Error(transactionError?.message || 'Failed to create resale transaction');
    }

    // Add to buyer's library
    const { error: buyerLibraryError } = await supabase
      .from('my_library')
      .insert({
        user_id: buyerId,
        product_id: libraryItem.product_id,
        transaction_id: transaction.id,
        license_type: libraryItem.product?.license || 'personal'
      });

    if (buyerLibraryError) {
      throw new Error(buyerLibraryError.message);
    }

    // Mark original item as resold
    const { error: markResoldError } = await supabase
      .from('my_library')
      .update({
        is_resold: true,
        resale_transaction_id: transaction.id,
        available_for_resale: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', libraryItemId);

    if (markResoldError) {
      throw new Error(markResoldError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Resale completed successfully',
      transaction
    });

  } catch (error: any) {
    console.error('Error completing resale:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to complete resale'
    });
  }
};


// -------------- Product reviews API --------------

const getProductReviews = async (req: Request, res: Response): Promise<any> => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, sortBy = 'created_at', order = 'desc' } = req.query;

    const offset = (Number(page) - 1) * Number(limit);

    const { data: reviews, error: reviewsError, count } = await supabase
      .from('reviews')
      .select(`
      id,
      rating,
      title,
      comment,
      helpful_count,
      unhelpful_count,
      created_at,
      updated_at,
      user:profiles(
        id,
        first_name,
        last_name,
        avatar_url
      )
    `, { count: 'exact' })
      .eq('product_id', productId)
      .eq('status', 'active')
      .order(sortBy as string, { ascending: order === 'asc' })
      .range(offset, offset + Number(limit) - 1);

    if (reviewsError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch reviews',
        error: reviewsError.message
      });
    }

    // Get review statistics
    const { data: stats, error: statsError } = await supabase
      .from('product_review_stats')
      .select('*')
      .eq('product_id', productId)
      .single();

    if (statsError && statsError.code !== 'PGRST116') {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch review statistics',
        error: statsError.message
      });
    }

    // Format reviews data
    const formattedReviews = reviews?.map((review: any) => ({
      id: review.id,
      rating: parseFloat(review.rating),
      title: review.title,
      comment: review.comment,
      helpful: review.helpful_count,
      unhelpful: review.unhelpful_count,
      date: review.created_at,
      user: {
        id: review.user?.id,
        name: review.user
          ? `${review.user.first_name || ''} ${review.user.last_name || ''}`.trim()
          : 'Anonymous',
        avatar: review.user?.avatar_url || null
      }
    })) || [];

    const reviewStats = stats ? {
      totalReviews: stats.total_reviews,
      averageRating: parseFloat(stats.average_rating),
      ratingDistribution: {
        5: stats.five_star_count,
        4: stats.four_star_count,
        3: stats.three_star_count,
        2: stats.two_star_count,
        1: stats.one_star_count
      }
    } : {
      totalReviews: 0,
      averageRating: 0,
      ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    };

    res.json({
      success: true,
      data: {
        reviews: formattedReviews,
        statistics: reviewStats,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil((count || 0) / Number(limit)),
          totalItems: count || 0,
          itemsPerPage: Number(limit)
        }
      }
    });

  } catch (error: any) {
    console.error('Error fetching product reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const createReview = async (req: Request, res: Response): Promise<any> => {
  try {
    const { productId } = req.params;
    const { rating, title, comment } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Validation
    if (!rating || !title || !comment) {
      return res.status(400).json({
        success: false,
        message: 'Rating, title, and comment are required'
      });
    }

    if (rating < 0.5 || rating > 5 || (rating * 2) !== Math.floor(rating * 2)) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 0.5 and 5 in 0.5 increments'
      });
    }

    if (title.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Title must be 200 characters or less'
      });
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const { data: existingReview, error: existingError } = await supabase
      .from('reviews')
      .select('id')
      .eq('product_id', productId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      return res.status(500).json({
        success: false,
        message: 'Failed to check existing reviews',
        error: existingError.message
      });
    }

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this product'
      });
    }

    // Create the review
    const { data: newReview, error: createError } = await supabase
      .from('reviews')
      .insert({
        product_id: productId,
        user_id: userId,
        rating,
        title: title.trim(),
        comment: comment.trim()
      })
      .select(`
                id,
                rating,
                title,
                comment,
                helpful_count,
                unhelpful_count,
                created_at,
                user:profiles(
                    id,
                    first_name,
                    last_name,
                    avatar_url
                )
            `)
      .single();

    if (createError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create review',
        error: createError.message
      });
    }

    const formattedReview = {
      id: newReview.id,
      rating: parseFloat(newReview.rating),
      title: newReview.title,
      comment: newReview.comment,
      helpful: newReview.helpful_count,
      unhelpful: newReview.unhelpful_count,
      date: newReview.created_at,
      user: {
        id: (newReview as any).user?.id,
        name: newReview.user ? `${(newReview as any).first_name || ''} ${(newReview as any).last_name || ''}`.trim() : 'Anonymous',
        avatar: (newReview as any).avatar_url || null
      }
    };

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      data: formattedReview
    });

  } catch (error: any) {
    console.error('Error creating review:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const updateReview = async (req: Request, res: Response): Promise<any> => {
  try {
    const { reviewId } = req.params;
    const { rating, title, comment } = req.body;
    const userId = req.user?.id!;

    if (rating !== undefined && (rating < 0.5 || rating > 5 || (rating * 2) !== Math.floor(rating * 2))) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 0.5 and 5 in 0.5 increments'
      });
    }

    if (title !== undefined && title.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Title must be 200 characters or less'
      });
    }

    const { data: existingReview, error: checkError } = await supabase
      .from('reviews')
      .select('id, user_id')
      .eq('id', reviewId)
      .eq('status', 'active')
      .single();

    if (checkError || !existingReview) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    if (existingReview.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own reviews'
      });
    }

    // Build update object
    const updateData: any = { updated_at: new Date().toISOString() };
    if (rating !== undefined) updateData.rating = rating;
    if (title !== undefined) updateData.title = title.trim();
    if (comment !== undefined) updateData.comment = comment.trim();

    // Update the review
    const { data: updatedReview, error: updateError } = await supabase
      .from('reviews')
      .update(updateData)
      .eq('id', reviewId)
      .select(`
        id,
        rating,
        title,
        comment,
        helpful_count,
        unhelpful_count,
        created_at,
        updated_at,
        user:profiles(
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .single();

    if (updateError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update review',
        error: updateError.message
      });
    }

    const formattedReview = {
      id: updatedReview.id,
      rating: parseFloat(updatedReview.rating),
      title: updatedReview.title,
      comment: updatedReview.comment,
      helpful: updatedReview.helpful_count,
      unhelpful: updatedReview.unhelpful_count,
      date: updatedReview.created_at,
      user: {
        id: (updatedReview as any).user?.id,
        name: (updatedReview as any).user
          ? `${(updatedReview as any).user.first_name || ''} ${(updatedReview as any).user.last_name || ''}`.trim()
          : 'Anonymous',
        avatar: (updatedReview as any).user?.avatar_url || null
      }
    };

    res.json({
      success: true,
      message: 'Review updated successfully',
      data: formattedReview
    });

  } catch (error: any) {
    console.error('Error updating review:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const deleteReview = async (req: Request, res: Response): Promise<any> => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Check if review exists and belongs to user
    const { data: existingReview, error: checkError } = await supabase
      .from('reviews')
      .select('id, user_id')
      .eq('id', reviewId)
      .eq('status', 'active')
      .single();

    if (checkError || !existingReview) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    if (existingReview.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own reviews'
      });
    }

    // Soft delete the review
    const { error: deleteError } = await supabase
      .from('reviews')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', reviewId);

    if (deleteError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete review',
        error: deleteError.message
      });
    }

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });

  } catch (error: any) {
    console.error('Error deleting review:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const voteOnReview = async (req: Request, res: Response): Promise<any> => {
  try {
    const { reviewId } = req.params;
    const { voteType } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!['helpful', 'unhelpful'].includes(voteType)) {
      return res.status(400).json({
        success: false,
        message: 'Vote type must be either "helpful" or "unhelpful"'
      });
    }

    // Check if review exists
    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .select('id, user_id')
      .eq('id', reviewId)
      .eq('status', 'active')
      .single();

    if (reviewError || !review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Prevent users from voting on their own reviews
    if (review.user_id === userId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot vote on your own review'
      });
    }

    // Check if user has already voted
    const { data: existingVote, error: voteError } = await supabase
      .from('review_votes')
      .select('id, vote_type')
      .eq('review_id', reviewId)
      .eq('user_id', userId)
      .single();

    if (voteError && voteError.code !== 'PGRST116') {
      return res.status(500).json({
        success: false,
        message: 'Failed to check existing vote',
        error: voteError.message
      });
    }

    let result;

    if (existingVote) {
      if (existingVote.vote_type === voteType) {
        // Remove the vote if same type
        const { error: deleteError } = await supabase
          .from('review_votes')
          .delete()
          .eq('id', existingVote.id);

        if (deleteError) {
          return res.status(500).json({
            success: false,
            message: 'Failed to remove vote',
            error: deleteError.message
          });
        }

        result = { action: 'removed', voteType };
      } else {
        // Update to new vote type
        const { error: updateError } = await supabase
          .from('review_votes')
          .update({ vote_type: voteType })
          .eq('id', existingVote.id);

        if (updateError) {
          return res.status(500).json({
            success: false,
            message: 'Failed to update vote',
            error: updateError.message
          });
        }

        result = { action: 'updated', voteType };
      }
    } else {
      // Create new vote
      const { error: createError } = await supabase
        .from('review_votes')
        .insert({
          review_id: reviewId,
          user_id: userId,
          vote_type: voteType
        });

      if (createError) {
        return res.status(500).json({
          success: false,
          message: 'Failed to create vote',
          error: createError.message
        });
      }

      result = { action: 'created', voteType };
    }

    // Get updated vote counts
    const { data: updatedReview, error: fetchError } = await supabase
      .from('reviews')
      .select('helpful_count, unhelpful_count')
      .eq('id', reviewId)
      .single();

    if (fetchError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch updated counts',
        error: fetchError.message
      });
    }

    res.json({
      success: true,
      message: `Vote ${result.action} successfully`,
      data: {
        helpful: updatedReview.helpful_count,
        unhelpful: updatedReview.unhelpful_count,
        action: result.action,
        voteType: result.voteType
      }
    });

  } catch (error: any) {
    console.error('Error voting on review:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const getUserReviews = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    const { page = 1, limit = 10 } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const offset = (Number(page) - 1) * Number(limit);

    const { data: reviews, error: reviewsError, count } = await supabase
      .from('reviews')
      .select(`
                id,
                rating,
                title,
                comment,
                helpful_count,
                unhelpful_count,
                created_at,
                updated_at,
                product:products(
                    id,
                    title,
                    thumbnail
                )
            `, { count: 'exact' })
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (reviewsError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch user reviews',
        error: reviewsError.message
      });
    }

    const formattedReviews = reviews?.map(review => ({
      id: review.id,
      rating: parseFloat(review.rating),
      title: review.title,
      comment: review.comment,
      helpful: review.helpful_count,
      unhelpful: review.unhelpful_count,
      date: review.created_at,
      product: {
        id: review.product[0]?.id,
        title: review.product[0]?.title,
        thumbnail: review.product[0]?.thumbnail?.[0] || null
      }
    })) || [];

    res.json({
      success: true,
      data: {
        reviews: formattedReviews,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil((count || 0) / Number(limit)),
          totalItems: count || 0,
          itemsPerPage: Number(limit)
        }
      }
    });

  } catch (error: any) {
    console.error('Error fetching user reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// -------------- Product boost or promotion--------------
const createBoost = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id!;
    const { product_id, boost_type, boost_percentage, boost_duration, boost_cost } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Use Supabase's transaction capability
    const { data: result, error: transactionError } = await supabase.rpc('create_boost_transaction', {
      p_user_id: userId,
      p_product_id: product_id,
      p_boost_type: boost_type,
      p_boost_percentage: boost_percentage,
      p_boost_duration: boost_duration,
      p_boost_cost: boost_cost
    });

    if (transactionError) {
      return res.status(500).json({ error: 'Failed to create boost: ' + transactionError.message });
    }

    if (result && result.error) {
      const statusCode = result.error.includes('Insufficient') ? 400 : 404;
      return res.status(statusCode).json({ error: result.error });
    }

    res.status(201).json({
      success: true,
      message: 'Boost created successfully',
      data: result
    });
  } catch (error: any) {
    console.error('Error creating boost:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};

const getActiveBoosts = async (req: Request, res: Response): Promise<any> => {
  try {
    const { productId } = req.params;

    const { data: boosts, error } = await supabase
      .rpc('get_active_boosts', { product_id: productId });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch boosts' });
    }

    res.json({ boosts });
  } catch (error) {
    console.error('Error fetching boosts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getUserBoosts = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;

    const { data: boosts, error } = await supabase
      .from('boosts')
      .select(`
        *,
        product:products(
          id,
          title,
          thumbnail
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch user boosts' });
    }

    res.json({ boosts });
  } catch (error) {
    console.error('Error fetching user boosts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getMarketplaceBoosts = async (req: Request, res: Response): Promise<any> => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const { data: boosts, error } = await supabase
      .from('boosts')
      .select(`
        *,
        product:products(
          id,
          title,
          category,
          price_anam_coins,
          status,
          thumbnail,
          user_id,
          user:profiles(
            id,
            username,
            avatar_url
          )
        )
      `)
      .eq('status', 'active')
      .gt('end_time', new Date().toISOString())
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch marketplace boosts' });
    }

    res.json({ boosts });
  } catch (error) {
    console.error('Error fetching marketplace boosts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getActiveFeaturedProducts = async (req: Request, res: Response): Promise<any> => {
  try {
    const now = new Date().toISOString();

    const { error: expireError } = await supabase
      .from("boosts")
      .update({ status: "expired" })
      .lte("end_time", now)
      .neq("status", "expired");

    if (expireError) {
      console.error("Error expiring boosts:", expireError);
    }

    const { data: boostedProducts, error } = await supabase
      .from("products")
      .select(`
        *,
        creator:profiles (
          id,
          first_name,
          last_name,
          email,
          avatar_url
        ),
        boosts!inner (
          id,
          end_time
        )
      `)
      .eq("status", "approved")
      .gt("boosts.end_time", now)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching boosted products:", error);
      return res.status(500).json({ success: false, error: "Failed to fetch featured products" });
    }

    // 3. Attach flags
    const featuredProducts =
      boostedProducts?.map((product) => ({
        ...product,
        featured: true,
        is_boosted: true,
      })) || [];

    res.status(200).json({
      success: true,
      products: featuredProducts,
      count: featuredProducts.length,
    });
  } catch (error: any) {
    console.error("Error fetching featured products:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

export {
  createDigitalAsset,
  getProductsByUser,
  getApprovedProducts,
  getAllProductsForAdmin,
  getProductDetails,
  updateProduct,
  deleteProduct,

  // purchase
  processPurchase,
  getMyLibraryProducts,
  initiateResale,
  completeResale,
  voteOnReview,
  getUserReviews,

  // rating and reviews
  getProductReviews,
  createReview,
  updateReview,
  deleteReview,

  // boost products
  createBoost,
  getActiveFeaturedProducts,
  getActiveBoosts,
  getUserBoosts,
  getMarketplaceBoosts,
};