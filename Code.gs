function onOpen() {
  var ui = SpreadsheetApp.getUi();
    ui.createAddonMenu()
        .addItem('Data validation sidebar', 'showSidebar')
        .addSubMenu(SpreadsheetApp.getUi().createMenu('Annoatte')
           .addItem('Annotate selection', 'annotateSelection')
           .addItem('Annotate column', 'annotateColumn'))
        .addToUi();

}

function showSidebar() {
  
  var html = (HtmlService.createTemplateFromFile('Sidebar').evaluate())
       .setSandboxMode(HtmlService.SandboxMode.IFRAME)
       .setTitle('Data Validation Info')
  SpreadsheetApp.getUi() 
        .showSidebar(html);
}

var faangSampleValidationRulesUrl = 'http://www.ebi.ac.uk/vg/faang/rule_sets/FAANG%20Samples?format=json'

function testRuleByName() {
  getRuleByName("animal","sex");
}

function getRuleByName(sheetName, header) {

  Logger.log("get rule by name: " + sheetName + "/" + header);

  var cache = CacheService.getDocumentCache();
  //cache.remove("validation-rules");
  var cached_rules = cache.get("validation-rules");
  
  var standardRules = new Array();
  var ruleNames = {};
  if (cached_rules == null) {

    Logger.log("reloading rules into cache");
    var rules = getObjectFromUrl(faangSampleValidationRulesUrl)
    var ruleLookup = {};
    for (var x=0; x < rules['rule_groups'].length; x++) {
      var ruleName = rules['rule_groups'][x]['name'];
      var ruleEntries = rules['rule_groups'][x]['rules'];
      
      for (var j = 0; j < ruleEntries.length; j++) {
        var ruleEntry = ruleEntries[j]
        var ruleEntryName = ruleEntry['name'];
        
        // collect the standard rules
        if ( ruleName.indexOf("standard") >= 0 ) {
          standardRules.push(ruleEntry)
        } else {
          ruleNames[ruleName] = 1;
        }
        
        var lookupKey = getKeyForRule(ruleName,ruleEntryName )
        Logger.log('found rule with key - ' + lookupKey)
        ruleLookup[lookupKey] = ruleEntry        
      }
    }
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // add the standard rules to all other rules
    for (var ruleName in ruleNames) {
      for (var x = 0; x< standardRules.length; x++) {
        var ruleEntryName = standardRules[x].name;
        var lookupKey = getKeyForRule(ruleName,ruleEntryName )
        Logger.log('found standard rule with key - ' + lookupKey)
        ruleLookup[lookupKey] =  standardRules[x];        
        
        // if rule entry has valid terms list, create a data validation for 20 rows
        if (standardRules[x].valid_terms.length > 0) {
          var sheet = ss.getSheetByName(ruleName)
          if (sheet) {
            var colNumber = getColumnNrByName(sheet,ruleEntryName); 
            Logger.log('col number' + colNumber)
            var dataValidationRule = SpreadsheetApp.newDataValidation().requireValueInList(standardRules[x].valid_values).build();
            
            sheet.getRange(2, colNumber+1, 20, 1).setDataValidation(dataValidationRule)
          }
        }
      }
    }
    
    cache.put("validation-rules", JSON.stringify(ruleLookup), 1500); // cache for 25 minutes
    Logger.log("loaded rules");
  }
  
  var lookup = getKeyForRule(sheetName, header)
  var rules = JSON.parse(cache.get("validation-rules"));
  var rule = rules[lookup]
  if (rule) {
    Logger.log("selected rule %s", rule.name);
  }
  
  return rule;
}

function getColumnNrByName(sheet, name) {
  var range = sheet.getRange(1, 1, 1, sheet.getMaxColumns());
  var values = range.getValues();
  
  for (var row in values) {
    for (var col in values[row]) {
      if (values[row][col] == name) {
        return parseInt(col);
      }
    }
  }
}

function getKeyForRule (sheetName, header) {
    return sheetName.toLowerCase() + header.toLowerCase();
}

// get top hit for ontology term + score for active cell
function getAnnotationForValue(currentValue) {
  
  var result = getZoomaResult(currentValue);
        
  if (result.length > 0) {
    var conf = result[0].confidence;
    Logger.log("cond %s", conf);
    
    if (result[0].semanticTags.length ==1) {
      return {uri: result[0].semanticTags[0], conf: conf}         
    }
  }
  return  {};
}


function getSelectedCell() {
  // get selected cells
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  // Returns the active range
  var range = sheet.getActiveRange();
  var val = range.getValue();
  
  Logger.log("selected cell: " + val);

  return val;
}

function getCellValidationInfo() {
  // get selected cells
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  // Returns the active range
  var range = sheet.getActiveRange();
  var header = sheet.getRange(1, range.getColumn()).getValue()
  var currentValue = range.getValue();
  return getRuleByName(sheet.getName(), header);  
}

function setCellValue(value) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var range = sheet.getActiveRange();
  
  range.setValue(value);
  
}

/*
function getSelectedColumnKey() {
  // get selected cells
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  // Returns the active range
  var range = sheet.getActiveRange();
  var val = sheet.getRange(1, range.getColumn()).getValue()
  Logger.log("selected header: " + val);
  
  return getKeyForRule(sheet.getName(), val);
}
*/

function requiresValidation(sheetName, header) {
  var rule = getRuleByName(sheetName, header);
  if (rule &&  ( (rule.type == 'ontology_id') || (rule.type == 'ncbi_taxon') ) ) {
    return true;
  }
  return false;
}

var validatedOntologyMappings = {};

function testManualAnnotation() {
 manualAnnotation  ('http://purl.obolibrary.org/obo/NCBITaxon_9606', "ncbitaxon", "all")
}
function manualAnnotation(termIri, ontology, type) {
  
  Logger.log("Manual annoatation requested");
  // get selected cells
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  // Returns the active range
  var range = sheet.getActiveRange();
  var cell = sheet.getActiveCell() 
  var header = sheet.getRange(1, range.getColumn()).getValue();
  var currentValue = cell.getValue();

  var lookupKey = getKeyForRule(sheet.getName(),header) + currentValue;
  
  validatedOntologyMappings[lookupKey] = {'ontology':ontology, 'uri': getFragment(termIri), 'conf':'HIGH', 'source': 'manual'};

  var row = cell.getRow();
  var ontologyColumn = cell.getColumn() + 1;
  var termUriColumn = cell.getColumn() + 2;
  
  sheet.getRange(row, ontologyColumn).setValue(validatedOntologyMappings[lookupKey]['ontology'])
  sheet.getRange(row, termUriColumn).setValue(validatedOntologyMappings[lookupKey]['uri'])
  sheet.getRange(row, cell.getColumn(),1, 3).setBackgroundRGB(223,254,223);
  
  
  if (type == 'all') {
    
    var allValues = sheet.getRange(row, cell.getColumn())
    for (var x = 1; x< sheet.getMaxRows(); x++) {
      var testCell= sheet.getRange(x, cell.getColumn());
      if (!testCell.isBlank()) {
        var testValue =  testCell.getValue();
        if (testCell.getValue() == currentValue) {
          sheet.getRange(x, ontologyColumn).setValue(validatedOntologyMappings[lookupKey]['ontology'])
          sheet.getRange(x, termUriColumn).setValue(validatedOntologyMappings[lookupKey]['uri'])
          sheet.getRange(x, cell.getColumn(),1, 3).setBackgroundRGB(223,254,223);
          
        }
      }
    }
  }
  
}

function getFragment(uri) {
  var n = uri.lastIndexOf('/');
  return uri.substring(n + 1); 
}

function annotateColumn() {
  // get selected cells
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  
  var col = sheet.getActiveCell().getColumn();
  var numRows = sheet.getLastRow();
  
  var range = sheet.getRange(2, col, numRows, 1)

  annotateSelection(range)
}

function annotateSelection(range) {
 
  // get selected cells
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  // Returns the active range
  if (!range) { 
    range = sheet.getActiveRange();
  }
  var numRows = range.getNumRows();
  var numCols = range.getNumColumns();
    
  Logger.log("range selected");
  for (var i = 1; i <= numRows; i++) {
    for (var j = 1; j <= numCols; j++) {
      var currentValue = range.getCell(i,j).getValue();
      
      Logger.log("annotate: " + currentValue);

      // do nothing if empty and is this a column that requires validation? 
      var header = sheet.getRange(1, range.getColumn()).getValue()

      if (currentValue && requiresValidation(sheet.getName(),header)) {

        Logger.log("requires validation: " + currentValue);

        validateCell(range.getCell(i,j), sheet.getName(), header);         
               
      }
    }
  }
  
  showSidebar()

}

function validateCell(cell, sheetName, header) {
  // get selected cells
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  // check if we've already annotated 
  
  var lookupKey = getKeyForRule(sheetName,header) + cell.getValue();
  var row = cell.getRow();
  var ontologyColumn = cell.getColumn() + 1;
  var termUriColumn = cell.getColumn() + 2;
  
  if (!validatedOntologyMappings[lookupKey]) {
    Logger.log("validating: " + cell.getValue());

    var ontology = sheet.getRange(row, ontologyColumn).getValue()
    var termId = sheet.getRange(row, termUriColumn).getValue()
    var validationResponseObject  = false

    // check if the term already has a URI in the adjacent column
    if (termId) {
     // check if the existing URI is valid
     Logger.log("Uri found: " + termId);
     validationResponseObject = validateUri(cell, sheetName, header, termId)
     if (validationResponseObject.isValid) {
       validatedOntologyMappings[lookupKey] = {'ontology':validationResponseObject.ontology, 'uri': validationResponseObject.termId, 'conf':'HIGH', 'source': 'manual'};
     }
    } 
    
    // then hit Zooma
    if (!validationResponseObject.isValid) {
      Logger.log("%s is not valid, hitting Zooma...",cell.getValue() );
      var zoomaResult = getAnnotationForValue(cell.getValue())
      // if it's HIGH conf, then check URI is valid
      termId = zoomaResult.uri;
      validationResponseObject = validateUri(cell, sheetName, header, termId);
      if (validationResponseObject.isValid) {
        validatedOntologyMappings[lookupKey] = {'ontology':validationResponseObject.ontology, 'uri': validationResponseObject.termId, 'conf':zoomaResult.conf, 'source': 'zooma'};

      }
    }
    
    // finally hit OLS
    if (!validationResponseObject.isValid) {
      Logger.log("%s is still not valid, hitting OLS...",cell.getValue() );
      var olsResult = getBestValidatedHitFromOls(cell, sheetName, header, termId );
      if (olsResult.isValid) {
        validatedOntologyMappings[lookupKey] = {'ontology':olsResult.ontology, 'uri': olsResult.termId, 'conf':'MEDIUM', 'source': 'ols'};
      }
    }
  } 

  // finally set the values and highlight the cell depending on output from Zooma
  if (validatedOntologyMappings[lookupKey]) {
    
    // put ontology name and URI into adjacent cells       
    var ontology = sheet.getRange(row, ontologyColumn).setValue(validatedOntologyMappings[lookupKey]['ontology'])
    var termId = sheet.getRange(row, termUriColumn).setValue(validatedOntologyMappings[lookupKey]['uri'])
    // highlight cell
    var conf = validatedOntologyMappings[lookupKey].conf;
    if (conf == "HIGH") {
      sheet.getRange(row, cell.getColumn(),1, 3).setBackgroundRGB(223,254,223);
    }
    else if (conf == "GOOD" || conf == "MEDIUM" || conf == "LOW") {
      sheet.getRange(row, cell.getColumn(),1, 3).setBackgroundRGB(255,252,199);
    }
  } else {
    sheet.getRange(row, cell.getColumn(),1, 3 ).setBackgroundRGB(244,204,204);
  }
  
}


function validateUri(cell, sheetName, header, termUri) {
  
  var rules = getRuleByName(sheetName,header);
  
  for (var x = 0; x< rules['valid_terms'].length; x++) {
    var rule= rules['valid_terms'][x];
    Logger.log("validating: %s against %s, %s, %s ", termUri, rule.term_iri, rule.ontology_name, rule.include_root );
    
    var termId = getValidatedIdFromOls(termUri, rule.term_iri, rule.ontology_name, rule.include_root);
    
    if (termId) {
      Logger.log("%s is already valid!", termUri);
      return {'isValid' : true, 'ontology':  rule.ontology_name, 'termId' : termId} 
    }
  }  
  return {'isValid' : false, 'ontology':  rule.ontology_name};
}

function getBestValidatedHitFromOls(cell, sheetName, header, termUri) {
    var rules = getRuleByName(sheetName,header);
  for (var x = 0; x< rules['valid_terms'].length; x++) {
    var rule= rules['valid_terms'][x];
    Logger.log("validating: %s against %s, %s, %s ", termUri, rule.term_iri, rule.ontology_name, rule.include_root );
    
    var termId = getTopSearchFromOls(cell.getValue(), rule.term_iri, rule.ontology_name, rule.include_root);
    
    if (termId) {
      Logger.log("%s is already valid!", termUri);
      return {'isValid' : true, 'ontology':  rule.ontology_name, 'termId' : termId} 
    }
  }  
}

function getTopSearchFromOls (value,childOf, ontology, includeRoot) {
  var olsUrl = "http://www.ebi.ac.uk/ols/api/search?q="
                + value + "&ontology="
                + ontology.toLowerCase() + "&allChildrenOf=" + childOf;
  
  var olsResult = getObjectFromUrl(olsUrl) 
  var termId;
  if (olsResult.response.numFound > 0) {
    termId = olsResult.response.docs[0].short_form;
  }
  return termId;
}

function getValidatedIdFromOls(id, childOf, ontology, includeRoot) {
  
  
  if (includeRoot && childOf.indexOf("id")>=0) {
    return true;
  }
  
  var olsUrl = "http://www.ebi.ac.uk/ols/api/search?q="
               + id + "&queryFields=iri,short_form,obo_id&exact=true&ontology="
               + ontology.toLowerCase() + "&allChildrenOf=" + childOf;
  
  var olsResult = getObjectFromUrl(olsUrl) 
  var termId;
  if (olsResult.response.numFound > 0) {
    termId = olsResult.response.docs[0].short_form;
  }
  return termId;
}

function getZoomaResult (q) {
  var zoomaUrl = "http://www.ebi.ac.uk/spot/zooma/v2/api/services/annotate?propertyValue=" + q
  
  "&filter=required:[none],ontologies:[efo,mirnao]";
  return getObjectFromUrl(zoomaUrl)          
}




/**
 *
 * Get json from a URL and return as a generic object

 * @param {string} uri The URI of the document server
 * @return {object} new object parsed from JSON
 */
function getObjectFromUrl(uri){
  try {
    var result = UrlFetchApp.fetch(uri).getContentText();
    if (result != null) {
      return JSON.parse(result);
    } else {
      throw new Error("No results from " + uri);
    }
  } catch (e) {
    throw new Error("Can't query " + uri);
  }
}

