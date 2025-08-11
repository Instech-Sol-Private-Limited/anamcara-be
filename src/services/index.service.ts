
const formatDateToYYYYMMDD = (date: Date): string => {
    return date.toISOString().split('T')[0];
};

const isValidAvailability = (availability: any): boolean => {
    try {
        const requiredDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        if (!requiredDays.every(day => day in availability)) {
            return false;
        }

        for (const day of requiredDays) {
            const dayAvailability = availability[day];
            if (typeof dayAvailability.enabled !== 'boolean') return false;

            if (!Array.isArray(dayAvailability.slots)) return false;

            for (const slot of dayAvailability.slots) {
                if (!slot.id || typeof slot.id !== 'string') return false;
                if (!slot.start || !isValidTime(slot.start)) return false;
                if (!slot.end || !isValidTime(slot.end)) return false;
            }
        }

        return true;
    } catch {
        return false;
    }
};


const isValidTime = (time: string): boolean => {
    return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
};

const formatTimeToAMPM = (timeStr: string): string => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const formatDateToReadable = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
};


export {
    formatDateToYYYYMMDD,
    isValidAvailability,
    formatTimeToAMPM,
    formatDateToReadable,
}