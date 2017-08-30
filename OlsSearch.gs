
function testOlsSearch() {
  searchOls("organism", ["OBI"], ["http://www,example.com/097087","http://www,example.com/09708wd27" ])  
}

function searchOls(term) {
  // get rule for selected cell 
  var rule = getCellValidationInfo();
  
  var ontologies = new Array();
  var childrenOf = new Array();
  if (rule) {
    for (var x = 0; x < rule.valid_terms.length; x++) { 
      
      ontologies.push(rule.valid_terms[x].ontology_name.toLowerCase())
      childrenOf.push(rule.valid_terms[x].term_iri)
    }
  }
  
  if (term.length >2) {
    
    var olsUrl = "http://www.ebi.ac.uk/ols/api/search?q="+ term;
    ontologies = unique(ontologies)
    childrenOf = unique(childrenOf)
    if (ontologies.length>0) {
      olsUrl +="&ontology="+ontologies.join(",");
    }
    if (childrenOf.length>0) {
      olsUrl +="&childrenOf="+encodeURI(childrenOf.join(","));
    }
    Logger.log("Querying ols with:" + olsUrl)
    var olsResult = getObjectFromUrl(olsUrl) 
    if (olsResult.response.numFound > 0) {
      return olsResult.response.docs
    }
  }
  return [];
}

function unique(array) {
  var t = {};
  var unique = new Array();
  for (var x = 0; x < array.length; x++) {
    if (!t[array[x]]) {
      t[array[x]]=1; 
      unique.push(array[x])
    }
  }
  return unique
}
