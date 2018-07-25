"use strict";

const axios = require('axios');

const token = process.env.ASSEMBLY_TOKEN;

const getWorkOrderResult = async id => {
    return await axios({
        method: 'get',
        url: `https://asm.hellopython.com/api/work-order-result/?workorder=${id}`,
        headers: {
            Authorization: `Token ${token}`
        }
    });
};

const getWorkOrders = async () => {
    return await axios({
        method: 'get',
        url: `https://asm.hellopython.com/api/work-orders/`,
        headers: {
            Authorization: `Token ${token}`
        }
    });
};

const getCodeTypes = async () => {
    return await axios({
        method: 'get',
        url: `https://asm.hellopython.com/api/code-types/`,
        headers: {
            Authorization: `Token ${token}`
        }
    });
};

const getProducts = async () => {
    return await axios({
        method: 'get',
        url: `https://asm.hellopython.com/api/products/`,
        headers: {
            Authorization: `Token ${token}`
        }
    });
};


module.exports = {
    getWorkOrderResult,
    getWorkOrders,
    getCodeTypes,
    getProducts
};
