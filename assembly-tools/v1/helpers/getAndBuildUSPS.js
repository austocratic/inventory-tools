"use strict";

const _ = require('lodash');
const fs = require('fs');

const allUSPS = fs.createWriteStream("./output/v1/all-USPS.txt");
const updateUSPS = fs.createWriteStream("./output/v1/update-USPS.txt");
const badLabelScans = fs.createWriteStream("./output/v1/bad-USPS.txt");
const duplicateUSPS = fs.createWriteStream("./output/v1/duplicate-USPS.txt");

const ASSEMBLY_PREFIX = 'http://d3v.gs/0/';
const USPS_PREFIX_1 = '420940633101';
const USPS_PREFIX_2 = '\\';
const USPS_PREFIX_3 = 'u0006';

const validateUSPS = numberToValidate => {

    if (isNaN(numberToValidate)) {
        return false
    }

    return numberToValidate.length === 22
};

const cleanUSPS = toClean => {
    return toClean.replace("\\u0006", "").replace(/[\x00-\x1F\x7F-\x9F]/g, "").replace(USPS_PREFIX_1, "").replace(ASSEMBLY_PREFIX, "")
};

//Pass in an array of assembly data
//Returns only the USPS objects from the data
//Logs any USPS # that should be updated
const getAndBuildUSPS = (assemblyData, getScaleParts) =>{
    //Array used to reference for duplicates in data set
    let uspsScans = [];

    //Create an array of all USPS scans
    assemblyData
        //Filter for what appear to be USPS #s
        .filter(eachInspectionResult=>{
            //let formattedCross = eachInspectionResult.cross_scan_id.replace(USPS_PREFIX_1, "").replace(USPS_PREFIX_2, "").replace(USPS_PREFIX_3, "").replace(ASSEMBLY_PREFIX, "").trim();
            let formattedCross = cleanUSPS(eachInspectionResult.cross_scan_id);

            return formattedCross.length > 6;
        })
        //Filter out bad USPS scans and log them
        .filter(eachInspectionResult=>{
            //Remove prefixes
            let formattedScan = eachInspectionResult.scan_id.replace(ASSEMBLY_PREFIX, "");
            //let formattedCross = eachInspectionResult.cross_scan_id.replace(USPS_PREFIX_1, "").replace(USPS_PREFIX_2, "").replace(USPS_PREFIX_3, "").replace(ASSEMBLY_PREFIX, "").trim();
            let formattedCross = cleanUSPS(eachInspectionResult.cross_scan_id);

            //console.log('DEBUG about to validate a usps: ', formattedCross);

            if (!validateUSPS(formattedCross)){
                badLabelScans.write(`${formattedScan},${formattedCross},${eachInspectionResult.sku}\n`);
            } else {
                return eachInspectionResult;
            }
        })
        //Filter out duplicates in data set
        .filter( eachInspectionResult =>{

            //Remove prefixes
            let formattedScan = eachInspectionResult.scan_id.replace(ASSEMBLY_PREFIX, "");
            //let formattedCross = eachInspectionResult.cross_scan_id.replace(USPS_PREFIX_1, "").replace(USPS_PREFIX_2, "").replace(USPS_PREFIX_3, "").replace(ASSEMBLY_PREFIX, "").trim();
            let formattedCross = cleanUSPS(eachInspectionResult.cross_scan_id);


            //Check each new assembly record against the other assembly records from the API: check if carton & part already exist.  This will ensure that only the first occurence is added, log second
            let dupePartInUSPS = _.find(uspsScans, eachScan =>{
                return eachScan.part_code === formattedScan && eachScan.return_label_tracking_number === formattedCross
            });

            //If no duplicate part in data set, return it
            return dupePartInUSPS === undefined;
        })
        //Return as an object
        .map(eachScan => {

            return {
                part_code: eachScan.scan_id.replace(ASSEMBLY_PREFIX, ""),
                carton_code: eachScan.cross_scan_id.replace(ASSEMBLY_PREFIX, ""),
                //return_label_tracking_number: eachScan.cross_scan_id.replace(USPS_PREFIX_1, "").replace(USPS_PREFIX_2, "").replace(USPS_PREFIX_3, "").trim()
                return_label_tracking_number: cleanUSPS(eachScan.cross_scan_id)
            }
        })
        //Check if part exists in DB already. If exists with different USPS # build update query
        //Push into running data set
        .forEach( eachScan =>{

            //Log all tracking numbers
            allUSPS.write(`${eachScan.part_code},${eachScan.return_label_tracking_number}\n`);

            /* TEMPORARILY REMOVING
            //Search if USPS # already exists in DB.  If so, log it and exclude from data set
            let sameUSPS = _.find(getScaleParts, eachGetScalePart =>{
                return eachGetScalePart.return_label_tracking_number === eachScan.return_label_tracking_number;
            });

            if (sameUSPS !== undefined){
                //console.log(`Found a USPS # in Assembly data (${eachScan.return_label_tracking_number}) that already exists in DB!`);
                duplicateUSPS.write(`${eachScan.return_label_tracking_number}\n`);
                return;
            }

            //Check each new assembly record against DB records: check if part already exists but with a different carton code
            let samePartDifferentUSPS = _.find(getScaleParts, eachGetScalePart =>{
                return eachGetScalePart.part_code === eachScan.part_code && eachGetScalePart.return_label_tracking_number !== eachScan.return_label_tracking_number;
            });

            if (samePartDifferentUSPS !== undefined){

                //USPS # is different, but see if it already exists in DB
                let uspsInDB = _.find(getScaleParts, eachGetScalePart =>{
                    return eachGetScalePart.return_label_tracking_number === eachScan.return_label_tracking_number;
                });

                if (uspsInDB !== undefined){
                    //Log but don't add to update query
                    console.log(`Found a USPS # in Assembly data (${eachScan.return_label_tracking_number}) that is different from DB, but USPS already exists in DB with part ${uspsInDB.part_code}`)
                } else {
                    updateUSPS.write(`update get_scale_parts set get_scale_parts.return_label_tracking_number = '${eachScan.return_label_tracking_number}' where get_scale_parts.return_label_tracking_number = '${samePartDifferentUSPS.return_label_tracking_number}';\n`);
                }
            }*/

            uspsScans.push(eachScan)
        });

    return uspsScans;
};


module.exports = {
    getAndBuildUSPS
};