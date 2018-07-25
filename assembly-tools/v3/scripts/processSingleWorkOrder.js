"use strict";

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
    {shopify_sku: "GOPIX-BK020"},
    {shopify_sku: "GPIXL-BK020"},
    {shopify_sku: "GPIX2-BK020"},
    {shopify_sku: "GP2XL-BK020"}
];

//PURPOSE: process a single Work Order by name:
const workOrderName = '9928';

(async()=>{
    console.log('Initiating processSingleWorkOrder script');

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

    let foundWorkOrder = workOrders.find(eachWorkOrder=>{
        return eachWorkOrder.name === workOrderName
    });

    if (foundWorkOrder === undefined){
        console.log('ERROR, could not find matching work order!');
        return;
    }

    const processWorkOrderResults = await processWorkOrder(foundWorkOrder, getScaleParts, products, codeTypes, skus);

    console.log('Done running processSingleWorkOrder script');
})();



