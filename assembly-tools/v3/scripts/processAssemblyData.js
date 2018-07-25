"use strict";

require('dotenv').config();

const _ = require('lodash');
const fs = require('fs');

const assembly = require('../controllers/assembly');
const icracked = require('../controllers/icracked');
const processWorkOrder = require('../helpers/processWorkOrder').processWorkOrder;

const otherSkus = [
    {shopify_sku: "PADA2-WH020"},
    {shopify_sku: "PADA2-BK020"},
    {shopify_sku: "PAD9P-BK020"},
    {shopify_sku: "PAD9P-WH020"},
    {shopify_sku: "PAD4X-BK000"},
    {shopify_sku: "PAD4X-WH000"},
    {shopify_sku: "PAD5X-BK000b"},
    {shopify_sku: "PADM1-BK001"},
    {shopify_sku: "GOPIX-BK020"},
    {shopify_sku: "GPIXL-BK020"},
    {shopify_sku: "GPIX2-BK020"},
    {shopify_sku: "GP2XL-BK020"}
];

(async()=>{
    console.log('Initiating processAssemblyData script');

    const workOrderResults = await assembly.getWorkOrders();

    const workOrders = workOrderResults.data;

    if (workOrders.length === 0){
        console.log('ERROR no work orders found!')
    }

    //Get products
    const productsResults = await assembly.getProducts();
    const products = productsResults.data;

    //Get code types
    const codeTypesResults = await assembly.getCodeTypes();
    const codeTypes = codeTypesResults.data;

    //Get iCracked DB data
    const getScaleParts = await icracked.fetchGetScaleParts();
    let skus = await icracked.fetchSkus();

    //Merge the "manual" skus into the skus from shopify_service_tasks table (since this table does not contain everything yet)
    skus = skus.concat(otherSkus);

    const processWorkOrderResults = workOrders.map(async eachWorkOrder=>{
        return processWorkOrder(eachWorkOrder, getScaleParts, products, codeTypes, skus);
    });

    Promise.all(processWorkOrderResults)
        .then(results => {

            console.log(`Info: Processing ${results.length} work orders into master query output`);

            let currentTimeStamp = Date.now();

            //Create a new folder for this script run
            if (!fs.existsSync(`./output/v3/master-output/${currentTimeStamp}`)){
                fs.mkdirSync(`./output/v3/master-output/${currentTimeStamp}`);
            }

            //Create files in directory for writing output
            const directory = `./output/v3/master-output/${currentTimeStamp}`;
            const allResultsOutput = fs.createWriteStream(`${directory}/all-results.txt`);
            const insertQueryOutput = fs.createWriteStream(`${directory}/insert-query.txt`);
            const duplicatePartOutput = fs.createWriteStream(`${directory}/duplicate-parts.txt`);
            const duplicateCartonOutput = fs.createWriteStream(`${directory}/duplicate-cartons.txt`);
            const duplicateTrackingOutput = fs.createWriteStream(`${directory}/duplicate-tracking.txt`);

            //Convert 2d results array --> 1d
            let allInspections = _.flatten(results);

            allInspections.forEach((eachInspection, index, allInspections) =>{

                let standardOutput = `('${eachInspection.partCode}', '${eachInspection.cartonCode}', '${eachInspection.cartonSku}', '${eachInspection.trackingNumber}'),\n`;

                allResultsOutput.write(standardOutput);

                //------Find duplicate scans across work orders---------

                //Check each new assembly record against the other assembly records from the API: check if part already exists but with a different carton code
                let dupePart = _.find(allInspections, (eachOtherInspection, otherInspectionIndex) =>{
                    return eachOtherInspection.partCode === eachInspection.partCode && index !== otherInspectionIndex
                });

                if (dupePart !== undefined){
                    duplicatePartOutput.write(standardOutput);
                    return false;
                }

                //Check each new assembly record against the other assembly records from the API: check if carton already exists but with a different part code
                let dupeCarton = _.find(allInspections, (eachOtherInspection, otherInspectionIndex) =>{
                    return eachOtherInspection.cartonCode === eachInspection.cartonCode && index !== otherInspectionIndex
                });

                if (dupeCarton !== undefined){
                    duplicateCartonOutput.write(standardOutput);
                    return false;
                }

                //Check each new assembly record against the other assembly records from the API: check if carton already exists but with a different part code
                let dupeTracking = _.find(allInspections, (eachOtherInspection, otherInspectionIndex) =>{
                    return eachOtherInspection.trackingNumber === eachInspection.trackingNumber && index !== otherInspectionIndex
                });

                if (dupeTracking !== undefined){
                    duplicateTrackingOutput.write(standardOutput);
                    return false;
                }

                //Insert any scans that were not escaped
                insertQueryOutput.write(standardOutput);
            });

            console.log('Successfully processed all work orders')
        });
})();




