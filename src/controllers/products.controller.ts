import { Request, Response } from 'express';
import { supabase } from '../app';

interface CreateDigitalAssetRequest {
  title: string;
  description: string;
  tags: string;
  priceAnamCoins: number;
  redeemSoulPoints: boolean;
  visibility: string;
  license: string;
  assets: string[];
  creatorId: string;
}

interface UpdateProductRequest {
  title?: string;
  description?: string;
  tags?: string[];
  priceAnamCoins?: number;
  redeemSoulPoints?: boolean;
  visibility?: string;
  license?: string;
  assets?: string[];
  status?: 'pending' | 'approved' | 'rejected'; // Only for admin
}

const createDigitalAsset = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title,
      description,
      tags,
      priceAnamCoins,
      redeemSoulPoints,
      license,
      assets,
      creatorId
    } = req.body as CreateDigitalAssetRequest;

    const { data: product, error: dbError } = await supabase
      .from('products')
      .insert({
        title,
        description,
        tags: tags,
        price_anam_coins: priceAnamCoins,
        redeem_soul_points: redeemSoulPoints,
        visibility: 'public',
        license,
        assets: assets,
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
console.log(userId)
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('creator_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    res.status(200).json({
      success: true,
      products: products || []
    });

  } catch (error: any) {
    console.error('Error fetching user products:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch user products'
    });
  }
};

const getApprovedProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, tags, sortBy = 'created_at', sortOrder = 'desc' } = req.query;

    let query = supabase
      .from('products')
      .select('*')
      .eq('status', 'approved')
      .order(sortBy as string, { ascending: sortOrder === 'asc' });

    // Search by title or description
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Filter by tags if provided
    if (tags) {
      const tagArray = (tags as string).split(',');
      query = query.contains('tags', tagArray);
    }

    const { data: products, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    res.status(200).json({
      success: true,
      products: products || []
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
      .select('*')
      .order('created_at', { ascending: false });

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Search if provided
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: products, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    res.status(200).json({
      success: true,
      products: products || []
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
    const { productId } = req.params;

    const { data: product, error } = await supabase
      .from('products')
      .select('*')
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

    res.status(200).json({
      success: true,
      product
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
    const { id:productId } = req.params;
    const {
      title,
      description,
      tags,
      priceAnamCoins,
      redeemSoulPoints,
      visibility,
      license,
      assets,
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
      redeem_soul_points: redeemSoulPoints !== undefined ? redeemSoulPoints : existingProduct.redeem_soul_points,
      visibility: visibility || existingProduct.visibility,
      license: license || existingProduct.license,
      assets: assets || existingProduct.assets,
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

    // First, check if the product exists
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

    // Check if user is either the creator or an admin
    const isCreator = req.user?.id === existingProduct.creator_id;
    const isAdmin = userRole === 'admin';

    if (!isCreator && !isAdmin) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized to delete this product'
      });
      return;
    }

    // Delete the product
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

export {
  createDigitalAsset,
  getProductsByUser,
  getApprovedProducts,
  getAllProductsForAdmin,
  getProductDetails,
  updateProduct,
  deleteProduct,
};

