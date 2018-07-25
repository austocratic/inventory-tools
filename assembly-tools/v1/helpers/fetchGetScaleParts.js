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



const fetchGetScaleParts = async () =>{
    //Get get_scale_parts records from DB
    return await knex
        .select('*')
        .from('get_scale_parts');
};


module.exports = {
    fetchGetScaleParts
};