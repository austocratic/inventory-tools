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

    let skus = await icracked.fetchSkus();

    //Merge the "manual" skus into the skus from shopify_service_tasks table (since this table does not contain everything yet)
    skus = skus.concat(otherSkus);

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
            return getWorkOrder(eachWorkOrder, workOrderResultsData, products, codeTypes);
        };

        try {
            allWorkOrderInspections = allWorkOrderInspections.concat(await getWorkOrderAndFormat(eachWorkOrder));
        } catch(err){
            console.log(`Error: when getting & formatting data for work order: ${eachWorkOrder.name} error: ${err}`)
        }
    }

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
            invalidTracking: {
                log: fs.createWriteStream(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/allData/invalid-tracking.txt`)
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

    //Process each inspection - Validation, logging and building the workOrderSummary object
    allWorkOrderInspections.forEach((eachWorkOrderResult, eachWorkOrderIndex, allOtherWorkOrderInspections) =>{

        if (eachWorkOrderResult === undefined){
            console.log('Warning, skipping an undefined work order result');
            return;
        }

        try {

            //Check if the WO number exists in our summary data, if not build an object model
            if (!workOrderSummary[eachWorkOrderResult.number]) {

                //Create files in directory for writing output
                const workOrderDirectory = `${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/workOrders/${eachWorkOrderResult.number}`;

                //Determine if a folder exists for the WO, if not, create one
                if (!fs.existsSync(workOrderDirectory)) {
                    fs.mkdirSync(workOrderDirectory);
                }

                //Add individual work orders onto the object
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
                    invalidTracking: {
                        log: fs.createWriteStream(`${workOrderDirectory}/invalid-tracking.txt`)
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

            //Stringified summary object to use in logging
            let inspectionOutputRaw = `'${eachWorkOrderResult.partCode}', '${eachWorkOrderResult.cartonCode}', '${eachWorkOrderResult.cartonSku}', '${eachWorkOrderResult.trackingNumber}', '${eachWorkOrderResult.number}'\n`;

            //Log complete inspections
            if (eachWorkOrderResult.isComplete) {
                workOrderSummary[eachWorkOrderResult.number].completeInspections.log.write(inspectionOutputRaw);
                workOrderSummary.allData.completeInspections.log.write(inspectionOutputRaw);
                workOrderSummary[eachWorkOrderResult.number].completeInspections[eachWorkOrderResult.cartonSku] = (workOrderSummary[eachWorkOrderResult.number].completeInspections[eachWorkOrderResult.cartonSku] || 0) + 1;
            }

            //Log incomplete inspections and escape
            if (!eachWorkOrderResult.isComplete) {
                workOrderSummary[eachWorkOrderResult.number].incompleteInspections.log.write(inspectionOutputRaw);
                workOrderSummary.allData.incompleteInspections.log.write(inspectionOutputRaw);
                workOrderSummary[eachWorkOrderResult.number].incompleteInspections[eachWorkOrderResult.cartonSku] = (workOrderSummary[eachWorkOrderResult.number].incompleteInspections[eachWorkOrderResult.cartonSku] || 0) + 1;
                return;
            }

            //--------------Validate SKU------------

            //Determine which SKU to use in the insert.  If there is a mismatch, log it
            let skuToInsert = (() => {
                let skuInDB = _.find(skus, eachSku => {
                    return eachSku.shopify_sku === eachWorkOrderResult.cartonSku;
                });
                //If carton sku does not match a DB value
                if (skuInDB === undefined) {
                    console.log(`Warning: ${eachWorkOrderResult.number}'s inspection SKU scan of ${eachWorkOrderResult.cartonSku} did not match a sku from shopify_skus_service_tasks_models table.  Setting inspection equal to product sku of ${eachWorkOrderResult.inspectionSku}`);

                    workOrderSummary[eachWorkOrderResult.number].mismatchedSkus.log.write(inspectionOutputRaw);
                    workOrderSummary[eachWorkOrderResult.number].mismatchedSkus[eachWorkOrderResult.cartonSku] = (workOrderSummary[eachWorkOrderResult.number].mismatchedSkus[eachWorkOrderResult.cartonSku] || 0) + 1;
                    workOrderSummary.allData.mismatchedSkus.log.write(inspectionOutputRaw);
                    return eachWorkOrderResult.inspectionSku;
                }
                return eachWorkOrderResult.cartonSku;
            })();

            //--------------Validate Tracking------------

            let trackingNumberToInsert = (() => {
                //Check if tracking number is all numeric, if so return it
                if (eachWorkOrderResult.trackingNumber.search(/\D+/) > -1) {
                    console.log(`Warning: ${eachWorkOrderResult.number}'s inspection tracking scan of ${eachWorkOrderResult.trackingNumber} was not all numeric, setting tracking # to ${eachWorkOrderResult.partCode}`);

                    workOrderSummary[eachWorkOrderResult.number].invalidTracking.log.write(inspectionOutputRaw);
                    workOrderSummary[eachWorkOrderResult.number].invalidTracking[eachWorkOrderResult.cartonSku] = (workOrderSummary[eachWorkOrderResult.number].invalidTracking[eachWorkOrderResult.cartonSku] || 0) + 1;
                    workOrderSummary.allData.invalidTracking.log.write(inspectionOutputRaw);
                    return eachWorkOrderResult.partCode;
                }
                //If conditions above are not met, return .trackingNumber
                return eachWorkOrderResult.trackingNumber
            })();

            let loggingOutput = `('${eachWorkOrderResult.partCode}', '${eachWorkOrderResult.cartonCode}', '${skuToInsert}', '${trackingNumberToInsert}', '${eachWorkOrderResult.number}'),\n`;

            //------Validate QR code format---------

            //Check if the part code begins with a valid vendor letter & second letter is valid component key
            let vendorNameFromPart = VENDOR_CODES[eachWorkOrderResult.partCode.substring(0, 1)];
            let componentNameFromPart = COMPONENT_CODES[eachWorkOrderResult.partCode.substring(1, 2)];
            if (!vendorNameFromPart || !componentNameFromPart) {
                workOrderSummary[eachWorkOrderResult.number].invalidPart.log.write(inspectionOutputRaw);
                workOrderSummary.allData.invalidPart.log.write(inspectionOutputRaw);
                workOrderSummary[eachWorkOrderResult.number].invalidPart[skuToInsert] = (workOrderSummary[eachWorkOrderResult.number].invalidPart[skuToInsert] || 0) + 1;
                return;
            }

            //Check if the carton code begins with a valid vendor letter & second letter is valid component key
            let vendorNameFromCarton = VENDOR_CODES[eachWorkOrderResult.cartonCode.substring(0, 1)];
            let componentNameFromCarton = COMPONENT_CODES[eachWorkOrderResult.cartonCode.substring(1, 2)];
            if (!vendorNameFromCarton || !componentNameFromCarton) {
                workOrderSummary[eachWorkOrderResult.number].invalidCarton.log.write(inspectionOutputRaw);
                workOrderSummary.allData.invalidCarton.log.write(inspectionOutputRaw);
                workOrderSummary[eachWorkOrderResult.number].invalidCarton[skuToInsert] = (workOrderSummary[eachWorkOrderResult.number].invalidCarton[skuToInsert] || 0) + 1;
                return;
            }

            //------Validate against database-----

            //Search for duplicates in the data by searching for matching part, carton, sku that is not the current
            let matchingPartCarton = _.find(formattedGetScaleParts, eachGetScalePart => {
                return eachGetScalePart.partCode === eachWorkOrderResult.partCode && eachGetScalePart.cartonCode === eachWorkOrderResult.cartonCode
            });

            if (matchingPartCarton !== undefined) {
                workOrderSummary[eachWorkOrderResult.number].alreadyInserted.log.write(loggingOutput);
                workOrderSummary.allData.alreadyInserted.log.write(loggingOutput);
                workOrderSummary[eachWorkOrderResult.number].alreadyInserted[skuToInsert] = (workOrderSummary[eachWorkOrderResult.number].alreadyInserted[skuToInsert] || 0) + 1;
                return;
            }

            //------Validate against other API data-----

            let positionOfMatchingPartCartonSku = 0;

            let matchingPartCartonSku = _.find(allWorkOrderInspections, (eachWorkOrderInspection, eachWorkOrderInspectionIndex) => {

                //If there is another matching record, set positionOfMatchingPartCartonSku equal to the matching value's index so it can be referenced later
                if (eachWorkOrderInspection.partCode === eachWorkOrderResult.partCode && eachWorkOrderInspection.cartonCode === eachWorkOrderResult.cartonCode && eachWorkOrderInspection.cartonSku === eachWorkOrderResult.cartonSku && eachWorkOrderInspectionIndex !== eachWorkOrderIndex) {
                    positionOfMatchingPartCartonSku = eachWorkOrderInspectionIndex
                }

                return eachWorkOrderInspection.partCode === eachWorkOrderResult.partCode && eachWorkOrderInspection.cartonCode === eachWorkOrderResult.cartonCode && eachWorkOrderInspection.cartonSku === eachWorkOrderResult.cartonSku && eachWorkOrderInspectionIndex !== eachWorkOrderIndex
            });

            //If there is a matching record determine if it should be skipped (based on position)
            if (matchingPartCartonSku !== undefined) {
                //If this is the second match, ignore it
                if (eachWorkOrderIndex > positionOfMatchingPartCartonSku) {
                    console.log('Warning: found a duplicate part, carton, sku in data, skipping this second instance');
                    return;
                }
            }

            //------Combined DB data & API data validations------

            //Check the inspection record against all DB data & other inspections data from the current batch
            let dupePart = _.find(workOrderResultsAndGetScale, eachWorkOrderResultsAndGetScale => {
                return eachWorkOrderResultsAndGetScale.partCode === eachWorkOrderResult.partCode && eachWorkOrderResultsAndGetScale.cartonCode !== eachWorkOrderResult.cartonCode
            });

            if (dupePart !== undefined) {
                workOrderSummary[eachWorkOrderResult.number].duplicatePart.log.write(loggingOutput);
                workOrderSummary.allData.duplicatePart.log.write(loggingOutput);
                workOrderSummary[eachWorkOrderResult.number].duplicatePart[skuToInsert] = (workOrderSummary[eachWorkOrderResult.number].duplicatePart[skuToInsert] || 0) + 1;
                return;
            }

            //Check the inspection record against all DB data & other inspections data from the current batch
            let dupeCarton = _.find(workOrderResultsAndGetScale, eachWorkOrderResultsAndGetScale => {
                return eachWorkOrderResultsAndGetScale.partCode !== eachWorkOrderResult.partCode && eachWorkOrderResultsAndGetScale.cartonCode === eachWorkOrderResult.cartonCode
            });

            if (dupeCarton !== undefined) {
                workOrderSummary[eachWorkOrderResult.number].duplicateCarton.log.write(loggingOutput);
                workOrderSummary.allData.duplicateCarton.log.write(loggingOutput);
                workOrderSummary[eachWorkOrderResult.number].duplicateCarton[skuToInsert] = (workOrderSummary[eachWorkOrderResult.number].duplicateCarton[skuToInsert] || 0) + 1;
                return;
            }

        //----------FINAL DATA - Write to query logs--------

            let inspectionForInsert = `('${eachWorkOrderResult.partCode}', '${eachWorkOrderResult.cartonCode}', '${skuToInsert}', '${trackingNumberToInsert}'),\n`;

            //Write to master log
            workOrderSummary.allData.dataToInsert.log.write(inspectionForInsert);
            workOrderSummary.allData.dataToInsert[skuToInsert] = (workOrderSummary.allData.dataToInsert[skuToInsert] || 0) + 1;

            //Write to individual work order's log
            workOrderSummary[eachWorkOrderResult.number].dataToInsert.log.write(inspectionForInsert);
            workOrderSummary[eachWorkOrderResult.number].dataToInsert[skuToInsert] = (workOrderSummary[eachWorkOrderResult.number].dataToInsert[skuToInsert] || 0) + 1;

        } catch(err){
            console.log(`Error: processing eachWorkOrderResult() for ${eachWorkOrderResult.number} - ${err}`);
        }
    });

    //--------Build master summary file-------
    let masterSummaryFile = fs.createWriteStream(`${OUTPUT_ROOT_FOLDER}${currentTimeStamp}/allData/summary.txt`);

    masterSummaryFile.write(`WORK ORDER SUMMARY - ${currentTimeStamp}\n\n`);

    masterSummaryFile.write(`-----Work Orders already in data------\n`);

    //--------Build summary files for Work Orders-------

    let workOrderNumbers = Object.keys(workOrderSummary);

    //Use the workOrderSummary object to log details of each work order
    workOrderNumbers.forEach(eachWorkOrderNumber=>{

        //Ignore the "allData" property (not a WO)
        if (eachWorkOrderNumber === "allData"){
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

