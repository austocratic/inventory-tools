"use strict";

const _ = require('lodash');
const fs = require('fs');

const assembly = require('../controllers/assembly');
const icracked = require('../controllers/icracked');
const getWorkOrder = require('./getWorkOrder').getWorkOrder;

const OUTPUT_ROOT_FOLDER = './output/v3/';

const otherSkus = [
    {shopify_sku: "PADA2-WH020"},
    {shopify_sku: "PADA2-BK020"},
    {shopify_sku: "PAD9P-BK020"},
    {shopify_sku: "PAD9P-WH020"},
    {shopify_sku: "GOPIX-BK020"},
    {shopify_sku: "GPIXL-BK020"},
    {shopify_sku: "GPIX2-BK020"},
    {shopify_sku: "GP2XL-BK020"}
];

const VENDOR_CODES = {
    f: 'R. Y. Telecom',
    g: 'E-Country',
    h: 'ShenZhen WeiPei Technology Co., Ltd',
    i: 'Direct Tech Supply',
    j: 'Shenzhen Super Wireless industry co., ltd',
    k: 'ZTE',
    l: 'Techstar'
};

const COMPONENT_CODES = {
    a: 'part',
    b: 'carton'
};


const processWorkOrders = async (workOrders) =>{

    let currentTimeStamp = Date.now();

    //Create a timestamped folder for this script run
    if (!fs.existsSync(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}`)){
        fs.mkdirSync(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}`);
        fs.mkdirSync(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/workOrders`);
        fs.mkdirSync(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/allData`);
    }

    console.log('Info: getting assembly products');

    //Get products
    const productsResults = await assembly.getProducts();
    const products = productsResults.data;

    console.log('Info: getting assembly code types');

    //Get code types
    const codeTypesResults = await assembly.getCodeTypes();
    const codeTypes = codeTypesResults.data;

    console.log('Info: getting iCracked get_scale_parts');

    //Get iCracked DB data
    const getScaleParts = await icracked.fetchGetScaleParts();

    //Make all part_code & carton_code lower case
    let formattedGetScaleParts = getScaleParts.map( eachGetScalePart =>{
        return {
            id: eachGetScalePart.id,
            partCode: eachGetScalePart.part_code.toLowerCase(),
            cartonCode: eachGetScalePart.carton_code.toLowerCase(),
            cartonSku: eachGetScalePart.sku,
            trackingNumber: eachGetScalePart.return_label_tracking_number,
            created_at: eachGetScalePart.created_at,
            updated_at: eachGetScalePart.updated_at,
            updated_by: eachGetScalePart.updated_by
        }
    });

    console.log('Info: getting iCracked skus');

    let skus = await icracked.fetchSkus();

    //Merge the "manual" skus into the skus from shopify_service_tasks table (since this table does not contain everything yet)
    skus = skus.concat(otherSkus);

    const allWorkOrders = workOrders.map(async eachWorkOrder=>{

        console.log('Info: calling assembly to get inspections for work order: ', eachWorkOrder.name);

        const workOrderResults = await assembly.getWorkOrderResult(eachWorkOrder.id);
        const workOrderResultsData = workOrderResults.data;

        return getWorkOrder(eachWorkOrder, workOrderResultsData, products, codeTypes);
    });

    Promise.all(allWorkOrders)
        .then(workOrderResults=>{

            //Convert 2d results array --> 1d
            let allWorkOrderInspections = _.flatten(workOrderResults);

            //Combine get_scale_parts (from DB) & API response data to create a single array for some validations
            let workOrderResultsAndGetScale = allWorkOrderInspections.concat(formattedGetScaleParts);

            let workOrderSummary = {
                allData: {
                    alreadyInserted: {
                        log: fs.createWriteStream(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/allData/already-inserted.txt`)
                    },
                    dataToInsert: {
                        log: fs.createWriteStream(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/allData/insert-query.txt`)
                    },
                    invalidPart: {
                        log: fs.createWriteStream(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/allData/invalid-part.txt`)
                    },
                    invalidCarton: {
                        log: fs.createWriteStream(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/allData/invalid-carton.txt`)
                    },
                    duplicatePart: {
                        log: fs.createWriteStream(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/allData/duplicate-part.txt`)
                    },
                    duplicateCarton: {
                        log: fs.createWriteStream(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/allData/duplicate-carton.txt`)
                    },
                    mismatchedSkus: {
                        log: fs.createWriteStream(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/allData/mismatched-skus.txt`)
                    },
                    completeInspections: {
                        log: fs.createWriteStream(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/allData/complete-inspections.txt`)
                    },
                    incompleteInspections: {
                        log: fs.createWriteStream(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/allData/incomplete-inspections.txt`)
                    }
                }
            };

            //Process each inspection
            allWorkOrderInspections.forEach(eachWorkOrderResult=>{

                //Check if the WO number exists in our summary data, if not build an object model
                if(!workOrderSummary[eachWorkOrderResult.number]) {

                    //Create files in directory for writing output
                    const workOrderDirectory = `${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/workOrders/${eachWorkOrderResult.number}`;

                    //Determine if a folder exists for the WO, if not, create one
                    if (!fs.existsSync(workOrderDirectory)){
                        fs.mkdirSync(workOrderDirectory);
                    }

                    workOrderSummary[eachWorkOrderResult.number] = {
                        alreadyInserted: {
                            log: fs.createWriteStream(`${workOrderDirectory}/already-inserted.txt`)
                        },
                        dataToInsert: {
                            log: fs.createWriteStream(`${workOrderDirectory}/insert-query.txt`)
                        },
                        invalidPart: {
                            log: fs.createWriteStream(`${workOrderDirectory}/invalid-part.txt`)
                        },
                        invalidCarton: {
                            log: fs.createWriteStream(`${workOrderDirectory}/invalid-carton.txt`)
                        },
                        duplicatePart: {
                            log: fs.createWriteStream(`${workOrderDirectory}/duplicate-part.txt`)
                        },
                        duplicateCarton: {
                            log: fs.createWriteStream(`${workOrderDirectory}/duplicate-carton.txt`)
                        },
                        mismatchedSkus: {
                            log: fs.createWriteStream(`${workOrderDirectory}/mismatched-skus.txt`)
                        },
                        completeInspections: {
                            log: fs.createWriteStream(`${workOrderDirectory}/complete-inspections.txt`)
                        },
                        incompleteInspections: {
                            log: fs.createWriteStream(`${workOrderDirectory}/incomplete-inspections.txt`)
                        }
                    };
                }

                let inspectionOutputRaw = JSON.stringify(eachWorkOrderResult);

                //Log complete inspections
                if (eachWorkOrderResult.isComplete){
                    workOrderSummary[eachWorkOrderResult.number].completeInspections.log.write(inspectionOutputRaw);
                    workOrderSummary.allData.completeInspections.log.write(inspectionOutputRaw);
                    workOrderSummary[eachWorkOrderResult.number].completeInspections[eachWorkOrderResult.cartonSku] = (workOrderSummary[eachWorkOrderResult.number].completeInspections[eachWorkOrderResult.cartonSku] || 0) + 1;
                }

                //Log incomplete inspections and escape
                if (!eachWorkOrderResult.isComplete){
                    workOrderSummary[eachWorkOrderResult.number].incompleteInspections.log.write(inspectionOutputRaw);
                    workOrderSummary.allData.incompleteInspections.log.write(inspectionOutputRaw);
                    workOrderSummary[eachWorkOrderResult.number].incompleteInspections[eachWorkOrderResult.cartonSku] = (workOrderSummary[eachWorkOrderResult.number].incompleteInspections[eachWorkOrderResult.cartonSku] || 0) + 1;
                    return;
                }

                //------Validate QR code format---------

                //Check if the part code begins with a valid vendor letter & second letter is part code key
                let vendorNameFromPart = VENDOR_CODES[eachWorkOrderResult.partCode.substring(0, 1)];
                let componentNameFromPart = COMPONENT_CODES[eachWorkOrderResult.partCode.substring(1, 2)];

                if (!vendorNameFromPart || !componentNameFromPart){
                    workOrderSummary[eachWorkOrderResult.number].invalidPart.log.write(inspectionOutputRaw);
                    //Write to master log
                    workOrderSummary.allData.invalidPart.log.write(inspectionOutputRaw);
                    //Increment SKU counts
                    workOrderSummary[eachWorkOrderResult.number].invalidPart[eachWorkOrderResult.cartonSku] = (workOrderSummary[eachWorkOrderResult.number].invalidPart[eachWorkOrderResult.cartonSku] || 0) + 1;
                    return;
                }

                //Check if the carton code begins with a valid vendor letter & second letter is carton code key
                let vendorNameFromCarton = VENDOR_CODES[eachWorkOrderResult.cartonCode.substring(0, 1)];
                let componentNameFromCarton = COMPONENT_CODES[eachWorkOrderResult.cartonCode.substring(1, 2)];

                if (!vendorNameFromCarton || !componentNameFromCarton){
                    workOrderSummary[eachWorkOrderResult.number].invalidCarton.log.write(inspectionOutputRaw);
                    //Write to master log
                    workOrderSummary.allData.invalidCarton.log.write(inspectionOutputRaw);
                    //Increment SKU counts
                    workOrderSummary[eachWorkOrderResult.number].invalidCarton[eachWorkOrderResult.cartonSku] = (workOrderSummary[eachWorkOrderResult.number].invalidCarton[eachWorkOrderResult.cartonSku] || 0) + 1;
                    return;
                }

                //Determine which SKU to use in the insert.  If there is a mismatch, log it
                let skuToInsert = (()=>{
                    let skuInDB = _.find(skus, eachSku =>{
                        return eachSku.shopify_sku === eachWorkOrderResult.cartonSku;
                    });
                    if (skuInDB === undefined){
                        console.log(`Warning: An inspection's SKU scan of ${eachWorkOrderResult.cartonSku} did not match a sku from shopify_skus_service_tasks_models table.  Setting inspection equal to product sku of ${eachWorkOrderResult.inspectionSku}`);

                        workOrderSummary[eachWorkOrderResult.number].mismatchedSkus.log.write(inspectionOutputRaw);
                        workOrderSummary[eachWorkOrderResult.number].mismatchedSkus[eachWorkOrderResult.cartonSku] = (workOrderSummary[eachWorkOrderResult.number].mismatchedSkus[eachWorkOrderResult.cartonSku] || 0) + 1;
                        workOrderSummary.allData.mismatchedSkus.log.write(inspectionOutputRaw);
                        return eachWorkOrderResult.inspectionSku;
                    }
                    return eachWorkOrderResult.cartonSku;
                })();

                let standardOutput = `('${eachWorkOrderResult.partCode}', '${eachWorkOrderResult.cartonCode}', '${skuToInsert}', '${eachWorkOrderResult.trackingNumber}'),\n`;

                //Validate inspection against database
                //Search for duplicates in the data by searching for matching part, carton, sku that is not the current
                let matchingPartCarton = _.find(formattedGetScaleParts, eachGetScalePart =>{
                    return eachGetScalePart.partCode === eachWorkOrderResult.partCode && eachGetScalePart.cartonCode === eachWorkOrderResult.cartonCode
                });

                if (matchingPartCarton !== undefined){
                    //Write to individual work order's log
                    workOrderSummary[eachWorkOrderResult.number].alreadyInserted.log.write(standardOutput);
                    //Write to master log
                    workOrderSummary.allData.alreadyInserted.log.write(standardOutput);
                    //Increment SKU counts
                    workOrderSummary[eachWorkOrderResult.number].alreadyInserted[eachWorkOrderResult.cartonSku] = (workOrderSummary[eachWorkOrderResult.number].alreadyInserted[eachWorkOrderResult.cartonSku] || 0) + 1;
                    return;
                }

                //------Combined DB data & API data validations------

                //Check the inspection record against all DB data & other inspections data from the current batch
                let dupePart = _.find(workOrderResultsAndGetScale, eachWorkOrderResultsAndGetScale =>{
                    return eachWorkOrderResultsAndGetScale.partCode === eachWorkOrderResult.partCode && eachWorkOrderResultsAndGetScale.cartonCode !== eachWorkOrderResult.cartonCode
                });

                if (dupePart !== undefined){
                    workOrderSummary[eachWorkOrderResult.number].duplicatePart.log.write(standardOutput);
                    //Write to master log
                    workOrderSummary.allData.duplicatePart.log.write(standardOutput);
                    //Increment SKU counts
                    workOrderSummary[eachWorkOrderResult.number].duplicatePart[eachWorkOrderResult.cartonSku] = (workOrderSummary[eachWorkOrderResult.number].duplicatePart[eachWorkOrderResult.cartonSku] || 0) + 1;
                    return;
                }

                //Check the inspection record against all DB data & other inspections data from the current batch
                let dupeCarton = _.find(workOrderResultsAndGetScale, eachWorkOrderResultsAndGetScale =>{
                    return eachWorkOrderResultsAndGetScale.partCode !== eachWorkOrderResult.partCode && eachWorkOrderResultsAndGetScale.cartonCode === eachWorkOrderResult.cartonCode
                });

                if (dupeCarton !== undefined){
                    workOrderSummary[eachWorkOrderResult.number].duplicateCarton.log.write(standardOutput);
                    //Write to master log
                    workOrderSummary.allData.duplicateCarton.log.write(standardOutput);
                    //Increment SKU counts
                    workOrderSummary[eachWorkOrderResult.number].duplicateCarton[eachWorkOrderResult.cartonSku] = (workOrderSummary[eachWorkOrderResult.number].duplicateCarton[eachWorkOrderResult.cartonSku] || 0) + 1;
                    return;
                }

                //----------FINAL DATA - Write to query logs--------

                //Write to master log
                workOrderSummary.allData.dataToInsert.log.write(standardOutput);
                workOrderSummary.allData.dataToInsert[eachWorkOrderResult.cartonSku] = (workOrderSummary.allData.dataToInsert[eachWorkOrderResult.cartonSku] || 0) + 1;

                //Write to individual work order's log
                workOrderSummary[eachWorkOrderResult.number].dataToInsert.log.write(standardOutput);
                workOrderSummary[eachWorkOrderResult.number].dataToInsert[eachWorkOrderResult.cartonSku] = (workOrderSummary[eachWorkOrderResult.number].dataToInsert[eachWorkOrderResult.cartonSku] || 0) + 1;
            });

            //--------Build master summary file-------
            let masterSummaryFile = fs.createWriteStream(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/allData/summary.txt`);

            masterSummaryFile.write(`WORK ORDER SUMMARY - ${currentTimeStamp}\n\n`);

            masterSummaryFile.write(`-----Work Orders already in data------\n`);

            //--------Build summary files for Work Orders-------

            let workOrderNumbers = Object.keys(workOrderSummary);

            workOrderNumbers.forEach(eachWorkOrderNumber=>{

                //Ignore the "allData" property (not a WO)
                if (eachWorkOrderNumber === "allData"){
                    console.log('DEBUG, reached allData, skipping');
                    return;
                }

                //Log to master summary file
                masterSummaryFile.write(`\nWork Order: ${eachWorkOrderNumber}\n\n`);
                writeWorkOrderProperties(workOrderSummary[eachWorkOrderNumber].alreadyInserted, masterSummaryFile);

                //Create a summary file for this work order
                let workOrderSummaryFile = fs.createWriteStream(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/workOrders/${eachWorkOrderNumber}/summary.txt`);

                workOrderSummaryFile.write(`WORK ORDER SUMMARY - ${eachWorkOrderNumber}\n\n`);

                writeWorkOrderProperties(workOrderSummary[eachWorkOrderNumber], workOrderSummaryFile);
            });

            console.log('Info: completed running processSingleWorkOrder');
            return true;
        })
        .catch(errors=>{
            console.log('ERROR: caught when processing work order results: ', errors);
        })
};

//Recursively process objects, by
const writeWorkOrderProperties = (propsToWrite, fileToWriteTo) => {

    _.forEach(propsToWrite, (value, key) => {

        //Skip "log" key
        if(key === "log"){
            return;
        }

        //If value is an object, then process objects contents
        if (typeof value === "object"){
            fileToWriteTo.write(`\nSummary of ${key}\n\n`);
            writeWorkOrderProperties(value, fileToWriteTo);
            return;
        }

        fileToWriteTo.write(`${key} - ${value}\n`)
    })
};


module.exports = {
    processWorkOrders
};

