"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const users_controller_1 = require("../controllers/users.controller");
const vault_controller_1 = require("../controllers/vault.controller");
const router = express_1.default.Router();
router.get("/get-vault-stats", vault_controller_1.getUserVaultStats);
router.get("/get-transactions", vault_controller_1.getUserTransactions);
router.get("/get-checkins", users_controller_1.getAllServices);
router.get("/get-library-products", vault_controller_1.getMyLibraryProducts);
exports.default = router;
