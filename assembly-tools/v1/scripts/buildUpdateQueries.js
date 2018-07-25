"use strict";

const assemblyScripts = require('../index');


//Maximum 30 day range
(async()=>{
    console.log('Initiating buildUpdateQueries script');
    await assemblyScripts.buildUpdateQueries('2018-04-01', '2018-04-15');
    console.log('Done running buildUpdateQueries script');
})();




