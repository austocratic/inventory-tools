"use strict";

require('dotenv').config();

const assembly = require('../libraries/assembly');
const processWorkOrders = require('../controllers/processWorkOrders').processWorkOrders;

//PURPOSE: process all work orders available via assembly work order API
(async()=>{
    console.log('Initiating processAllWorkOrders script');

    const workOrderResults = await assembly.getWorkOrders();

    const workOrderResultsData = workOrderResults.data;

    if (workOrderResultsData.length === 0){
        console.log('ERROR: no work orders found!');
        return;
    }

    //Filter & process work orders that are not complete
    let openWorkOrders = workOrderResultsData.filter(eachWorkOrderResult=>{
        return eachWorkOrderResult.status !== 'complete'
    });

    await processWorkOrders(openWorkOrders);

    console.log('Info: done processingAllWorkOrders()')
})();


