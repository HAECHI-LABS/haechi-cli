const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const Table = require('cli-table3');
const Web3 = require('web3');
const { execFileSync } = require('child_process');

module.exports = async function(contract, options) {
  const vvispState = JSON.parse(fs.readFileSync('./state.vvisp.json', 'utf-8'));
  const address = vvispState.contracts[contract].address;
  const srcPath = `./contracts/${vvispState.contracts[contract].fileName}`;

  const solcOutput = compile(srcPath);

  const mainAst = solcOutput.sources[srcPath].AST;
  const linearIds = mainAst.nodes
    .find(node =>
      node.name == contract
    )
    .linearizedBaseContracts.reverse();

  const nodesById = getContractNodesById(solcOutput);
  const linearNodes = linearIds.map(id => nodesById[id]);

  const storageTable = parse(linearNodes);

  const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545')); // <-----To Do: set real url configured by user

  for (let i = 0; i < storageTable.length; i++) {
    storageTable[i].push(await web3.eth.getStorageAt(address, i));
  }

  console.log(`Contract: ${contract}`);
  console.log(`Source: ${path.basename(srcPath)}`);
  console.log(`Address: ${address}`);

  flexTable(storageTable);
  console.log(storageTable.toString());

  /**
   * for test
   */
  console.log('< view of real storage for test >');
  const testTable = new Table({ head: ['storage layout']});
  for (let i = 0; i < 16; i++) {
    testTable.push([i.toString().padStart(2, ' ') + '  ' + await web3.eth.getStorageAt(address, i)]);
  }
  flexTable(testTable);
  console.log(testTable.toString());
};

function compile(srcPath) {
  const solcPath = __dirname + '/solc.exe'; // <------To Do: find another way to compile!!
  const params = [srcPath, '--combined-json', 'ast,compact-format'];
  const options = { encoding: 'utf-8' };
  const solcOutput = execFileSync(solcPath, params, options);

  return JSON.parse(solcOutput);
}

function getContractNodesById(solcOutput) {
  return Object.values(solcOutput.sources)
    .reduce((acc, src) => {
      src.AST.nodes
        .filter(node =>
          node.nodeType == 'ContractDefinition'
        )
        .forEach(node =>
          acc[node.id] = node
        );
      return acc;
    }, {});
}

function flexTable(table) {
  table.options.head = table.options.head
    .map(str => str.toLowerCase())
    .map(str => chalk.cyanBright.bold(str))
  table.options.colWidths = [];
  table.options.chars['left-mid'] = '';
  table.options.chars['mid'] = '';
  table.options.chars['right-mid'] = '';
  table.options.chars['mid-mid'] = '';
}

function parse(nodes) {
  var indexMap = {};
  // or remove it
  //delete map[key1];
  // or determine whether a key exists
  //key1 in map;
  //indexMap[key1] = value1;
  var count = 0;

  // Entry Point
  nodes
    .find(node =>
      node.nodeType == "ContractDefinition"
    )
    .nodes
    .forEach(function(v) { // <----------iterate for asts[0], asts[1] ...
      checkType(v);
    });

  function checkType(v, isStruct) {
    if (v.nodeType=="VariableDeclaration") {
        indexingVariable(v, isStruct);
    } else if (v.nodeType=="StructDefinition") {
        indexingStruct(v)
    }
  }

  // function checkType(v, isStruct) {
  //   if (v.typeName.nodeType =="ElementaryTypeName") {
  //     indexingVariable(v, isStruct);
  //   } else if (v.typeName.nodeType == "ArrayTypeName") {
  //     indexingArray(v);
  //   } else if (v.nodeType=="StructDefinition") {
  //     indexingStruct(v)
  //   }
  // }

  function indexingVariable(v, isStruct) {
    if (v.typeName.nodeType == "ArrayTypeName") { // array type
        indexingArray(v);
    } else { // element type
      if (isStruct == null) {
        indexMap[count] = v.name;
      } else {
        indexMap[count] = isStruct+ "." + v.name;
      }
      count++;
    }
  }

  function indexingStruct(v) {
    v.members.forEach(function(v2) {
      checkType(v2, v.name);
    });
  }

  function indexingArray(v) {
    var tmpstring = v.typeDescriptions.typeString;
    tmpstring = tmpstring.split(/[\[\]]/);
    var type = tmpstring[0];

    // Get Array Dimensions
    var dimensions = [];
    for (var i = 1; i < tmpstring.length; i++) {
      if (tmpstring[i] != "") {
        dimensions.push(tmpstring[i]);
      }
    }

    var index = 0;
    string = v.name;
    indexingInnerArray(v, dimensions, string, index);
  }

  function indexingInnerArray(v, dim, string, index) {
    for (var i = 0; i < dim[index]; i++) {
      tmpstring = string + "[" + i + "]"
      if (index < dim.length - 1) {
        indexingInnerArray(v,dim, tmpstring, index + 1)
      } else {
        indexMap[count] = tmpstring
        count++;
      }
    }
  }

  // instantiate
  var table = new Table({
    head: ['VARIABLE', 'INDEX', 'VALUE'],
    colWidths: [25, 25, 25]
  });

  keys = Object.keys(indexMap)
  keys.forEach(function(k) {
    table.push([indexMap[k],k]);
  })

  return table;
}