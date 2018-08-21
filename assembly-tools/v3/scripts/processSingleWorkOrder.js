"use strict";

require('dotenv').config();

const assembly = require('../controllers/assembly');
const processWorkOrders = require('../helpers/processWorkOrder').processWorkOrders;

//PURPOSE: process a single Work Order by name:
const workOrderName = '10011';

(async()=>{
    console.log('Initiating processSingleWorkOrder script');

    const workOrderResults = await assembly.getWorkOrders();

    const workOrderResultsData = workOrderResults.data;

    if (workOrderResultsData.length === 0){
        console.log('ERROR no work orders found!')
    }

    let foundWorkOrder = workOrderResultsData.find(eachWorkOrder=>{
        return eachWorkOrder.name === workOrderName
    });

    if (foundWorkOrder === undefined){
        console.log('ERROR, could not find matching work order!');
        return;
    }

    let workOrders = [foundWorkOrder];

    await processWorkOrders(workOrders);

    console.log('Info: done processingSingleWorkOrder()')
})();



