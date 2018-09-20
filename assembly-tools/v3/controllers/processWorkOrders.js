"use strict";

const _ = require('lodash');
const fs = require('fs');

const assembly = require('../libraries/assembly');
const icracked = require('../libraries/icracked');
const getWorkOrder = require('../helpers/getWorkOrder').getWorkOrder;
const logInpsections = require('./logInspections').logInspections;

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

    console.log('Info: getting assembly products');

    //Get products
    const productsResults = await assembly.getProducts();
    const products = productsResults.data;

    console.log('Info: getting assembly code types');

    //Get code types
    //const codeTypesResults = await assembly.getCodeTypes();
    //const codeTypes = codeTypesResults.data;

    console.log('Info: getting iCracked get_scale_parts');

    //Get iCracked DB data
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
    /*
    console.log(JSON.stringify(allWorkOrderInspections));

    allWorkOrderInspections.forEach(eachWorkOrderInspection=>{

        if (eachWorkOrderInspection === undefined){
            console.log('DEBUG found undefined value')
        }
    });*/
    //Validate & log inspections
    logInpsections(allWorkOrderInspections, formattedGetScaleParts, skus);

    console.log('Info: completed running processWorkOrders()');
    return true;
};


module.exports = {
    processWorkOrders
};

