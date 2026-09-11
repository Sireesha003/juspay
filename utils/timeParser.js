// utils/timeParser.js
export const parseDuration = (value) => {
    if (!value) return 0;
    const match = /^(\d+)(ms|s|m|h|d)?$/.exec(value);
    if (!match) return parseInt(value, 10);

    const num = parseInt(match[1], 10);
    const unit = match[2] || 'ms';

    switch (unit) {
        case 'ms': return num;
        case 's': return num * 1000;
        case 'm': return num * 60 * 1000;
        case 'h': return num * 60 * 60 * 1000;
        case 'd': return num * 24 * 60 * 60 * 1000;
        default: return num;
    }
};