import express from 'express';
import { bookingASlot, getAvailability, getBookedSlots, getUserSlots, updateAvailability, updateBookingStatus } from '../controllers/availableslots.controller';

const router = express.Router();

router.get('/get-available-slots', getAvailability);

router.post('/update-available-slots', updateAvailability);

router.get('/get-user-slots/:userid', getUserSlots);

router.post('/booking-slot', bookingASlot);

router.get('/get-booked-slot/:id', getBookedSlots);

router.put('/change-status', updateBookingStatus);

// router.post('/create-booking', createBooking);

// router.post('/reset', resetAvailability);

export default router;