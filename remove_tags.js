const fs = require("fs");
const path = require("path");
const NodeID3 = require('node-id3');

let args = process.argv;
let pathToFix = args[2] || null;


if(!pathToFix){
    console.log("No file path or directory path provided...");
}
else{
    pathToFix = path.resolve(pathToFix);
    fs.stat(pathToFix,(err,stat) => {
        if(err && err.code == "ENOENT"){
            console.log(`Error, path ${pathToFix} not found`);
        }
        else if(err){
            console.log("Error: " + err.message);
        }
        else{
            if(stat.isFile()){
                let fileName = path.parse(pathToFix).name;
                console.log(`Removing tags from ${fileName} ...`);
                NodeID3.removeTags(pathToFix);
            }
            else if(stat.isDirectory()){
                let files = fs.readdirSync(pathToFix);
                for(file of files){
                    filePath = path.resolve(pathToFix,file);
                    let tmpStat = fs.statSync(filePath);
                    if(tmpStat.isFile()){
                        console.log(`Removing tags from ${file} ...`);
                        NodeID3.removeTags(filePath);
                    }
                }
            }
        }
    });
}