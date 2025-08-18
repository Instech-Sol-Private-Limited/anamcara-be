import express from 'express';
import {
    getAllServices,
} from '../controllers/users.controller';
import { getMyLibraryProducts, getUserTransactions, getUserVaultStats } from '../controllers/vault.controller';

const router = express.Router();


router.get("/get-vault-stats", getUserVaultStats);

router.get("/get-transactions", getUserTransactions);

router.get("/get-checkins", getAllServices);

router.get("/get-library-products", getMyLibraryProducts);

export default router;