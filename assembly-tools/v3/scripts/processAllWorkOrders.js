"use strict";

require('dotenv').config();

const assembly = require('../controllers/assembly');
const processWorkOrders = require('../helpers/processWorkOrder').processWorkOrders;

//PURPOSE: process all work orders available via assembly work order API

//TODO in the future I may want to just look at the work order's schedule_start or schedule_end value and not process them if they are past the date
const workOrdersToSkip = ['PO 9899', 'PO 9891', 'PO 9892', 'PO 9893', '9890',  'V9908', 'V9907', 'JP9917', 'JP9919', 'CA9903', 'CA9927',  '9906', 'JP9920', '9905', '9922', 'CA9935', '9923', '9929',
'V9931', 'V9909', 'V9910', 'JP9918', 'CA9894', 'v9930', 'V9934', '9928', '9937', '9948', 'JP9940'];

(async()=>{
    console.log('Initiating processSingleWorkOrder script');

    const workOrderResults = await assembly.getWorkOrders();

    const workOrderResultsData = workOrderResults.data;

    if (workOrderResultsData.length === 0){
        console.log('ERROR: no work orders found!');
        return;
    }

    let workOrdersToProcess = workOrderResultsData.filter(eachWorkOrderResult=>{
        return !workOrdersToSkip.includes(eachWorkOrderResult.name)
    });

    await processWorkOrders(workOrdersToProcess);

    console.log('Info: done processingAllWorkOrders()')
})();


