"use strict";

const _ = require('lodash');
const fs = require('fs');

const assembly = require('../libraries/assembly');
const icracked = require('../libraries/icracked');
const getWorkOrder = require('../helpers/getWorkOrder').getWorkOrder;
const logInspectionsReturnAlreadyInsertedWorkOrders = require('./logInspectionsReturnAlreadyInsertedWorkOrders').logInspectionsReturnAlreadyInsertedWorkOrders;

const manualSkus = [
    {shopify_sku: "PADA2-WH020"},
    {shopify_sku: "PADA2-BK020"},
    {shopify_sku: "PAD9P-BK020"},
    {shopify_sku: "PAD9P-WH020"},
    {shopify_sku: "GOPIX-BK020"},
    {shopify_sku: "GPIXL-BK020"},
    {shopify_sku: "GPIX2-BK020"},
    {shopify_sku: "GP2XL-BK020"},
    {shopify_sku: "PAD6X-WH000"},
    {shopify_sku: "PAD6X-BK000"},
    {shopify_sku: "PADM1-BK001"},
    {shopify_sku: "PADM1-WH001"},
    {shopify_sku: "PAD5X-BK000B"},
    {shopify_sku: "PAD5X-WH000B"},
    {shopify_sku: "PAD4X-BK000"},
    {shopify_sku: "PAD4X-WH000"},
    {shopify_sku: "PHOSE-XX150"},
    {shopify_sku: "PHO06-XX150"},
    {shopify_sku: "PHO6P-XX150"},
    {shopify_sku: "PHO6S-XX150"},
    {shopify_sku: "PH6SP-XX150"},
    {shopify_sku: "PHO07-XX150"},
    {shopify_sku: "PHO7P-XX150"}
];

const processWorkOrders = async (workOrders) =>{
    console.log('Info: called processWorkOrders()');

    //Get products
    const productsResults = await assembly.getProducts();
    const products = productsResults.data;

    //Get code types
    //console.log('Info: getting assembly code types');
    //const codeTypesResults = await assembly.getCodeTypes();
    //const codeTypes = codeTypesResults.data;

    //Get iCracked DB data
    console.log('Info: getting iCracked get_scale_parts');
    const getScaleParts = await icracked.fetchGetScaleParts();

    //Update DB response format
    let formattedGetScaleParts = getScaleParts.map( eachGetScalePart =>{
        return {
            id: eachGetScalePart.id,
            partCode: eachGetScalePart.part_code.toLowerCase(),
            cartonCode: eachGetScalePart.carton_code.toLowerCase(),
            cartonSku: eachGetScalePart.sku,
            trackingNumber: eachGetScalePart.return_label_tracking_number,
            createdAt: eachGetScalePart.created_at,
            updatedAt: eachGetScalePart.updated_at,
            updatedBy: eachGetScalePart.updated_by
        }
    });

    console.log('Info: getting iCracked skus');
    let dbSkus = await icracked.fetchSkus();

    //Merge the "manual" skus into the skus from shopify_service_tasks table (since this table does not contain everything yet)
    let skus = dbSkus.concat(manualSkus);

    let allWorkOrderInspections = [];

    for (const eachWorkOrder of workOrders) {

        const getWorkOrderAndFormat = async (eachWorkOrder) =>{
            console.log(`Info: getting & formatting data for work order: ${eachWorkOrder.name}`);

            let numberProcessed = 0;

            const workOrderResults = await assembly.getWorkOrderResult(eachWorkOrder.id, 0, 100);

            if (workOrderResults === undefined) {
                console.log(`Error: ${eachWorkOrder.name} did not return a results property`);
                return;
            }

            let workOrderResultsData = workOrderResults.data.results;

            if (workOrderResultsData.length === 0){
                console.log(`Info: ${eachWorkOrder.name} had 0 inspection results`);
                return;
            }

            numberProcessed = numberProcessed + workOrderResults.data.results.length;

            //More than 100 results? Iterate to get them all
            if (workOrderResults.data.total > 100){

                let getMore = async (offset)=>{

                    const moreWorkOrderResults = await assembly.getWorkOrderResult(eachWorkOrder.id, offset, 100);

                    numberProcessed = numberProcessed + moreWorkOrderResults.data.results.length;

                    workOrderResultsData = workOrderResultsData.concat(moreWorkOrderResults.data.results);

                    if (numberProcessed < workOrderResults.data.total){
                        await getMore(offset + 100)
                    }

                    return moreWorkOrderResults
                };

                await getMore(100);
            }

            console.log(`Info: done getting & formatting data for ${eachWorkOrder.name}`);
            //return getWorkOrder(eachWorkOrder, workOrderResultsData, products, codeTypes);
            return getWorkOrder(eachWorkOrder, workOrderResultsData, products);
        };

        try {
            allWorkOrderInspections = allWorkOrderInspections.concat(await getWorkOrderAndFormat(eachWorkOrder));
        } catch(err){
            console.log(`Error: when getting & formatting data for work order: ${eachWorkOrder.name} error: ${err}`)
        }
    }

    //Validate & log inspections
    const alreadyInsertedWorkOrders = logInspectionsReturnAlreadyInsertedWorkOrders(allWorkOrderInspections, formattedGetScaleParts, skus);

    //-------Close certain open orders-------
    
    //Iterate through each open work order to see if it should be closed
    for (const eachWorkOrder of workOrders) {
    
        //Find the open work order's matching work order in alreadyInsertedWorkOrders (if it exists)
        const matchingInsertedWorkOrder = _.find(alreadyInsertedWorkOrders, {'name': eachWorkOrder.name})
        //If no match, skip
        if (matchingInsertedWorkOrder === undefined){
            console.log(`Info: could not find a matching already inserted WO for ${eachWorkOrder.name}`);
            continue;
        }

        //Create a new array of not deleted work order skus.  These are the counts per sku we expect for inspections
        const workOrderSkus = eachWorkOrder.tasks
            //Filter for only not deleted products
            .filter(eachWorkOrderSku=>{
                return !eachWorkOrderSku.product_info.is_deleted
            })
            .map(eachWorkOrderSku=>{
                return {
                    sku: eachWorkOrderSku.product_info.name,
                    count: eachWorkOrderSku.count
                }
            })

        //Set a flag to determine if work order should be closed.  Loop below will determine if flag 
        let shouldCloseWO = true;

        //For each work order sku, determine if that quantity was inspected by comparing to matchingInsertedWorkOrder
        workOrderSkus.forEach(eachWorkOrderSku=>{
            // console.log(`DEBUG checking work order SKU ${eachWorkOrderSku.sku} with quantity: ${eachWorkOrderSku.count}`);
            // console.log(`DEBUG matchingInsertedWorkOrder had count of ${matchingInsertedWorkOrder.skus[eachWorkOrderSku.sku]}`);

            //If no matching inspections for a particular SKU, don't close
            if (matchingInsertedWorkOrder.skus[eachWorkOrderSku.sku] === undefined){
                console.log(`Info: Assembly WO ${eachWorkOrder.name}'s SKU ${eachWorkOrderSku.sku} has not had any inspections inserted into DB, not closing this WO`);
                shouldCloseWO = false;
                return;
            }

            //If the sku quantitiy inserted into DB is less than the sku quantity on the work order, then keep the work order open
            if (matchingInsertedWorkOrder.skus[eachWorkOrderSku.sku] < eachWorkOrderSku.count){
                console.log(`Info: Assembly WO ${eachWorkOrder.name}'s SKU ${eachWorkOrderSku.sku} had a count of ${matchingInsertedWorkOrder.skus[eachWorkOrderSku.sku]} which is not >= ${eachWorkOrderSku.count}, not closing this WO`);
                shouldCloseWO = false;
                return;
            }
        })

        //If flag is still true, close the WO
        if (shouldCloseWO){
            console.log(`Info: closing WO ${eachWorkOrder.name}`);
            const closeWorkOrderResponse = await assembly.completeWorkOrder(eachWorkOrder.id);
            console.log('Info: successfully closed WO: ', closeWorkOrderResponse.data.name);
        }
    }

    console.log('Info: completed running processWorkOrders()');
    return true;
};


module.exports = {
    processWorkOrders
};

