"use strict";

const _ = require('lodash');
const fs = require('fs');

const assembly = require('../controllers/assembly');

const ASSEMBLY_PREFIX = 'http://d3v.gs/0/';
const USPS_PREFIX = '420940633101';

const processWorkOrder = async (workOrder, getScaleParts, products, codeTypes, skus) =>{

    //console.log(`Info: getting work order details for ID ${workOrder.id}`);

    const workOrderStatusResults = await assembly.getWorkOrderResult(workOrder.id);
    const workOrderStatus = workOrderStatusResults.data;

    //console.log(`Info: successfully got work order details for ${workOrder.name}`);

    if (workOrderStatus === undefined){
        console.log('ERROR found an undefined workOrderStatus: ', workOrderStatusResults)
    }

    if (workOrderStatus.length === 0){
        console.log(`Info: No work order progress for ${workOrder.name}`)
    }

    const partCodeType = codeTypes.find(eachCodeType=>{
        return eachCodeType.name === 'AssemblyID'
    });
    const cartonCodeType = codeTypes.find(eachCodeType=>{
        return eachCodeType.name === 'carton_code'
    });
    const skuCodeType = codeTypes.find(eachCodeType=>{
        return eachCodeType.name === 'sku'
    });
    const trackingNumberCodeType = codeTypes.find(eachCodeType=>{
        return eachCodeType.name === 'return_label_tracking_number'
    });

    //Make all part_code & carton_code lower case
    let formattedGetScaleParts = getScaleParts.map( eachGetScalePart =>{
        return {
            id: eachGetScalePart.id,
            part_code: eachGetScalePart.part_code.toLowerCase(),
            carton_code: eachGetScalePart.carton_code.toLowerCase(),
            sku: eachGetScalePart.sku,
            return_label_tracking_number: eachGetScalePart.return_label_tracking_number,
            created_at: eachGetScalePart.created_at,
            updated_at: eachGetScalePart.updated_at,
            updated_by: eachGetScalePart.updated_by
        }
    });

    //Create a new folder for this work order
    if (!fs.existsSync(`./output/v3/work-orders/${workOrder.name}`)){
        fs.mkdirSync(`./output/v3/work-orders/${workOrder.name}`);
    }

    //Create files in directory for writing output
    const directory = `./output/v3/work-orders/${workOrder.name}`;
    const workOrderResultsCompleteOutput = fs.createWriteStream(`${directory}/status-complete.txt`);
    const workOrderResultsIncompleteOutput = fs.createWriteStream(`${directory}/status-incomplete.txt`);
    const workOrderResultsSummaryOutput = fs.createWriteStream(`${directory}/summary.txt`);
    const duplicateCartonOutput = fs.createWriteStream(`${directory}/duplicate-cartons.txt`);
    const duplicatePartOutput = fs.createWriteStream(`${directory}/duplicate-parts.txt`);
    const duplicateTrackingOutput = fs.createWriteStream(`${directory}/duplicate-tracking.txt`);
    const insertQueryOutput = fs.createWriteStream(`${directory}/insert-query.txt`);

    workOrderResultsSummaryOutput.write(`Work Order Summary - ${workOrder.name}\n\n`);

    let completeProductCounts = {};
    let incompleteProductCounts = {};
    let insertProductCounts = {};
    let alreadyWrittenCounts = {};

    let partsToInsert = 0;
    let partsAlreadyWritten = 0;
    let mismatchedSkus = 0;
    let duplicateParts = 0;
    let duplicateCartons = 0;
    let duplicateTracking = 0;

    let inspections = workOrderStatus
        //Filter out inspections where the product ID is no longer valid
        .filter(eachInspection=>{

            //This gets us the product's name
            let matchingProduct = products.find(eachProduct=>{
                return eachProduct.id === eachInspection.productId
            });

            return matchingProduct !== undefined;
        })
        //Build an object for each inspection result
        .map(eachInspection=>{
            //This gets us the product's name
            let matchingProduct = products.find(eachProduct=>{
                return eachProduct.id === eachInspection.productId
            });

            let inspectionResult = {
                isComplete: eachInspection.isDone,
                inspectionSku: matchingProduct.sku,
                partCode: '',
                cartonCode: '',
                cartonSku: '',
                trackingNumber: '',
                skuMatch: true
            };

            //Iterate through steps to find scans
            if(eachInspection.stepResults){
                eachInspection.stepResults.forEach(eachInspectionStep=>{

                    //If step is missing, exit
                    if (eachInspectionStep === null){
                        return;
                    }

                    //If code is null, exit
                    if (eachInspectionStep.stepResultContent.code === null){
                        console.log(`Warning: a step result had a null code, work order: ${workOrder.name} inspection ID: ${eachInspection._id}, index: ${eachInspectionStep.stepIndex}`);
                        return;
                    }

                    if (eachInspectionStep.stepResultContent.codeTypeId){

                        switch(eachInspectionStep.stepResultContent.codeTypeId) {
                            case partCodeType.id:
                                inspectionResult.partCode = eachInspectionStep.stepResultContent.code.toLowerCase().replace(ASSEMBLY_PREFIX, "");
                                break;
                            case cartonCodeType.id:
                                inspectionResult.cartonCode = eachInspectionStep.stepResultContent.code.toLowerCase().replace(ASSEMBLY_PREFIX, "");
                                break;
                            case skuCodeType.id:
                                //Compare the code scanned as a sku to see if it matches a sku in shopify_skus_service_tasks_models table
                                inspectionResult.cartonSku = (()=>{
                                    let skuInDB = _.find(skus, eachSku =>{
                                        return eachSku.shopify_sku === eachInspectionStep.stepResultContent.code.toUpperCase();
                                    });
                                    if (skuInDB === undefined){
                                        console.log(`Warning: An inspection's SKU scan of ${eachInspectionStep.stepResultContent.code} did not match a sku from shopify_skus_service_tasks_models table.  Setting inspection equal to product sku of ${matchingProduct.sku}`);
                                        return matchingProduct.sku;
                                    }
                                    return eachInspectionStep.stepResultContent.code.toUpperCase();
                                })();
                                break;
                            case trackingNumberCodeType.id:
                                inspectionResult.trackingNumber = eachInspectionStep.stepResultContent.code.replace(USPS_PREFIX, "");
                                break;
                        }
                    }
                });
                //sku match check
                if (matchingProduct.sku !== inspectionResult.cartonSku){
                    mismatchedSkus++;
                    inspectionResult.skuMatch = false;
                }
            }

            return inspectionResult
        });

    console.log(`Info: Processing ${inspections.length} inspections for ${workOrder.name}`);

    //let dataForInsert = [];

    //Filter for "complete" inspections and process
    //forEach statement should add data to insert array
    let dataForInsert = inspections
        .filter(eachInspection=>{
            return eachInspection.isComplete
        })
        .filter((eachInspection, index, completeInspections) =>{
            //Check if that product is in productCounts.  If so increment the count, else start at 0
            completeProductCounts[eachInspection.cartonSku] = (completeProductCounts[eachInspection.cartonSku] || 0) + 1;

            //Check for duplicate tracking numbers
            let dupeTrackingInAssembly = _.find(completeInspections, (otherInspections, otherInspectionIndex) =>{
                return ((otherInspections.trackingNumber === eachInspection.trackingNumber) && (index !== otherInspectionIndex))
            });

            if (dupeTrackingInAssembly !== undefined){
                duplicateTracking++;
                //Use the part code as the tracking number if there is a duplicate
                duplicateTrackingOutput.write(`${eachInspection.inspectionSku},${eachInspection.partCode},${eachInspection.cartonCode},${eachInspection.cartonSku},${eachInspection.trackingNumber},${eachInspection.skuMatch}\n`);
                //After logging, update the tracking #
                eachInspection.trackingNumber = eachInspection.partCode;
            }

            const standardOutput = `${eachInspection.inspectionSku},${eachInspection.partCode},${eachInspection.cartonCode},${eachInspection.cartonSku},${eachInspection.trackingNumber},${eachInspection.skuMatch}\n`;

            //Log the complete output
            workOrderResultsCompleteOutput.write(standardOutput);

            //------Find complete duplicate scans---------
            //Check DB
            //Check each new assembly record against DB records: check if part already exists but with a different carton code
            let dupePartCartonInDB = _.find(formattedGetScaleParts, eachGetScalePart =>{
                return eachGetScalePart.part_code === eachInspection.partCode && eachGetScalePart.carton_code === eachInspection.cartonCode && eachGetScalePart.sku === eachInspection.cartonSku
            });

            if (dupePartCartonInDB !== undefined){
                partsAlreadyWritten++;
                alreadyWrittenCounts[eachInspection.cartonSku] = (alreadyWrittenCounts[eachInspection.cartonSku] || 0) + 1;
                //Prevent duplicate from being written by escaping the forEach
                return false;
            }

            //Search for duplicates in the data by searching for matching part, carton, sku that is not the current
            let completeDuplicateInAssembly = _.find(completeInspections, (otherInspections, otherInspectionIndex) =>{
                return ((otherInspections.partCode === eachInspection.partCode && otherInspections.cartonCode === eachInspection.cartonCode && otherInspections.cartonSku === eachInspection.cartonSku) && (index !== otherInspectionIndex))
            });

            if (completeDuplicateInAssembly !== undefined){
                //Prevent duplicate from being written by escaping the forEach
                return false;
            }

            /*
            //Check API call data for a duplicate with mismatched SKU
            let mismatchedSkuInAssembly = _.find(dataForInsert, eachRecordToInsert =>{
                return eachRecordToInsert.partCode === eachInspection.partCode && eachRecordToInsert.cartonCode === eachInspection.cartonCode && eachRecordToInsert.cartonSku !== eachInspection.cartonSku
            });

            if (mismatchedSkuInAssembly !== undefined){
                console.log(`Warning: Found a duplicate part-carton combo with a different SKU:
                            Attempted to add: ${mismatchedSkuInAssembly.partCode},${mismatchedSkuInAssembly.cartonCode},${mismatchedSkuInAssembly.cartonSku}
                            Already exists: ${standardOutput}`)}*/

            //------Validate against other Data from API call---------

            //Check each new assembly record against the other assembly records from the API: check if part already exists but with a different carton code
            let dupePartInAssembly = _.find(completeInspections, otherInspections =>{
                return otherInspections.partCode === eachInspection.partCode && otherInspections.cartonCode !== eachInspection.cartonCode
            });

            if (dupePartInAssembly !== undefined){
                duplicateParts++;
                duplicatePartOutput.write(standardOutput);
                //Prevent duplicate from being written by escaping the forEach
                return false;
            }

            //Check each new assembly record against the other assembly records from the API: check if carton already exists but with a different part code
            let dupeCartonInAssembly = _.find(completeInspections, otherInspections =>{
                return otherInspections.partCode !== eachInspection.partCode && otherInspections.cartonCode === eachInspection.cartonCode
            });

            if (dupeCartonInAssembly !== undefined){
                duplicateCartons++;
                duplicateCartonOutput.write(standardOutput);
                //Prevent duplicate from being written by escaping the forEach
                return false;
            }

            //------Validate against Data already in DB---------

            //Check each new assembly record against DB records: check if part already exists but with a different carton code
            let dupePartInDB = _.find(formattedGetScaleParts, eachGetScalePart =>{
                return eachGetScalePart.part_code === eachInspection.partCode && eachGetScalePart.carton_code !== eachInspection.cartonCode
            });

            if (dupePartInDB !== undefined){
                duplicateParts++;
                duplicatePartOutput.write(standardOutput);
                //Prevent duplicate from being written by escaping the forEach
                return false;
            }

            //Check each new assembly record against DB records: check if carton already exists but with a different part code
            let dupeCartonInDB = _.find(formattedGetScaleParts, eachGetScalePart =>{
                return (eachGetScalePart.part_code !== eachInspection.partCode && eachGetScalePart.carton_code === eachInspection.cartonCode)
            });

            if (dupeCartonInDB !== undefined){
                duplicateCartons++;
                duplicateCartonOutput.write(standardOutput);
                //Prevent duplicate from being written by escaping the forEach
                return false;
            }

            //Check each new assembly record against DB records: check if carton already exists but with a different part code
            let dupeTrackingInDB = _.find(formattedGetScaleParts, eachGetScalePart =>{
                return (eachGetScalePart.part_code !== eachInspection.partCode && eachGetScalePart.return_label_tracking_number === eachInspection.trackingNumber)
            });

            if (dupeTrackingInDB !== undefined){
                duplicateTracking++;
                duplicateTrackingOutput.write(standardOutput);
            }

            //Create insert query and summary
            partsToInsert++;
            insertProductCounts[eachInspection.cartonSku] = (insertProductCounts[eachInspection.cartonSku] || 0) + 1;

            //If we make it here, return true and process that result
            return true;
        })
        .map(eachInspection=>{
            insertQueryOutput.write(`('${eachInspection.partCode}', '${eachInspection.cartonCode}', '${eachInspection.cartonSku}', '${eachInspection.trackingNumber}'),\n`);
            return eachInspection;
    });

    //Filter for "incomplete" inspections and process
    inspections
        .filter(eachInspection=>{
            return eachInspection.isComplete === false
        })
        .forEach(eachInspection=>{
            //Check if that product is in productCounts.  If so increment the count, else start at 0
            incompleteProductCounts[eachInspection.inspectionSku] = (incompleteProductCounts[eachInspection.inspectionSku] || 0) + 1;
            //Output
            workOrderResultsIncompleteOutput.write(`${eachInspection.inspectionSku},${eachInspection.partCode},${eachInspection.cartonCode},${eachInspection.cartonSku},${eachInspection.trackingNumber},${eachInspection.skuMatch}\n`);
        });

    //------Populate work order summary file---------

    workOrderResultsSummaryOutput.write(`Total inspections: ${inspections.length}\n`);
    workOrderResultsSummaryOutput.write(`Total INSERT queries built: ${partsToInsert}\n\n`);
    workOrderResultsSummaryOutput.write(`INSERT queries by SKU:\n`);
    Object.keys(insertProductCounts).forEach(eachProductCountKey=>{
        workOrderResultsSummaryOutput.write(`${eachProductCountKey}: ${insertProductCounts[eachProductCountKey]}\n`);
    });

    workOrderResultsSummaryOutput.write(`\nTotal SKUs already inserted into DB: ${partsAlreadyWritten}\n`);
    workOrderResultsSummaryOutput.write(`Already inserted by SKU:\n\n`);

    //Add product count to the summary file
    Object.keys(alreadyWrittenCounts).forEach(eachWrittenCountKey=>{
        workOrderResultsSummaryOutput.write(`${eachWrittenCountKey}: ${alreadyWrittenCounts[eachWrittenCountKey]}\n`);
    });

    workOrderResultsSummaryOutput.write(`\nTotal SKUs where inspection sku does not match carton sku: ${mismatchedSkus}\n`);
    workOrderResultsSummaryOutput.write(`Complete inspections by SKU:\n\n`);

    //Add product count to the summary file
    Object.keys(completeProductCounts).forEach(eachProductCountKey=>{
        workOrderResultsSummaryOutput.write(`${eachProductCountKey}: ${completeProductCounts[eachProductCountKey]}\n`);
    });

    workOrderResultsSummaryOutput.write(`\nIncomplete inspections by SKU:\n\n`);

    Object.keys(incompleteProductCounts).forEach(eachProductCountKey=>{
        workOrderResultsSummaryOutput.write(`${eachProductCountKey}: ${incompleteProductCounts[eachProductCountKey]}\n`);
    });

    workOrderResultsSummaryOutput.write(`\nDuplicate part count: ${duplicateParts}\n`);
    workOrderResultsSummaryOutput.write(`Duplicate carton count: ${duplicateCartons}\n`);
    workOrderResultsSummaryOutput.write(`Duplicate tracking count: ${duplicateTracking}\n`);

    //console.log('DEBUG dataForInsert ', JSON.stringify(dataForInsert));

    return dataForInsert;
};



module.exports = {
    processWorkOrder
};

