"use strict";

const axios = require('axios');

const BASE_URL = `https://asm.hellopython.com/api`;

axios.defaults.headers.common['Authorization'] = `Token ${process.env.ASSEMBLY_TOKEN}`;

const getWorkOrderResult = (id, offset, limit) => {

    offset = (offset ? `&offset=${offset}` : '');
    limit = (limit ? `&limit=${limit}` : '');

    return axios.get(`${BASE_URL}/work-order-result/?workorder=${id}${offset}${limit}`);
};

const getWorkOrders = async () => {
    return await axios.get(`${BASE_URL}/work-orders/`);
};

const completeWorkOrder = async (id) => {
    return await axios.post(`${BASE_URL}/work-orders/${id}/complete/`, {});
};

const getCodeTypes = async () => {
    return await axios.get(`${BASE_URL}/code-types/`);
};

const getProducts = async () => {
    return await axios.get(`${BASE_URL}/products/`);
};


module.exports = {
    getWorkOrderResult,
    getWorkOrders,
    completeWorkOrder,
    getCodeTypes,
    getProducts
};
