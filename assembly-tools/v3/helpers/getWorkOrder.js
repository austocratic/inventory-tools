"use strict";

const _ = require('lodash');
const fs = require('fs');

const assembly = require('../libraries/assembly');

const ASSEMBLY_PREFIX = 'http://d3v.gs/0/';
const USPS_PREFIX_1 = '420940633101';
const USPS_PREFIX_2 = '420662141537';


const getWorkOrder = (workOrder, workOrderResultsData, products) => {

    if (workOrder === undefined){
        console.log('ERROR found an undefined workOrderStatus: ', workOrder.data)
    }

    if (workOrderResultsData.length === 0){
        console.log(`Info: No work order progress for ${workOrder.name}`)
    }

    //TODO THIS IS THE BUG
    /*
    const partCodeType = codeTypes.find(eachCodeType=>{
        return eachCodeType.name === 'AssemblyID' || eachCodeType.name === 'part_code'
    });
    const cartonCodeType = codeTypes.find(eachCodeType=>{
        return eachCodeType.name === 'carton_code'
    });
    const skuCodeType = codeTypes.find(eachCodeType=>{
        return eachCodeType.name === 'sku'
    });
    const trackingNumberCodeType = codeTypes.find(eachCodeType=>{
        return eachCodeType.name === 'return_label_tracking_number'
    });*/

    return workOrderResultsData
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
                number: workOrder.name,
                isComplete: eachInspection.isDone,
                inspectionSku: matchingProduct.sku,
                partCode: '',
                cartonCode: '',
                cartonSku: '',
                trackingNumber: ''
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

                    //Determine if that step had a code scan
                    if (eachInspectionStep.stepResultContent.code) {

                        if (eachInspectionStep.stepResultContent.codeTypeName !== undefined) {

                            switch (eachInspectionStep.stepResultContent.codeTypeName) {
                                case 'AssemblyID':
                                    inspectionResult.partCode = eachInspectionStep.stepResultContent.code.toLowerCase().replace(ASSEMBLY_PREFIX, "");
                                    break;
                                case 'part_code':
                                    inspectionResult.partCode = eachInspectionStep.stepResultContent.code.toLowerCase().replace(ASSEMBLY_PREFIX, "");
                                    break;
                                case 'carton_code':
                                    inspectionResult.cartonCode = eachInspectionStep.stepResultContent.code.toLowerCase().replace(ASSEMBLY_PREFIX, "");
                                    break;
                                case 'sku':
                                    inspectionResult.cartonSku = eachInspectionStep.stepResultContent.code.toUpperCase();
                                    break;
                                case 'return_label_tracking_number':
                                    inspectionResult.trackingNumber = eachInspectionStep.stepResultContent.code.replace(USPS_PREFIX_1, "").replace(USPS_PREFIX_2, "");
                                    break;
                            }
                        } else if (eachInspectionStep.stepResultContent.codeTypeId !== undefined) {

                            switch (eachInspectionStep.stepResultContent.codeTypeId) {
                                case 1:
                                    inspectionResult.partCode = eachInspectionStep.stepResultContent.code.toLowerCase().replace(ASSEMBLY_PREFIX, "");
                                    break;
                                case 8:
                                    inspectionResult.partCode = eachInspectionStep.stepResultContent.code.toLowerCase().replace(ASSEMBLY_PREFIX, "");
                                    break;
                                case 3:
                                    inspectionResult.cartonCode = eachInspectionStep.stepResultContent.code.toLowerCase().replace(ASSEMBLY_PREFIX, "");
                                    break;
                                case 5:
                                    inspectionResult.cartonSku = eachInspectionStep.stepResultContent.code.toUpperCase();
                                    break;
                                case 4:
                                    inspectionResult.trackingNumber = eachInspectionStep.stepResultContent.code.replace(USPS_PREFIX_1, "").replace(USPS_PREFIX_2, "");
                                    break;
                            }
                        } else {
                            console.log(`Warning: a step had a code, but no .codeTypeName, or .codeTypeId. work order: ${workOrder.name} inspection ID: ${eachInspection._id}, index: ${eachInspectionStep.stepIndex}`);
                        }
                    }
                });
            }
            return inspectionResult
        });
};


module.exports = {
    getWorkOrder
};

