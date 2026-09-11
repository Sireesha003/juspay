// utils/responseHelper.js
export const errorResponse = (res, statusCode, message, additionalData = null) => {
    const response = {
        status: false,
        success: false,
        response: message,
        message: message,
        data: null
    };

    if (additionalData && process.env.NODE_ENV !== 'production') {
        response.error = additionalData;
    }

    return res.status(statusCode).json(response);
};

export const successResponse = (res, statusCode, data, message = "Success") => {
    return res.status(statusCode).json({
        status: true,
        success: true,
        response: message,
        message: message,
        data
    });
};
   
export const paginatedResponse = (res, statusCode, data, pagination, message = "Success") => {
    return res.status(statusCode).json({
        status: true,
        success: true,
        response: message,
        message: message,
        data,
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total: pagination.total,
            totalPages: Math.ceil(pagination.total / pagination.limit),
            hasNext: pagination.page < Math.ceil(pagination.total / pagination.limit),
            hasPrev: pagination.page > 1
        }
    });
};

export const validationErrorResponse = (res, errors) => {
    const localizedMsg = 'Validation failed';

    const validationErrors = errors.array().map(error => ({
        field: error.path || error.param,
        message: error.msg,
        value: error.value
    }));

    return res.status(400).json({
        status: false,
        response: localizedMsg,
        data: { errors: validationErrors }
    });
};