"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const availableslots_controller_1 = require("../controllers/availableslots.controller");
const router = express_1.default.Router();
router.get('/get-available-slots', availableslots_controller_1.getAvailability);
router.post('/update-available-slots', availableslots_controller_1.updateAvailability);
router.get('/get-user-slots/:userid', availableslots_controller_1.getUserSlots);
router.post('/booking-slot', availableslots_controller_1.bookingASlot);
router.get('/get-booked-slot/:id', availableslots_controller_1.getBookedSlots);
router.put('/change-status', availableslots_controller_1.updateBookingStatus);
// router.post('/create-booking', createBooking);
// router.post('/reset', resetAvailability);
exports.default = router;
