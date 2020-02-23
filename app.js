const fs = require("fs");
const path = require("path");
const os = require("os");
const NodeID3 = require('node-id3');
const request = require("request");
const querystring = require("querystring");
require("dotenv").config();

const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;

function generateRandomString(length) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

function fixMusicFileName(name){
    return name.replace(/\s\.\_/g," ");
}

function getFileMusicInfo(filePath){
    if(path.parse(filePath).ext === ".mp3"){
        let tags = null;
        try {
            tags = NodeID3.read(filePath);
        } catch (error) {
            return {error: "Error reading the file: " + error};
        }
    
        let rawName = fixMusicFileName(path.parse(filePath).name);
        
        if(tags != false){
            if(tags.raw) delete tags.raw;
            return {
                ...tags,
                rawName,
                hasCover: tags.image.imageBuffer.length != 0
            };
        }
    
        return {
            rawName,
            hasCover: false
        };
    }
    else{
        return {error: "Not an MP3 file"};
    }
    
        
}

function addCoverArt(mp3FilePath,coverUrl){
    let tempFilePath = os.tmpdir + path.sep + generateRandomString(5);
    
    let missingCoverTags = {
        APIC: tempFilePath
    };

    let stream = fs.createWriteStream(tempFilePath);
    stream.on("finish",() => {
        try {
            NodeID3.update(missingCoverTags,mp3FilePath);
        } catch (error) {}
        
        fs.unlinkSync(tempFilePath);
    });
    request(coverUrl).pipe(stream);
}

function addTagsToMp3(mp3FilePath, tags, coverUrl){
    
    
    let missingCoverTags = {
        trackNumber: tags.trackNumber,
        title: tags.title,
        performerInfo: tags.performerInfo,
        artist: tags.artist,
        album: tags.album,
        year: tags.year,
        genre: tags.genre,
    };

    if(coverUrl){
        let tempFilePath = os.tmpdir + path.sep + generateRandomString(5);
        missingCoverTags.APIC = tempFilePath;
        let stream = fs.createWriteStream(tempFilePath);
        stream.on("finish",() => {
            try {
                NodeID3.update(missingCoverTags,mp3FilePath);
            } catch (error) {}
            
            fs.unlinkSync(tempFilePath);
        });
        request(coverUrl).pipe(stream);
    }
    else{
        NodeID3.update(missingCoverTags,mp3FilePath);
    }
}

function mergeTags(fileTags,onlineTags,forceUpdate){
    let onlineArtists = onlineTags.artists[0].name;
    for(let i=1; i<onlineTags.artists.length; i++){
        onlineArtists += "; " + onlineTags.artists[i].name;
    }

    if(forceUpdate){
        fileTags.trackNumber = onlineTags.track_number;
        fileTags.title = onlineTags.name;
        fileTags.performerInfo = onlineTags.album.artists[0].name;
        fileTags.artist = onlineArtists;
        fileTags.album = onlineTags.album.name;
        fileTags.year = (onlineTags.album.release_date.split("-"))[0];
    }
    else{
        fileTags.trackNumber = fileTags.trackNumber ? fileTags.trackNumber : onlineTags.track_number;
        fileTags.title = fileTags.title ? fileTags.title : onlineTags.name;
        fileTags.performerInfo = fileTags.performerInfo ? fileTags.performerInfo : onlineTags.album.artists[0].name;
        fileTags.artist = fileTags.artist ? fileTags.artist : onlineArtists;
        fileTags.album = fileTags.album ? fileTags.album : onlineTags.album.name;
        fileTags.year = fileTags.year ? fileTags.year : (onlineTags.album.release_date.split("-"))[0];
    }

    return fileTags;
}

/**
 * Returns a promise which when resolved return an object containing the information of the song
 * @param {String} name - name of the track to search for
 * @param {String} artist - if undefined, only the name will be used
 * @param {String} token - token retrieved through requestSpotifyToken function
 * @returns {Promise} - https://developer.spotify.com/console/get-search-item/?q=pizza&type=track check this out to see the return object structure
 */
function getOnlineMusicInfo(name,artist,token){

    let query;
    //If artist is undefined/null, use only the name
    if(!artist){
        query = querystring.stringify({
            type: "track",
            q: `"${name}"`,
            limit: 1
        });
    }
    else{
        query = querystring.stringify({
            type: "track",
            q: `"${name}" artist:${artist}`,
            limit: 1
        });
    }
    
    console.log(query);


    let options = {
        url: `https://api.spotify.com/v1/search?${query}`,
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        json: true //Automatically parse JSON response
        
    };

    return new Promise((resolve,reject) => {
        request.get(options,(err,res,body) => {
            if(!err && res.statusCode == 200){
                resolve(body.tracks);
            }
            else if(!err && res.statusCode == 429){
                reject({
                    error: "Reached request rate limit",
                    time: res.headers["retry-after"]
                });
            }
            else{
                reject(body);
            }           
        });
    });
};

/**
 * Makes an OAuth request of type Client Credentials Flow to the spotify api
 * Returns a promise which resolves to an object like this one
 * {
 *     "access_token": "NgCXRKc...MzYjw",
 *     "token_type": "bearer",
 *     "expires_in": 3600,
 * }
 * @returns {Promise} 

 */
function requestSpotifyToken() {
    let authString = client_id + ':' + client_secret;
    var authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        headers: {
            'Authorization': 'Basic ' + (Buffer.alloc(authString.length, authString).toString('base64'))
        },
        form: {
            grant_type: 'client_credentials'
        },
        json: true
    };

    return new Promise((resolve, reject) => {
        request.post(authOptions, (err, res, body) => {
            if (!err && res.statusCode == 200) {
                resolve(body);
            }
            else reject(body);
        });
    });


}

//SCRIPT STARTS HERE

var token = null;

function updateFile(file,forceUpdate = false){
    let fileInfo = getFileMusicInfo(file);
    if(fileInfo.error){
        console.log(`Error(${file}): ${fileInfo.error}`);
    }
    else{
        if(!token){
            //No token is set so, befor updating the cover art, we should get a spotify token
            requestSpotifyToken().then(tokenInfo => {
                token = tokenInfo.access_token; //Set global token
                setTimeout(() => {
                    token = null;
                },tokenInfo.expires_in-120); //Set a timeout to invalidate the token when it is expiring (120 seconds befor it is supposed to expire)
    
                //Now let's retrieve the track cover url and informations
                getOnlineMusicInfo(fileInfo.title || fileInfo.rawName,fileInfo.artist,token).then((spotifySearch) => {
                    if(spotifySearch.items.length > 0){
                        let coverUrl = spotifySearch.items[0].album.images[0].url;
                        //Merge the already present tags with the ones returned from Spotify
                        let tags = mergeTags(fileInfo,spotifySearch.items[0],forceUpdate);

                        //addCoverArt(file,coverUrl);
                        addTagsToMp3(file,tags,coverUrl);
                    }
                    else console.log(`No cover found for ${fileInfo.artist} - ${fileInfo.title}`);
                })
                .catch((err) => {
                    console.log(err);
                }); 
                
            })
            .catch((err) => {
                console.log(err);
            }); 
            
        }
        //There's already a token set, we can use that one
        else{
            getOnlineMusicInfo(fileInfo.title,fileInfo.artist,token).then((spotifySearch) => {
                if(spotifySearch.items.length > 0){
                    let coverUrl = spotifySearch.items[0].album.images[0].url;
                    //Merge the already present tags with the ones returned from Spotify
                    let tags = mergeTags(fileInfo,spotifySearch.items[0],forceUpdate);

                    //addCoverArt(file,coverUrl);
                    addTagsToMp3(file,tags,coverUrl);
                }
                else console.log(`No cover found for ${fileInfo.artist} - ${fileInfo.title}`);
            })
            .catch((err) => {
                console.log(err);
            }); 
            
        }
    }
}

async function updateFileAsync(file,forceUpdate = false,forceByName = false){
    let fileInfo = getFileMusicInfo(file);
    if(fileInfo.error){
        console.log(`Error(${file}): ${fileInfo.error}`);
        return -1;
    }
    else{
        if(!token){
            //No token is set so, befor updating the cover art, we should get a spotify token
            try{
                let tokenInfo = await requestSpotifyToken();
                token = tokenInfo.access_token; //Set global token
                setTimeout(() => {
                    token = null;
                },tokenInfo.expires_in-120); //Set a timeout to invalidate the token when it is expiring (120 seconds befor it is supposed to expire)
            }
            catch(err){
                console.log(err);
                return -1;
            }
        }

        //Now let's retrieve the track cover url
        try{
            let spotifySearch;
            if(forceByName || !fileInfo.artist){
                spotifySearch = await getOnlineMusicInfo(fileInfo.rawName,null,token);
            }
            else{
                spotifySearch = await getOnlineMusicInfo(fileInfo.title || fileInfo.rawName,fileInfo.artist,token);
            }
            
            if(spotifySearch.items.length > 0){
                let coverUrl = spotifySearch.items[0].album.images[0].url;
                //If the file already has a cover and we're not forcing the update, set coverUrl to null or undefined so no new cover is downloaded
                if(fileInfo.hasCover && !forceUpdate)
                    coverUrl = null;


                //Merge the already present tags with the ones returned from Spotify
                let tags = mergeTags(fileInfo,spotifySearch.items[0],forceUpdate);

                //addCoverArt(file,coverUrl);
                addTagsToMp3(file,tags,coverUrl);
            }
            else console.log(`No tags found for ${file}`);
        }
        catch(err){
            if(err.time){
                //console.log("RATE LIMITED " + file);
                setTimeout((file,forceUpdate) => {
                    //console.log("RETRYING " + file);
                    updateFileAsync(file,forceUpdate);
                },(err.time+1)*1000,file,forceUpdate);
            }
            else{
                console.log(err);
                return -1;
            }
        }
    }
    return 0;
}

let args = process.argv;

let forceUpdate = args.indexOf("-f");
if(forceUpdate != -1){
    args.splice(forceUpdate,1);
    forceUpdate = true;
}
else{
    forceUpdate = false;
}

let forceByName = args.indexOf("-n");
if(forceByName != -1){
    args.splice(forceByName,1);
    forceByName = true;
}
else{
    forceByName = false;
}

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
                console.log(`Updating ${fileName} ...`);
                updateFileAsync(pathToFix,forceUpdate,forceByName);
            }
            else if(stat.isDirectory()){
                let files = fs.readdirSync(pathToFix);
                for(file of files){
                    filePath = path.resolve(pathToFix,file);
                    let tmpStat = fs.statSync(filePath);
                    if(tmpStat.isFile()){
                        console.log(`Updating ${file} ...`);
                        updateFileAsync(filePath,forceUpdate,forceByName);
                    }
                }
            }
        }
    });
}





