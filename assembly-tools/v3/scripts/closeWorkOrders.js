"use strict";

require('dotenv').config();
const _ = require('lodash');

const assembly = require('../libraries/assembly');

const workOrdersToClose = ['10067', '10040', 'JP10050', 'JP10064', '10070'];

//PURPOSE: mark work orders as 'complete' in assembly system.  Input work order names into 'workOrdersToClose' array
(async()=>{
    console.log('Info: initiating closeWorkOrders script');

    if (workOrdersToClose.length === 0){
        console.log('ERROR: you did not pass in any work order to close!');
        return;
    }

    const workOrderResults = await assembly.getWorkOrders();

    const workOrderResultsData = workOrderResults.data;

    if (workOrderResultsData.length === 0){
        console.log('ERROR: no work orders found!');
        return;
    }

    let workOrdersToCloseDetails = workOrdersToClose.map(eachWorkOrderToClose=>{
        return _.find(workOrderResultsData, {'name': eachWorkOrderToClose});
    });

    for (const eachWorkOrder of workOrdersToCloseDetails) {
        const closeWorkOrderResponse = await assembly.completeWorkOrder(eachWorkOrder.id);
        console.log('Info: closed work order: ', closeWorkOrderResponse.data.name);
    }

    console.log('Info: done closeWorkOrders()')
})();


