"use strict";

const _ = require('lodash');
const fs = require('fs');

const assembly = require('../controllers/assembly');

const ASSEMBLY_PREFIX = 'http://d3v.gs/0/';
const USPS_PREFIX = '420940633101';


const getWorkOrder = (workOrder, workOrderResultsData, products, codeTypes) => {

    if (workOrder === undefined){
        console.log('ERROR found an undefined workOrderStatus: ', workOrder.data)
    }

    if (workOrderResultsData.length === 0){
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

                    if (eachInspectionStep.stepResultContent.codeTypeId){

                        switch(eachInspectionStep.stepResultContent.codeTypeId) {
                            case partCodeType.id:
                                inspectionResult.partCode = eachInspectionStep.stepResultContent.code.toLowerCase().replace(ASSEMBLY_PREFIX, "");
                                break;
                            case cartonCodeType.id:
                                inspectionResult.cartonCode = eachInspectionStep.stepResultContent.code.toLowerCase().replace(ASSEMBLY_PREFIX, "");
                                break;
                            case skuCodeType.id:
                                inspectionResult.cartonSku = eachInspectionStep.stepResultContent.code.toUpperCase();
                                break;
                            case trackingNumberCodeType.id:
                                inspectionResult.trackingNumber = eachInspectionStep.stepResultContent.code.replace(USPS_PREFIX, "");
                                break;
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

