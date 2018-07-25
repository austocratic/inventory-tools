"use strict";

const _ = require('lodash');
const fs = require('fs');

//Helpers
const getAssemblyData = require('./helpers/getAssemblyData').getAssemblyData;
const fetchGetScaleParts = require('./helpers/fetchGetScaleParts').fetchGetScaleParts;
const getAndBuildUSPS = require('./helpers/getAndBuildUSPS').getAndBuildUSPS;


//Output
const allScans = fs.createWriteStream("./output/v1//all-scans.txt");
const insertOutput = fs.createWriteStream("./output/v1/data-for-insert.txt");
const duplicateCartonOutput = fs.createWriteStream("./output/v1/duplicate-cartons.txt");
const duplicatePartOutput = fs.createWriteStream("./output/v1/duplicate-parts.txt");
const duplicatePartAndCarton = fs.createWriteStream("./output/v1/duplicate-parts-cartons.txt");
const invalidQR = fs.createWriteStream("./output/v1/invalid-qr.txt");

const testData = {inspection_results: [
    {
        "sku": "PAD4X-BK000",
        "cross_scan_id": "http://d3v.gs/0/dddddd",
        "scan_id": "http://d3v.gs/0/cccccc"
    },
    {
        "sku": "PAD4X-BK000",
        "cross_scan_id": "http://d3v.gs/0/iiiiii",
        "scan_id": "http://d3v.gs/0/hhhhhh"
    },
    {
        "sku": "PAD4X-BK000",
        "cross_scan_id": "http://d3v.gs/0/nnnnnn",
        "scan_id": "http://d3v.gs/0/mmmmmm"
    },
    {
        "sku": "PAD4X-BK000",
        "cross_scan_id": "http://d3v.gs/0/pppppp",
        "scan_id": "http://d3v.gs/0/oooooo"
    },
    {
        "sku": "PAD4X-BK000",
        "cross_scan_id": "http://d3v.gs/0/rrrrrr",
        "scan_id": "http://d3v.gs/0/qqqqqq"
    },
    {
        "sku": "PAD4X-BK000",
        "cross_scan_id": "http://d3v.gs/0/bbbbbb",
        "scan_id": "http://d3v.gs/0/aaaaaa"
    },
    {
        "sku": "PAD4X-BK000",
        "cross_scan_id": "http://d3v.gs/0/kkkkkk",
        "scan_id": "http://d3v.gs/0/llllll"
    },
    {
        "sku": "PAD4X-BK000",
        "cross_scan_id": "http://d3v.gs/0/nnnnnn",
        "scan_id": "http://d3v.gs/0/mmmmmm"
    },
    {
        "sku": "PAD4X-BK000",
        "cross_scan_id": "http://d3v.gs/0/kkkkkk",
        "scan_id": "http://d3v.gs/0/jjjjjj"
    },
    {
        "sku": "PAD4X-BK000",
        "cross_scan_id": "http://d3v.gs/0/nnnnnn",
        "scan_id": "http://d3v.gs/0/mmmmmm"
    },
    {
        "sku": "PAD4X-BK000",
        "cross_scan_id": "http://d3v.gs/0/gggggg",
        "scan_id": "http://d3v.gs/0/eeeeee"
    },
    {
        "sku": "PAD4X-BK000",
        "cross_scan_id": "http://d3v.gs/0/ffffff",
        "scan_id": "http://d3v.gs/0/eeeeee"
    },
    {
        "sku": "PAD4X-BK000",
        "cross_scan_id": "http://d3v.gs/0/cdrcna",
        "scan_id": "http://d3v.gs/0/cdrmst"
    }
]};

const ASSEMBLY_PREFIX = 'http://d3v.gs/0/';
const USPS_PREFIX = '420940633101\u0006';

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

const getTrackingNumber = (uspsScansOnly, eachRecordToInsert) => {

    let trackingObject = _.find(uspsScansOnly, {'part_code': eachRecordToInsert.scan_id.replace(ASSEMBLY_PREFIX, "")});

    const scan_id = eachRecordToInsert.scan_id.replace(ASSEMBLY_PREFIX, "");

    //If no tracking number found, use the part code
    if (trackingObject === undefined){
        //trackingNumber = scan_id;
        return scan_id
    }

    return trackingObject.return_label_tracking_number;

};

const buildUpdateQueries = async (startDate, endDate) => {

    const results = await getAssemblyData(startDate, endDate);

    const assemblyData = results.data.inspection_results;

    if (assemblyData.length === 0){
        console.log('ERROR: Array is empty');
        return('Empty array')
    }

    //Get get_scale_parts records from DB
    const getScaleParts = await fetchGetScaleParts();

    //Filter the assembly data for USPS only and build USPS update query
    const uspsScansOnly = getAndBuildUSPS(assemblyData, getScaleParts);
};

const buildInsertAndUpdateQueries = async (startDate, endDate, startingNA) => {

    const results = await getAssemblyData(startDate, endDate);

    const assemblyData = results.data.inspection_results;

    if (assemblyData.length === 0){
        console.log('ERROR: Array is empty');
        return('Empty array')
    }

    //Get get_scale_parts records from DB
    const getScaleParts = await fetchGetScaleParts();

    //Make all part_code & carton_code lower case
    let lowerCaseGetScaleParts = getScaleParts.map( eachGetScalePart =>{
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

    //Filter the assembly data for USPS only and build USPS update query
    const uspsScansOnly = getAndBuildUSPS(assemblyData, lowerCaseGetScaleParts);

    //Need to filter the array to exclude USPS records
    let cartonScansOnly = assemblyData
        .filter(eachInspectionResult=>{

            //Remove prefixes
            let formattedCross = eachInspectionResult.cross_scan_id.replace(USPS_PREFIX, "").replace(ASSEMBLY_PREFIX, "");

            //Return cross scans that are 6 digits
            return formattedCross.length === 6

        });

    insertOutput.write(`INSERT INTO get_scale_parts (part_code, carton_code, sku, return_label_tracking_number) VALUES\n`);

    //TODO not a great way to do this.  I use array iterators below and dont reference dataForInsert for actual insert.
    //This is just a place to hold values to be inserted so I can check if a value is already to be inserted
    let dataForInsert = [];

    //Filter out duplicate scans and log those duplicates
    cartonScansOnly
        .filter(eachItem => {

            let scan_id = eachItem.scan_id.replace(ASSEMBLY_PREFIX, "");
            scan_id = scan_id.toLowerCase();
            let carton_id = eachItem.cross_scan_id.replace(ASSEMBLY_PREFIX, "");
            carton_id = carton_id.toLowerCase();

            allScans.write(`${scan_id},${carton_id},${eachItem.sku},${getTrackingNumber(uspsScansOnly, eachItem)}\n`);

            //Default status, if validationStatus remains true after checks, record will be included for writing to DB
            let validationStatus = true;

            //------Validate QR code format---------

            //Check if the codes begin with a valid vendor letter
            let vendorNameFromPart = VENDOR_CODES[scan_id.substring(0, 1)];
            let vendorNameFromCarton = VENDOR_CODES[carton_id.substring(0, 1)];

            //Check if part or carton does not have a valid vendor letter
            if (!vendorNameFromPart || !vendorNameFromCarton){
                //console.log(`Found a letter for a not existent vendor scan_id (${scan_id}) or carton_id (${carton_id})`);
                invalidQR.write(`${scan_id},${carton_id},${eachItem.sku}\n`);
                validationStatus = false;
            }

            let componentNameFromPart = COMPONENT_CODES[scan_id.substring(1, 2)];
            let componentNameFromCarton = COMPONENT_CODES[carton_id.substring(1, 2)];

            //Check if a part or a carton does not have valid component letter
            if (!componentNameFromPart || !componentNameFromCarton){
                //console.log(`Found a letter for a not existent component scan_id (${scan_id}) or carton_id (${carton_id})`);
                invalidQR.write(`${scan_id},${carton_id},${eachItem.sku}\n`);
                validationStatus = false;
            }

            //Check if a carton was scanned as a part or a part scanned as a carton
            if (componentNameFromPart !== COMPONENT_CODES.a || componentNameFromCarton !== COMPONENT_CODES.b) {
                //console.log(`Found a part scanned as a carton or a carton scanned as a part scan_id (${scan_id}) or carton_id (${carton_id})`);
                invalidQR.write(`${scan_id},${carton_id},${eachItem.sku}\n`);
                validationStatus = false;
            }

            //------Validate against other Data from API call---------

            //Check each new assembly record against the other assembly records from the API: check if part already exists but with a different carton code
            let dupePartInAssembly = _.find(cartonScansOnly, eachCartonScansOnly =>{
                return eachCartonScansOnly.scan_id.replace(ASSEMBLY_PREFIX, "") === scan_id && eachCartonScansOnly.cross_scan_id.replace(ASSEMBLY_PREFIX, "") !== carton_id
            });

            if (dupePartInAssembly !== undefined){
                duplicatePartOutput.write(`${scan_id},${carton_id},${eachItem.sku}\n`);
                validationStatus = false;
            }

            //Check each new assembly record against the other assembly records from the API: check if carton already exists but with a different part code
            let dupeCartonInAssembly = _.find(cartonScansOnly, eachCartonScansOnly =>{
                return eachCartonScansOnly.scan_id.replace(ASSEMBLY_PREFIX, "") !== scan_id && eachCartonScansOnly.cross_scan_id.replace(ASSEMBLY_PREFIX, "") === carton_id
            });

            if (dupeCartonInAssembly !== undefined){
                //duplicateCartonOutput.write(`${scan_id},${carton_id},${eachItem.sku}\n`);
                duplicateCartonOutput.write(`${scan_id},${carton_id},${eachItem.sku},${getTrackingNumber(uspsScansOnly, eachItem)}\n`);
                validationStatus = false;
            }

            //Check each new assembly record against the other assembly records from the API: check if carton & part already exist.  This will ensure that only the first occurence is added, log second
            let dupePartAndCartonInAssembly = _.find(dataForInsert, eachDataForInsert =>{
                return eachDataForInsert.scan_id.replace(ASSEMBLY_PREFIX, "") === scan_id && eachDataForInsert.cross_scan_id.replace(ASSEMBLY_PREFIX, "") === carton_id
            });

            if (dupePartAndCartonInAssembly !== undefined){
                duplicatePartAndCarton.write(`${scan_id},${carton_id},${eachItem.sku}\n`);
                validationStatus = false;
            }

            //------Validate against Data already in DB---------

            //Check each new assembly record against DB records: check if part already exists but with a different carton code
            let dupePartInDB = _.find(lowerCaseGetScaleParts, eachGetScalePart =>{
                return eachGetScalePart.part_code === scan_id && eachGetScalePart.carton_code !== carton_id
            });

            if (dupePartInDB !== undefined){
                duplicatePartOutput.write(`${scan_id},${carton_id},${eachItem.sku}\n`);
                validationStatus = false;
            }

            //WORKING HERE
            //Check each new assembly record against DB records: check if carton already exists but with a different part code
            let dupeCartonInDB = _.find(lowerCaseGetScaleParts, eachGetScalePart =>{
                return (eachGetScalePart.part_code !== scan_id && eachGetScalePart.carton_code === carton_id)
            });

            if (dupeCartonInDB !== undefined){
                //console.log(`Found a duplicate carton from the DB: ${scan_id},${carton_id}`);
                duplicateCartonOutput.write(`${scan_id},${carton_id},${eachItem.sku},${getTrackingNumber(uspsScansOnly, eachItem)}\n`);
                validationStatus = false;
            }

            //Check each new assembly record against DB records: check if part AND carton already exists.  If so do not write
            let dupePartAndCartonInDB = _.find(lowerCaseGetScaleParts, eachGetScalePart =>{
                return eachGetScalePart.part_code === scan_id && eachGetScalePart.carton_code === carton_id
            });

            if (dupePartAndCartonInDB !== undefined){
                validationStatus = false;
            }

            dataForInsert.push(eachItem);

            return validationStatus;

        })//Find the scan's associated USPS #, if not, assign a number
        .map( eachRecordToInsert =>{

            /*
            let trackingObject = _.find(uspsScansOnly, {'part_code': eachRecordToInsert.scan_id.replace(ASSEMBLY_PREFIX, "")});

            const scan_id = eachRecordToInsert.scan_id.replace(ASSEMBLY_PREFIX, "");

            let trackingNumber;

            //If no tracking number found, use the part code
            if (trackingObject === undefined){
                trackingNumber = scan_id;
            } else {
                trackingNumber = trackingObject.return_label_tracking_number;
            }*/

            //Replacing above with this
            //let trackingNumber = getTrackingNumber();

            //If no tracking number found, assign the starting NA value and increment that value
            /* OLD METHOD - TO DELETE
            if (trackingObject === undefined){
                trackingNumber = `NA${startingNA}`;
                startingNA++
            } else {
                trackingNumber = trackingObject.return_label_tracking_number
            }*/

            //eachRecordToInsert.return_label_tracking_number = trackingNumber;
            eachRecordToInsert.return_label_tracking_number = getTrackingNumber(uspsScansOnly, eachRecordToInsert);

            return eachRecordToInsert
        })//Write each value to the insert text document
        .forEach( (eachRecordToInsert, index, allRecordsToInsert) =>{

            const scan_id = eachRecordToInsert.scan_id.replace(ASSEMBLY_PREFIX, "");
            const carton_id = eachRecordToInsert.cross_scan_id.replace(ASSEMBLY_PREFIX, "");

            //If last line, insert with a ';' instead of ','
            if (index === allRecordsToInsert.length - 1){
                insertOutput.write(`('${scan_id}', '${carton_id}', '${eachRecordToInsert.sku}', '${eachRecordToInsert.return_label_tracking_number}');\n`);
            } else {
                insertOutput.write(`('${scan_id}', '${carton_id}', '${eachRecordToInsert.sku}', '${eachRecordToInsert.return_label_tracking_number}'),\n`);
            }
    });
};




module.exports = {
    buildUpdateQueries,
    buildInsertAndUpdateQueries
};



