"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDateToReadable = exports.formatTimeToAMPM = exports.isValidAvailability = exports.formatDateToYYYYMMDD = void 0;
const formatDateToYYYYMMDD = (date) => {
    return date.toISOString().split('T')[0];
};
exports.formatDateToYYYYMMDD = formatDateToYYYYMMDD;
const isValidAvailability = (availability) => {
    try {
        const requiredDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        if (!requiredDays.every(day => day in availability)) {
            return false;
        }
        for (const day of requiredDays) {
            const dayAvailability = availability[day];
            if (typeof dayAvailability.enabled !== 'boolean')
                return false;
            if (!Array.isArray(dayAvailability.slots))
                return false;
            for (const slot of dayAvailability.slots) {
                if (!slot.id || typeof slot.id !== 'string')
                    return false;
                if (!slot.start || !isValidTime(slot.start))
                    return false;
                if (!slot.end || !isValidTime(slot.end))
                    return false;
            }
        }
        return true;
    }
    catch (_a) {
        return false;
    }
};
exports.isValidAvailability = isValidAvailability;
const isValidTime = (time) => {
    return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
};
const formatTimeToAMPM = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
};
exports.formatTimeToAMPM = formatTimeToAMPM;
const formatDateToReadable = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
};
exports.formatDateToReadable = formatDateToReadable;
