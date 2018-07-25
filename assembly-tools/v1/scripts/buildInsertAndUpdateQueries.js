"use strict";

const assemblyScripts = require('../index');

(async()=>{
    console.log('Initiating buildInsertAndUpdateQueries script');
    await assemblyScripts.buildInsertAndUpdateQueries('2018-06-10', '2018-07-06');
    console.log('Done buildInsertAndUpdateQueries script');
})();






