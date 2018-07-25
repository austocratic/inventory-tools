"use strict";

const axios = require('axios');

const getAssemblyData = async (startDate, endDate) =>{

    return await axios({
        method: 'get',
        url: `https://api.assembly.com/organization/${process.env.ASSEMBLY_ORGANIZATION_ID_V1}/inspection-result-edges?start_date=${startDate}&end_date=${endDate}`,
        headers: {
            auth_token: process.env.ASSEMBLY_AUTH_TOKEN_V1,
            user_id: process.env.ASSEMBLY_USER_ID_V1
        }
    });
};


module.exports = {
    getAssemblyData
};
