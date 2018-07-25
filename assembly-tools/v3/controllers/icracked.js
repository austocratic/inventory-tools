"use strict";

let knex  = require('knex')({
    client: 'mysql',
    debug: false,
    connection: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password:process.env.DB_PASS,
        database: 'icracked_new',
        charset : 'utf8mb4',
        dateStrings : true
    },
    pool: { min: 10 , max: 50 }
});


//Get get_scale_parts records from DB
const fetchGetScaleParts = async () =>{
    return await knex
        .select('*')
        .from('get_scale_parts');
};

//Get skus only from shopify_skus_service_tasks_models table
const fetchSkus = async () =>{
    return await knex
        .select('shopify_sku')
        .from('shopify_skus_service_tasks_models')
        .groupBy('shopify_sku')
};


module.exports = {
    fetchGetScaleParts,
    fetchSkus
};