import express from 'express';

import {
    createDigitalAsset,
    getProductsByUser,
    getApprovedProducts,
    getAllProductsForAdmin,
    getProductDetails,
    updateProduct,
    deleteProduct
  } from '../controllers/products.controller';
const router = express.Router();

router.post('/create-asset', createDigitalAsset);

router.get('/marketplace', getApprovedProducts);

router.get('/get-asset-details/:id', getProductDetails);

router.get('/get-user-assets/:userId', getProductsByUser);

router.put('/update-asset/:id', updateProduct);

router.get('/admin/all', getAllProductsForAdmin);

router.put('/admin/update/:id', updateProduct);

router.delete('/delete-asset/:id', deleteProduct);

export default router;

